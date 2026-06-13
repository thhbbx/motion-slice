import { ipcMain } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { VideoMetadata } from '../../types/file-tree';

// 配置 ffprobe 路径
const ffprobePath = getFfprobePath();
console.log('[metadata-handler] ffprobe 路径:', ffprobePath);
console.log('[metadata-handler] 文件是否存在:', fs.existsSync(ffprobePath));

// 同时设置 ffmpeg 和 ffprobe 路径（都指向 ffprobe，因为我们只用 ffprobe）
ffmpeg.setFfmpegPath(ffprobePath);
ffmpeg.setFfprobePath(ffprobePath);

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 格式化时长为 HH:mm:ss
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 格式化帧率（处理分数形式如 30000/1001）
 */
function formatFrameRate(rFrameRate: string): string {
  if (!rFrameRate) return '30 fps';

  if (rFrameRate.includes('/')) {
    const [num, den] = rFrameRate.split('/').map(Number);
    const fps = num / den;
    // 29.97 保留两位小数，整数帧率取整
    return fps % 1 === 0 ? `${fps} fps` : `${fps.toFixed(2)} fps`;
  }

  return `${parseFloat(rFrameRate)} fps`;
}

/**
 * 格式化码率
 */
function formatBitrate(bps: number): string {
  if (bps < 1000) return `${bps} bps`;
  if (bps < 1000000) return `${(bps / 1000).toFixed(0)} Kbps`;
  return `${(bps / 1000000).toFixed(1)} Mbps`;
}

/**
 * 解析视频元数据
 * 修复 Windows 下 UTF-8/GBK 编码问题
 * 导出供其他模块使用（如导入流程前置解析）
 */
export async function parseVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    // 获取文件统计信息
    const stats = fs.statSync(filePath);

    console.log('[parseVideoMetadata] 开始解析:', filePath);

    // 使用 execFile 直接调用 ffprobe，显式指定 UTF-8 编码
    const args = [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      filePath
    ];

    execFile(ffprobePath, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[parseVideoMetadata] ffprobe 错误:', err.message);
        if (stderr) {
          console.error('[parseVideoMetadata] stderr:', stderr);
        }
        reject(new Error(`ffprobe 解析失败: ${err.message}`));
        return;
      }

      try {
        const metadata = JSON.parse(stdout);
        console.log('[parseVideoMetadata] ffprobe 成功，流数量:', metadata.streams?.length || 0);

        const videoStream = metadata.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
        const audioStream = metadata.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');

        if (!videoStream) {
          reject(new Error('未找到视频流'));
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

        console.log('[parseVideoMetadata] 解析结果:', result);
        resolve(result);
      } catch (parseError) {
        console.error('[parseVideoMetadata] JSON 解析错误:', parseError);
        reject(new Error('ffprobe 输出解析失败'));
      }
    });
  });
}

/**
 * 注册视频元数据解析 IPC Handler
 */
export function registerMetadataHandlers() {
  ipcMain.handle('video:get-metadata', async (_, filePath: string): Promise<VideoMetadata> => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('文件路径无效或文件不存在');
      }

      const metadata = await parseVideoMetadata(filePath);
      return metadata;
    } catch (error) {
      console.error('视频元数据解析失败:', error);
      throw error;
    }
  });
}
