import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { SliceAnalyzeParams, SliceAnalyzeResult, VideoSegment, SliceMode, SliceModeConfig } from '../../types/slice';
import type { BatchSliceGroup } from '../../types/batch';
import { TaskQueue } from '../../utils/taskQueue';

/**
 * 延迟初始化 ffprobe 路径（仅在首次使用时计算）
 * 避免在 Electron app 未完全准备好时执行路径计算
 */
let ffprobePathCache: string | null = null;
function ensureFfprobePath(): string {
  if (!ffprobePathCache) {
    ffprobePathCache = getFfprobePath();
    console.log('[SliceHandler] FFprobe 路径已设置:', ffprobePathCache);
  }
  return ffprobePathCache;
}

/**
 * 获取视频时长（秒）
 * 使用 ffprobe 直接解析视频元数据
 */
async function getVideoDuration(filePath: string): Promise<number> {
  console.log('[getVideoDuration] 通过 Worker 池获取时长:', filePath);

  // 导入 Worker 池管理器
  const { getWorkerPoolManager } = await import('../workers/worker-pool-manager');
  const pool = getWorkerPoolManager();

  // 从完整元数据中提取时长
  const metadata = await pool.submitTask(filePath);

  // 解析格式化的时长字符串（"00:20:00"）为秒数
  const [h, m, s] = metadata.duration.split(':').map(Number);
  return h * 3600 + m * 60 + s;
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
 * 判断哪个模式先到（第一个切点）
 * 支持缓冲与大小限制冲突时的自动调整
 */
function determineFirstReachedMode(
  videoDuration: number,
  fileSizeMB: number,
  modes: SliceModeConfig[],
  useOverlapHandles: boolean,
  overlapDuration: number
): { mode: SliceMode; targetDuration: number; adjusted: boolean } {
  let minCutPoint = Infinity;
  let selectedMode: SliceMode = 'duration';
  let targetDuration = 0;
  let adjusted = false;

  const mbPerSecond = fileSizeMB / videoDuration;

  // 查找是否同时启用按大小模式
  const sizeMode = modes.find(m => m.enabled && m.mode === 'size');
  const sizeLimitMB = sizeMode?.targetValue;

  for (const config of modes) {
    if (!config.enabled) continue;

    if (config.mode === 'duration') {
      let cutPoint = config.targetValue;

      // 如果启用缓冲且有大小限制，检查是否需要调整
      if (useOverlapHandles && overlapDuration > 0 && sizeLimitMB) {
        const durationWithBuffer = cutPoint + 2 * overlapDuration;
        const sizeWithBuffer = durationWithBuffer * mbPerSecond;

        if (sizeWithBuffer > sizeLimitMB) {
          // 需要调整：确保加缓冲后不超过大小限制
          const maxAllowedDuration = sizeLimitMB / mbPerSecond;
          const adjustedCoreDuration = maxAllowedDuration - 2 * overlapDuration;

          if (adjustedCoreDuration > 0 && adjustedCoreDuration < cutPoint) {
            cutPoint = adjustedCoreDuration;
            adjusted = true;
            console.log(`[SliceHandler] 自动调整时长: ${config.targetValue}s → ${cutPoint.toFixed(1)}s (加缓冲后不超过 ${sizeLimitMB} MB)`);
          }
        }
      }

      if (cutPoint < minCutPoint) {
        minCutPoint = cutPoint;
        selectedMode = 'duration';
        targetDuration = cutPoint;
      }
    } else if (config.mode === 'size') {
      const cutPoint = config.targetValue / mbPerSecond;
      if (cutPoint < minCutPoint) {
        minCutPoint = cutPoint;
        selectedMode = 'size';
        targetDuration = cutPoint;
      }
    }
  }

  return { mode: selectedMode, targetDuration, adjusted };
}

/**
 * 检查是否需要切分
 */
function needsSlicing(
  videoDuration: number,
  fileSizeMB: number,
  modes: SliceModeConfig[]
): boolean {
  for (const config of modes) {
    if (!config.enabled) continue;

    if (config.mode === 'duration' && videoDuration > config.targetValue) {
      return true;
    }
    if (config.mode === 'size' && fileSizeMB > config.targetValue) {
      return true;
    }
  }
  return false;
}

/**
 * 预估切片大小
 */
function estimateSegmentSizes(
  segments: VideoSegment[],
  videoDuration: number,
  fileSizeMB: number
): number[] {
  return segments.map(seg => {
    const segmentDuration = seg.endTime - seg.startTime;
    const ratio = segmentDuration / videoDuration;
    return Math.round(fileSizeMB * ratio * 100) / 100;
  });
}

/**
 * 参数格式标准化（向后兼容）
 */
function normalizeParams(params: any): SliceAnalyzeParams {
  if (params.modes && Array.isArray(params.modes)) {
    return params as SliceAnalyzeParams;
  }

  return {
    filePath: params.filePath,
    modes: [
      {
        mode: params.mode,
        targetValue: params.targetValue,
        enabled: true
      }
    ],
    useOverlapHandles: params.useOverlapHandles,
    overlapDuration: params.overlapDuration
  };
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
              duration: slice.endTime - slice.startTime,
              estimatedSize: slice.estimatedSize
            }
          })),
          createdAt: Date.now(),
          appliedMode: result.appliedMode,
          needsSlicing: result.needsSlicing
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
  const normalizedParams = normalizeParams(params);
  const { filePath, modes, useOverlapHandles, overlapDuration } = normalizedParams;

  // 参数验证
  if (overlapDuration < 0 || overlapDuration > 30) {
    throw new Error(`交叠缓冲时长必须在 0-30 秒之间，当前值: ${overlapDuration}`);
  }

  // 文件路径验证
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('文件路径无效或文件不存在');
  }

  // 获取视频时长
  const videoDuration = await getVideoDuration(filePath);
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);

  // 检查是否需要切分
  const needsSlice = needsSlicing(videoDuration, fileSizeMB, modes);

  if (!needsSlice) {
    // 视为单切片
    const segment: VideoSegment = {
      id: 'segment-1',
      startTime: 0,
      endTime: videoDuration,
      label: '切片 1',
      headBuffer: 0,
      tailBuffer: 0,
      estimatedSize: Math.round(fileSizeMB * 100) / 100
    };

    return {
      segments: [segment],
      totalCount: 1,
      videoDuration,
      appliedMode: modes.find(m => m.enabled)?.mode || 'duration',
      needsSlicing: false,
      durationAdjusted: false
    };
  }

  // 确定使用哪个模式（传递缓冲参数用于自动调整）
  const { mode: appliedMode, targetDuration, adjusted } = determineFirstReachedMode(
    videoDuration,
    fileSizeMB,
    modes,
    useOverlapHandles,
    overlapDuration
  );

  // 判断是否应用缓冲（按大小模式不应用）
  const shouldApplyBuffer = useOverlapHandles && appliedMode !== 'size';

  // 执行切分
  const segments = sliceByDuration(
    videoDuration,
    targetDuration,
    shouldApplyBuffer,
    shouldApplyBuffer ? overlapDuration : 0
  );

  // 预估大小
  const estimatedSizes = estimateSegmentSizes(segments, videoDuration, fileSizeMB);
  segments.forEach((seg, i) => {
    seg.estimatedSize = estimatedSizes[i];
  });

  return {
    segments,
    totalCount: segments.length,
    videoDuration,
    appliedMode,
    estimatedSizes,
    needsSlicing: true,
    durationAdjusted: adjusted
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
