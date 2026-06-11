/**
 * 批量切片组（树形结构的根节点）
 */
export interface BatchSliceGroup {
  videoId: string;           // 关联的视频 ID
  videoPath: string;         // 视频文件路径
  videoName: string;         // 视频文件名
  slices: BatchSliceItem[];  // 该视频的所有切片
  createdAt: number;         // 创建时间戳
}

/**
 * 批量切片项（树形结构的子节点）
 */
export interface BatchSliceItem {
  id: string;                // 唯一标识
  videoId: string;           // 关联的视频 ID
  label: string;             // 切片标签（如 "片段 1"）
  startTime: number;         // 开始时间（秒）
  endTime: number;           // 结束时间（秒）
  isActive: boolean;         // 是否启用（非破坏性编辑标记）
  metadata?: {
    fileSize?: number;       // 预估文件大小
    duration?: number;       // 时长
  };
}

/**
 * 导出任务队列项（拍平后的一维结构）
 */
export interface ExportTask {
  id: string;                // 任务 ID
  videoPath: string;         // 源视频路径
  videoName: string;         // 视频文件名
  slice: BatchSliceItem;     // 关联的切片数据
  outputPath: string;        // 输出路径
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;          // 进度百分比（0-100）
  error?: string;            // 错误信息
}
