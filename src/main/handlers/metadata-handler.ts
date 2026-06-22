import { ipcMain } from 'electron';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { VideoMetadata } from '../../types/file-tree';

/**
 * 延迟初始化 ffprobe 路径（仅在首次使用时计算）
 * 避免在 Electron app 未完全准备好时执行路径计算
 */
let ffprobeInitialized = false;
function ensureFfprobePath(): string {
  if (!ffprobeInitialized) {
    const ffprobePath = getFfprobePath();
    console.log('[metadata-handler] ffprobe 路径:', ffprobePath);
    console.log('[metadata-handler] 文件是否存在:', fs.existsSync(ffprobePath));

    // 同时设置 ffmpeg 和 ffprobe 路径（都指向 ffprobe，因为我们只用 ffprobe）
    ffmpeg.setFfmpegPath(ffprobePath);
    ffmpeg.setFfprobePath(ffprobePath);
    ffprobeInitialized = true;

    return ffprobePath;
  }
  return getFfprobePath();
}

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
  console.log('[parseVideoMetadata] 通过 Worker 池解析:', filePath);

  // 导入 Worker 池管理器
  const { getWorkerPoolManager } = await import('../workers/worker-pool-manager');
  const pool = getWorkerPoolManager();

  // 委托给 Worker 线程池
  return pool.submitTask(filePath);
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
