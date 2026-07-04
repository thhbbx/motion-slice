/**
 * 切分模式枚举（可扩展）
 */
export type SliceMode = 'duration' | 'size' | 'scene' | 'silence';

/**
 * 单个切分模式的配置
 */
export interface SliceModeConfig {
  mode: SliceMode;
  targetValue: number;
  enabled: boolean;
}

/**
 * 视频切片片段数据模型
 */
export interface VideoSegment {
  /** 唯一标识符 */
  id: string;
  /** 精确切片起始时间（秒，保留 2 位小数，已应用头部缓冲扩张） */
  startTime: number;
  /** 精确切片结束时间（秒，保留 2 位小数，已应用尾部缓冲扩张） */
  endTime: number;
  /** UI 展示标签，如 "片段 1" */
  label: string;
  /** 头部缓冲实际扩张时长（秒），用于渲染左侧斜纹区域 */
  headBuffer: number;
  /** 尾部缓冲实际扩张时长（秒），用于渲染右侧斜纹区域 */
  tailBuffer: number;
  /** 预估大小（MB） */
  estimatedSize?: number;
}

/**
 * 切片分析请求参数模型（支持多选）
 */
export interface SliceAnalyzeParams {
  /** 视频绝对物理路径 */
  filePath: string;
  /** 切分模式配置数组 */
  modes: SliceModeConfig[];
  /** 是否开启交叠缓冲 (Overlap Handles) */
  useOverlapHandles: boolean;
  /** 交叠缓冲时长（秒，范围 0.0 - 5.0） */
  overlapDuration: number;
}

/**
 * 切片分析响应模型（新增字段）
 */
export interface SliceAnalyzeResult {
  /** 切片片段数组 */
  segments: VideoSegment[];
  /** 总片段数 */
  totalCount: number;
  /** 视频总时长（秒） */
  videoDuration: number;
  /** 实际应用的模式 */
  appliedMode: SliceMode;
  /** 每个切片的预估大小（MB） */
  estimatedSizes?: number[];
  /** 是否真正需要切分 */
  needsSlicing: boolean;
  /** 是否因缓冲与大小冲突自动调整了时长 */
  durationAdjusted?: boolean;
}
