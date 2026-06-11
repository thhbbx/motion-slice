import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { SliceAnalyzeParams, SliceAnalyzeResult, VideoSegment } from '../../types/slice';
import type { BatchSliceGroup } from '../../types/batch';
import { TaskQueue } from '../../utils/taskQueue';

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
 * @param useOverlapHandles 是否开启交叠缓冲
 * @param overlapDuration 交叠缓冲时长（秒）
 * @returns 切片片段数组
 */
function sliceByDuration(
  videoDuration: number,
  targetDuration: number,
  useOverlapHandles: boolean,
  overlapDuration: number
): VideoSegment[] {
  const segments: VideoSegment[] = [];
  let currentTime = 0;
  let segmentIndex = 1;

  while (currentTime < videoDuration) {
    // 原始逻辑切片范围（未扩张）
    const logicalStart = Math.round(currentTime * 100) / 100;
    let logicalEnd = Math.min(currentTime + targetDuration, videoDuration);
    logicalEnd = Math.round(logicalEnd * 100) / 100;

    // 初始化实际导出范围（与逻辑范围相同）
    let actualStart = logicalStart;
    let actualEnd = logicalEnd;
    let headBuffer = 0;
    let tailBuffer = 0;

    // 应用交叠缓冲：双向向外扩张
    if (useOverlapHandles && overlapDuration > 0) {
      // 头部向左扩张（不能小于 0）
      const expandedStart = logicalStart - overlapDuration;
      actualStart = Math.max(0, expandedStart);
      headBuffer = logicalStart - actualStart; // 实际扩张了多少

      // 尾部向右扩张（不能超过总时长）
      const expandedEnd = logicalEnd + overlapDuration;
      actualEnd = Math.min(videoDuration, expandedEnd);
      tailBuffer = actualEnd - logicalEnd; // 实际扩张了多少

      // 重新四舍五入到两位小数
      actualStart = Math.round(actualStart * 100) / 100;
      actualEnd = Math.round(actualEnd * 100) / 100;
      headBuffer = Math.round(headBuffer * 100) / 100;
      tailBuffer = Math.round(tailBuffer * 100) / 100;
    }

    segments.push({
      id: `segment-${segmentIndex}`,
      startTime: actualStart,
      endTime: actualEnd,
      label: `片段 ${segmentIndex}`,
      headBuffer,
      tailBuffer,
    });

    // 下一个片段的起始点仍然基于原始逻辑切点（不考虑交叠）
    currentTime = logicalEnd;
    segmentIndex++;
  }

  return segments;
}

/**
 * 按大小切分视频
 * @param videoDuration 视频总时长（秒）
 * @param fileSizeMB 视频文件大小（MB）
 * @param targetSizeMB 目标切片大小（MB）
 * @param useOverlapHandles 是否开启交叠缓冲
 * @param overlapDuration 交叠缓冲时长（秒）
 * @returns 切片片段数组
 */
function sliceBySize(
  videoDuration: number,
  fileSizeMB: number,
  targetSizeMB: number,
  useOverlapHandles: boolean,
  overlapDuration: number
): VideoSegment[] {
  // 计算每秒的平均大小
  const mbPerSecond = fileSizeMB / videoDuration;
  // 计算目标时长
  const targetDuration = targetSizeMB / mbPerSecond;

  return sliceByDuration(videoDuration, targetDuration, useOverlapHandles, overlapDuration);
}

/**
 * 批量视频切片分析处理器
 */
async function handleBatchAnalyze(
  event: Electron.IpcMainInvokeEvent,
  videos: { path: string; id: string; name: string }[],
  params: Omit<SliceAnalyzeParams, 'filePath'>
): Promise<BatchSliceGroup[]> {
  console.log('[SliceHandler] 批量分析请求:', videos.length, '个视频');

  const results: BatchSliceGroup[] = [];
  const queue = new TaskQueue<BatchSliceGroup>(
    (current, total) => {
      event.sender.send('batch-analyze-progress', { current, total });
    },
    (taskId, result) => {
      results.push(result);
    }
  );

  // 将所有视频分析任务入队
  for (const video of videos) {
    queue.enqueue({
      id: video.id,
      execute: async () => {
        const fullParams: SliceAnalyzeParams = {
          ...params,
          filePath: video.path
        };

        const result = await analyzeVideoSlices(fullParams);

        return {
          videoId: video.id,
          videoPath: video.path,
          videoName: video.name,
          slices: result.segments.map((slice, index) => ({
            id: `${video.id}-slice-${index}`,
            videoId: video.id,
            label: slice.label,
            startTime: slice.startTime,
            endTime: slice.endTime,
            isActive: true,
            metadata: {
              duration: slice.endTime - slice.startTime
            }
          })),
          createdAt: Date.now()
        };
      }
    });
  }

  // 串行执行所有任务
  await queue.start();

  console.log('[SliceHandler] 批量分析完成:', results.length, '个结果');
  return results;
}

/**
 * 单视频切片分析（内部函数）
 */
async function analyzeVideoSlices(params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> {
  const { filePath, mode, targetValue, useOverlapHandles, overlapDuration } = params;

  // 参数验证
  if (targetValue <= 0) {
    throw new Error(`目标值必须大于 0，当前值: ${targetValue}`);
  }
  if (overlapDuration < 0 || overlapDuration > 5) {
    throw new Error(`交叠缓冲时长必须在 0-5 秒之间，当前值: ${overlapDuration}`);
  }

  // 文件路径验证
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('文件路径无效或文件不存在');
  }

  // 获取视频时长
  const videoDuration = await getVideoDuration(filePath);

  // 合理性检查：避免生成过多片段
  const estimatedCount = Math.ceil(videoDuration / targetValue);
  if (estimatedCount > 1000) {
    throw new Error(`目标值过小，将生成 ${estimatedCount} 个片段（最多支持 1000 个）`);
  }

  let segments: VideoSegment[];

  if (mode === 'duration') {
    segments = sliceByDuration(videoDuration, targetValue, useOverlapHandles, overlapDuration);
  } else {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`路径不是有效的文件: ${filePath}`);
    }
    const fileSizeMB = stats.size / (1024 * 1024);
    segments = sliceBySize(videoDuration, fileSizeMB, targetValue, useOverlapHandles, overlapDuration);
  }

  return {
    segments,
    totalCount: segments.length,
    videoDuration,
  };
}

/**
 * 注册视频切片计算 IPC Handler
 */
export function registerSliceHandler() {
  // 单视频切片分析
  ipcMain.handle('analyze-video-slices', async (_, params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => {
    try {
      console.log('[SliceHandler] 收到切片分析请求:', params);
      const result = await analyzeVideoSlices(params);
      console.log('[SliceHandler] 生成切片数量:', result.segments.length);
      console.log('[SliceHandler] 前 3 个切片:', result.segments.slice(0, 3));
      return result;
    } catch (error) {
      console.error('切片分析失败:', error);
      throw error;
    }
  });

  // 批量视频切片分析
  ipcMain.handle('batch-analyze-slices', handleBatchAnalyze);
}
