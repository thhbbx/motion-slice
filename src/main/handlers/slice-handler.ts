import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { SliceAnalyzeParams, SliceAnalyzeResult, VideoSegment } from '../../types/slice';

// 配置 ffprobe 路径
const ffprobePath = getFfprobePath();

/**
 * 获取视频时长（秒）
 * 使用 ffprobe 直接解析视频元数据
 */
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];

    execFile(ffprobePath, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[getVideoDuration] ffprobe 错误:', err.message);
        if (stderr) {
          console.error('[getVideoDuration] stderr:', stderr);
        }
        reject(new Error(`获取视频时长失败: ${err.message}`));
        return;
      }

      try {
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration) || duration <= 0) {
          reject(new Error('视频时长无效'));
          return;
        }
        resolve(duration);
      } catch (parseError) {
        console.error('[getVideoDuration] 解析错误:', parseError);
        reject(new Error('解析视频时长失败'));
      }
    });
  });
}

/**
 * 按时长切分视频
 * @param duration 视频总时长（秒）
 * @param targetDuration 目标切片时长（秒）
 * @param tolerance 容差范围（秒）
 * @param useSmartSilence 是否开启智能断句（当前版本预留）
 * @returns 切片片段数组
 */
function sliceByDuration(
  duration: number,
  targetDuration: number,
  tolerance: number,
  useSmartSilence: boolean
): VideoSegment[] {
  const segments: VideoSegment[] = [];
  let currentTime = 0;
  let segmentIndex = 1;

  // TODO: useSmartSilence 智能断句功能预留，当前版本仅做均匀切分
  if (useSmartSilence) {
    console.log('[sliceByDuration] 智能断句功能暂未实现，将使用均匀切分');
  }

  while (currentTime < duration) {
    const startTime = Math.round(currentTime * 100) / 100;
    let endTime = Math.round((currentTime + targetDuration) * 100) / 100;

    // 最后一个片段：如果剩余时长在容差范围内，合并到当前片段
    if (duration - endTime <= tolerance && duration - endTime > 0) {
      endTime = Math.round(duration * 100) / 100;
    } else if (endTime > duration) {
      endTime = Math.round(duration * 100) / 100;
    }

    segments.push({
      id: `segment-${segmentIndex}`,
      startTime,
      endTime,
      label: `片段 ${segmentIndex}`
    });

    currentTime = endTime;
    segmentIndex++;

    // 防止无限循环
    if (endTime >= duration) {
      break;
    }
  }

  return segments;
}

/**
 * 按大小切分视频
 * @param filePath 视频文件路径
 * @param duration 视频总时长（秒）
 * @param targetSizeMB 目标切片大小（MB）
 * @param tolerance 容差范围（秒）
 * @param useSmartSilence 是否开启智能断句（当前版本预留）
 * @returns 切片片段数组
 */
function sliceBySize(
  filePath: string,
  duration: number,
  targetSizeMB: number,
  tolerance: number,
  useSmartSilence: boolean
): VideoSegment[] {
  // TODO: useSmartSilence 智能断句功能预留，当前版本仅做均匀切分
  if (useSmartSilence) {
    console.log('[sliceBySize] 智能断句功能暂未实现，将使用均匀切分');
  }

  // 读取文件大小
  const stats = fs.statSync(filePath);
  const fileSizeBytes = stats.size;
  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  // 估算每秒的平均大小（MB/s）
  const mbPerSecond = fileSizeMB / duration;

  // 计算目标时长（秒）
  const targetDuration = targetSizeMB / mbPerSecond;

  // 复用按时长切分的逻辑
  return sliceByDuration(duration, targetDuration, tolerance, useSmartSilence);
}

/**
 * 注册视频切片计算 IPC Handler
 */
export function registerSliceHandler() {
  ipcMain.handle('slice:analyze', async (_, params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => {
    try {
      const { filePath, mode, targetValue, useSmartSilence, tolerance } = params;

      // 参数校验
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('文件路径无效或文件不存在');
      }

      if (targetValue <= 0) {
        throw new Error('目标值必须大于 0');
      }

      if (tolerance < 0) {
        throw new Error('容差范围不能为负数');
      }

      console.log('[slice:analyze] 开始分析:', { filePath, mode, targetValue, useSmartSilence, tolerance });

      // 获取视频时长
      const duration = await getVideoDuration(filePath);
      console.log('[slice:analyze] 视频时长:', duration, '秒');

      // 根据模式计算切片
      let segments: VideoSegment[];
      if (mode === 'duration') {
        segments = sliceByDuration(duration, targetValue, tolerance, useSmartSilence);
      } else if (mode === 'size') {
        segments = sliceBySize(filePath, duration, targetValue, tolerance, useSmartSilence);
      } else {
        throw new Error(`不支持的切分模式: ${mode}`);
      }

      const result: SliceAnalyzeResult = {
        segments,
        totalCount: segments.length,
        videoDuration: Math.round(duration * 100) / 100
      };

      console.log('[slice:analyze] 分析完成，片段数:', result.totalCount);
      return result;
    } catch (error) {
      console.error('[slice:analyze] 切片分析失败:', error);
      throw error;
    }
  });
}
