/**
 * 文件树节点类型
 */
export type FileNodeType = 'file' | 'directory';

/**
 * 视频元数据（Mock 数据，未来集成 ffprobe 后替换）
 */
export interface VideoMetadata {
  duration: string; // 格式：HH:MM:SS 或 MM:SS
  resolution: string; // 格式：1920x1080
  size: string; // 格式：125.4 MB
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
