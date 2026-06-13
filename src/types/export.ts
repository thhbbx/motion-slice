/**
 * 导出任务状态
 */
export type ExportTaskStatus = 'pending' | 'processing' | 'success' | 'failed';

/**
 * 导出任务接口（工具无关的统一契约）
 */
export interface ExportTask {
  /** 唯一标识符 */
  id: string;
  /** 来源工具 ID（如 'slicer'） */
  toolId: string;
  /** 任务标题（如 "视频切片导出"） */
  title: string;
  /** 配置摘要文本（如 "按时长 60s 切分，共 12 个片段"） */
  summary: string;
  /** 任务状态 */
  status: ExportTaskStatus;
  /** 供主进程执行的具体数据（工具特定） */
  payload: ExportTaskPayload;
  /** 创建时间戳 */
  createdAt: number;
  /** 错误信息（仅当 status 为 'failed' 时存在） */
  error?: string;
}

/**
 * 导出任务 Payload（工具特定数据）
 */
export interface ExportTaskPayload {
  /** 视频源文件路径 */
  sourceFilePath: string;
  /** 切片数组（仅 slicer 工具使用） */
  segments?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    label: string;
  }>;
  /** 其他工具可扩展字段 */
  [key: string]: unknown;
}

/**
 * 导出队列项（UI 展示用）
 */
export interface ExportQueueItem {
  /** 任务 ID */
  taskId: string;
  /** 任务标题 */
  title: string;
  /** 当前进度（0-100） */
  progress: number;
  /** 状态 */
  status: ExportTaskStatus;
  /** 当前处理的片段索引（可选） */
  currentIndex?: number;
  /** 总片段数（可选） */
  totalCount?: number;
  /** 错误信息（仅当 status 为 'failed' 时存在） */
  error?: string;
}

/**
 * 导出进度事件（主进程 -> 渲染进程）
 */
export interface ExportProgressEvent {
  /** 任务 ID */
  taskId: string;
  /** 当前完成数 */
  current: number;
  /** 总数 */
  total: number;
  /** 当前处理的片段标签 */
  currentLabel?: string;
}

/**
 * 导出执行参数（渲染进程 -> 主进程）
 */
export interface ExportExecuteParams {
  /** 完整任务数组 */
  tasks: ExportTask[];
  /** 输出目录 */
  outputDir: string;
  /** 输出格式 */
  format: 'mp4' | 'mov' | 'avi';
  /** 视频质量（10-100） */
  quality: number;
}
