/**
 * Worker 线程通信类型定义
 */

// 输入消息（从主进程接收）
export interface WorkerTaskMessage {
  type: 'ffprobe-task' | 'shutdown';
  taskId: string;
  filePath?: string;        // ffprobe-task 时必需
  ffprobePath?: string;     // ffprobe-task 时必需
}

// 输出消息（发送给主进程）
export interface WorkerResultMessage {
  type: 'success' | 'error' | 'shutdown-ack';
  taskId: string;
  data?: VideoMetadata;
  error?: string;
}

// 视频元数据类型（与现有定义一致）
export interface VideoMetadata {
  size: string;
  duration: string;
  resolution: string;
  fps: string;
  videoCodec: string;
  audioCodec: string;
  bitrate: string;
  createdAt: string;
}
