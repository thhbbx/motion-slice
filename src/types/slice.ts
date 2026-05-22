/**
 * 视频切片片段数据模型
 */
export interface VideoSegment {
  /** 唯一标识符 */
  id: string;
  /** 精确切片起始时间（秒，保留 2 位小数） */
  startTime: number;
  /** 精确切片结束时间（秒，保留 2 位小数） */
  endTime: number;
  /** UI 展示标签，如 "片段 1" */
  label: string;
}

/**
 * 切片分析请求参数模型
 */
export interface SliceAnalyzeParams {
  /** 视频绝对物理路径 */
  filePath: string;
  /** 切分模式：按时长或按大小 */
  mode: 'duration' | 'size';
  /** 目标值（秒 或 MB） */
  targetValue: number;
  /** 是否开启智能断句微调 */
  useSmartSilence: boolean;
  /** 容差范围（秒） */
  tolerance: number;
}

/**
 * 切片分析响应模型
 */
export interface SliceAnalyzeResult {
  /** 切片片段数组 */
  segments: VideoSegment[];
  /** 总片段数 */
  totalCount: number;
  /** 视频总时长（秒） */
  videoDuration: number;
}
