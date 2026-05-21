/**
 * 文件树节点类型
 */
export type FileNodeType = 'file' | 'directory';

/**
 * 视频元数据（深度解析）
 */
export interface VideoMetadata {
  // 基础属性
  size: string; // 文件大小，格式：102.7 MB
  duration: string; // 时长，格式：HH:mm:ss
  resolution: string; // 分辨率，格式：1920x1080

  // 深层属性（ffprobe 解析）
  fps?: string; // 帧率，格式：30 fps 或 29.97 fps
  videoCodec?: string; // 视频编码，如 h264, hevc
  audioCodec?: string; // 音频编码，如 aac，无音频流则为 "无"
  bitrate?: string; // 码率，格式：50 Mbps
  createdAt?: string; // 创建时间，格式：2026-05-20 14:30
}

/**
 * 文件树节点
 */
export interface FileNode {
  /** 节点唯一标识符 */
  id: string;
  /** 文件/文件夹名称 */
  name: string;
  /** 完整路径（操作系统原生格式） */
  path: string;
  /** 节点类型 */
  type: FileNodeType;
  /** 子节点（仅 directory 类型有效） */
  children?: FileNode[];
  /** 视频元数据（存在此字段即表示是视频文件） */
  metadata?: VideoMetadata;
}
