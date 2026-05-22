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
 * @param videoDuration 视频总时长（秒）
 * @param targetDuration 目标切片时长（秒）
 * @param useSmartSilence 是否开启智能断句（当前版本预留）
 * @param tolerance 容差范围（秒）
 * @returns 切片片段数组
 */
function sliceByDuration(
  videoDuration: number,
  targetDuration: number,
  useSmartSilence: boolean,
  tolerance: number
): VideoSegment[] {
  const segments: VideoSegment[] = [];
  let currentTime = 0;
  let segmentIndex = 1;

  while (currentTime < videoDuration) {
    const startTime = Math.round(currentTime * 100) / 100;
    let endTime = Math.min(currentTime + targetDuration, videoDuration);
    endTime = Math.round(endTime * 100) / 100;

    // TODO: 未来在此处集成 FFmpeg silencedetect 实现智能断句
    // if (useSmartSilence) {
    //   endTime = adjustEndTimeBysilence(filePath, endTime, tolerance);
    // }

    segments.push({
      id: `segment-${segmentIndex}`,
      startTime,
      endTime,
      label: `片段 ${segmentIndex}`,
    });

    currentTime = endTime;
    segmentIndex++;
  }

  return segments;
}

/**
 * 按大小切分视频
 * @param videoDuration 视频总时长（秒）
 * @param fileSizeMB 视频文件大小（MB）
 * @param targetSizeMB 目标切片大小（MB）
 * @returns 切片片段数组
 */
function sliceBySize(
  videoDuration: number,
  fileSizeMB: number,
  targetSizeMB: number
): VideoSegment[] {
  // 计算每秒的平均大小
  const mbPerSecond = fileSizeMB / videoDuration;
  // 计算目标时长
  const targetDuration = targetSizeMB / mbPerSecond;

  return sliceByDuration(videoDuration, targetDuration, false, 0);
}

/**
 * 注册视频切片计算 IPC Handler
 */
export function registerSliceHandler() {
  ipcMain.handle('analyze-video-slices', async (_, params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => {
    try {
      const { filePath, mode, targetValue, useSmartSilence, tolerance } = params;

      // 获取视频时长
      const videoDuration = await getVideoDuration(filePath);

      let segments: VideoSegment[];

      if (mode === 'duration') {
        segments = sliceByDuration(videoDuration, targetValue, useSmartSilence, tolerance);
      } else {
        // 按大小切分需要先获取文件大小
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        segments = sliceBySize(videoDuration, fileSizeMB, targetValue);
      }

      return {
        segments,
        totalCount: segments.length,
        videoDuration,
      };
    } catch (error) {
      console.error('切片分析失败:', error);
      throw error;
    }
  });
}
