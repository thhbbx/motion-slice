import { parentPort } from 'worker_threads';
import { execFile, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import type { WorkerTaskMessage, WorkerResultMessage, VideoMetadata } from '../../types/worker';

// 保持当前执行的子进程引用，用于强制终止
let currentChildProcess: ChildProcess | null = null;

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// 格式化时长为 HH:mm:ss
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 格式化帧率
function formatFrameRate(rFrameRate: string): string {
  if (!rFrameRate) return '30 fps';

  if (rFrameRate.includes('/')) {
    const [num, den] = rFrameRate.split('/').map(Number);
    const fps = num / den;
    return fps % 1 === 0 ? `${fps} fps` : `${fps.toFixed(2)} fps`;
  }

  return `${parseFloat(rFrameRate)} fps`;
}

// 格式化码率
function formatBitrate(bps: number): string {
  if (bps < 1000) return `${bps} bps`;
  if (bps < 1000000) return `${(bps / 1000).toFixed(0)} Kbps`;
  return `${(bps / 1000000).toFixed(1)} Mbps`;
}

async function handleFfprobeTask(msg: WorkerTaskMessage): Promise<void> {
  const { taskId, filePath, ffprobePath } = msg;

  if (!filePath || !ffprobePath) {
    sendError(taskId, '缺少必需参数：filePath 或 ffprobePath');
    return;
  }

  try {
    // 验证文件是否存在
    if (!fs.existsSync(filePath)) {
      sendError(taskId, '文件路径无效或文件不存在');
      return;
    }

    // 获取文件统计信息
    const stats = fs.statSync(filePath);

    // 调用 ffprobe
    const args = [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      filePath
    ];

    // 保存子进程引用用于强制终止
    currentChildProcess = execFile(
      ffprobePath,
      args,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // 清空子进程引用
        currentChildProcess = null;

        if (err) {
          console.error(`[FFprobeWorker] ffprobe 错误:`, err.message);
          sendError(taskId, `ffprobe 解析失败: ${err.message}`);
          return;
        }

        try {
          const metadata = JSON.parse(stdout);
          const videoStream = metadata.streams?.find((s: any) => s.codec_type === 'video');
          const audioStream = metadata.streams?.find((s: any) => s.codec_type === 'audio');

          if (!videoStream) {
            sendError(taskId, '未找到视频流');
            return;
          }

          const result: VideoMetadata = {
            size: formatFileSize(stats.size),
            duration: formatDuration(parseFloat(metadata.format?.duration || '0')),
            resolution: `${videoStream.width}x${videoStream.height}`,
            fps: formatFrameRate(videoStream.r_frame_rate || '30/1'),
            videoCodec: videoStream.codec_name || 'unknown',
            audioCodec: audioStream ? audioStream.codec_name : '无',
            bitrate: formatBitrate(parseInt(metadata.format?.bit_rate || '0', 10)),
            createdAt: stats.birthtime.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).replace(/\//g, '-'),
          };

          sendSuccess(taskId, result);
        } catch (parseError) {
          console.error(`[FFprobeWorker] JSON 解析错误:`, parseError);
          sendError(taskId, 'ffprobe 输出解析失败');
        }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendError(taskId, `任务执行失败: ${errorMessage}`);
  }
}

function sendSuccess(taskId: string, data: VideoMetadata): void {
  const msg: WorkerResultMessage = {
    type: 'success',
    taskId,
    data
  };
  parentPort!.postMessage(msg);
}

function sendError(taskId: string, error: string): void {
  const msg: WorkerResultMessage = {
    type: 'error',
    taskId,
    error
  };
  parentPort!.postMessage(msg);
}

function handleShutdown(taskId: string): void {
  console.log(`[FFprobeWorker] 收到 shutdown 信号，准备退出...`);

  // 强制终止正在执行的 ffprobe 子进程
  if (currentChildProcess) {
    console.log(`[FFprobeWorker] 终止正在执行的 ffprobe 子进程`);
    try {
      // Windows 使用 SIGKILL，Linux/macOS 使用 SIGTERM
      currentChildProcess.kill(process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM');
    } catch (error) {
      console.error(`[FFprobeWorker] 终止子进程失败:`, error);
    }
    currentChildProcess = null;
  }

  // 返回确认消息
  const msg: WorkerResultMessage = {
    type: 'shutdown-ack',
    taskId
  };
  parentPort!.postMessage(msg);

  // 退出 Worker 进程
  console.log(`[FFprobeWorker] Worker 已优雅退出`);
  process.exit(0);
}

// 监听来自主进程的消息
if (!parentPort) {
  throw new Error('此脚本必须作为 Worker 线程运行');
}

parentPort.on('message', async (msg: WorkerTaskMessage) => {
  console.log(`[FFprobeWorker] 收到消息:`, msg.type, msg.taskId);

  // 处理优雅关闭信号
  if (msg.type === 'shutdown') {
    handleShutdown(msg.taskId);
    return;
  }

  // 处理 ffprobe 任务
  if (msg.type === 'ffprobe-task') {
    await handleFfprobeTask(msg);
    return;
  }
});

console.log('[FFprobeWorker] Worker 已启动，等待任务');
