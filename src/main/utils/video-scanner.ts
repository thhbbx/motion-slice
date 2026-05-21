import fs from 'node:fs';
import path from 'node:path';
import { FileNode, VideoMetadata } from '../../types/file-tree';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];

function generateMockMetadata(filePath: string): VideoMetadata {
  const stats = fs.statSync(filePath);
  const sizeInMB = (stats.size / (1024 * 1024)).toFixed(1);

  const durations = ['00:01:23', '00:05:12', '00:02:45', '00:08:30', '00:03:15'];
  const resolutions = ['1920x1080', '3840x2160', '1280x720', '2560x1440'];

  return {
    duration: durations[Math.floor(Math.random() * durations.length)],
    resolution: resolutions[Math.floor(Math.random() * resolutions.length)],
    size: `${sizeInMB} MB`,
  };
}

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

function scanDirectoryRecursive(dirPath: string): FileNode | null {
  try {
    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);

    if (stats.isFile()) {
      if (isVideoFile(dirPath)) {
        return {
          id: dirPath,
          name,
          path: dirPath,
          type: 'file',
          metadata: generateMockMetadata(dirPath),
        };
      }
      return null;
    }

    if (stats.isDirectory()) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(dirPath);
      } catch (error) {
        // 遇到权限错误（如 Windows 特殊文件夹 My Music/My Pictures/My Videos），跳过该目录
        if (error instanceof Error && 'code' in error && (error.code === 'EPERM' || error.code === 'EACCES')) {
          console.warn(`跳过无权限访问的目录: ${dirPath}`);
          return null; // 返回 null，让 pruneEmptyDirectories 自动移除
        }
        throw error; // 其他错误继续抛出
      }

      const children: FileNode[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const node = scanDirectoryRecursive(fullPath);
        if (node) {
          children.push(node);
        }
      }

      return {
        id: dirPath,
        name,
        path: dirPath,
        type: 'directory',
        children,
      };
    }

    return null;
  } catch (error) {
    console.error(`扫描路径失败: ${dirPath}`, error);
    return null;
  }
}

function pruneEmptyDirectories(node: FileNode): FileNode | null {
  if (node.type === 'file') {
    return node;
  }

  if (node.type === 'directory' && node.children) {
    const prunedChildren = node.children
      .map(child => pruneEmptyDirectories(child))
      .filter((child): child is FileNode => child !== null);

    if (prunedChildren.length === 0) {
      return null;
    }

    return {
      ...node,
      children: prunedChildren,
    };
  }

  return null;
}

export function scanVideoFiles(paths: string[]): FileNode[] {
  const results: FileNode[] = [];

  for (const filePath of paths) {
    const node = scanDirectoryRecursive(filePath);
    if (node) {
      const prunedNode = pruneEmptyDirectories(node);
      if (prunedNode) {
        results.push(prunedNode);
      }
    }
  }

  return results;
}
