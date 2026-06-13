import fs from 'node:fs';
import path from 'node:path';
import { FileNode, VideoMetadata } from '../../types/file-tree';
import { parseVideoMetadata } from '../handlers/metadata-handler';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * 递归扫描目录，收集所有视频文件路径（同步）
 */
function scanDirectoryRecursive(dirPath: string): FileNode | null {
  try {
    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);

    if (stats.isFile()) {
      if (isVideoFile(dirPath)) {
        // 先返回不带元数据的节点，稍后批量异步填充
        return {
          id: dirPath,
          name,
          path: dirPath,
          type: 'file',
          metadata: undefined, // 占位，等待后续填充
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

/**
 * 递归收集所有视频文件节点（深度优先）
 */
function collectVideoNodes(nodes: FileNode[]): FileNode[] {
  const videos: FileNode[] = [];

  function traverse(node: FileNode) {
    if (node.type === 'file') {
      videos.push(node);
    } else if (node.type === 'directory' && node.children) {
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return videos;
}

/**
 * 前置元数据水合（Eager Hydration）
 * 对文件树中所有视频节点并发解析元数据
 */
async function hydrateMetadata(fileTree: FileNode[]): Promise<void> {
  console.log('[video-scanner] 开始前置元数据解析...');
  const videoNodes = collectVideoNodes(fileTree);
  console.log(`[video-scanner] 发现 ${videoNodes.length} 个视频，启动并发解析`);

  // 并发解析所有视频元数据（Promise.allSettled 保证单个失败不影响全局）
  const results = await Promise.allSettled(
    videoNodes.map(async (node) => {
      try {
        const metadata = await parseVideoMetadata(node.path);
        node.metadata = metadata; // 直接修改引用，回填完整元数据
        console.log(`[video-scanner] ✅ ${node.name} 解析完成`);
      } catch (error) {
        console.error(`[video-scanner] ❌ ${node.name} 解析失败:`, error);
        // 解析失败时保留基础信息，避免 UI 显示空白
        node.metadata = {
          size: '-- MB',
          duration: '--:--:--',
          resolution: '--',
        };
      }
    })
  );

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[video-scanner] 元数据解析完成: ${successCount}/${videoNodes.length} 成功`);
}

/**
 * 同步扫描（仅用于兼容性，不推荐使用）
 * @deprecated 使用 scanVideoFilesAsync 替代
 */
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

/**
 * 异步扫描 + 前置元数据水合（推荐）
 * 导入时统一解析所有视频元数据，避免点击懒加载导致的 UI 闪烁
 */
export async function scanVideoFilesAsync(paths: string[]): Promise<FileNode[]> {
  console.log('[video-scanner] 开始异步扫描:', paths);

  // 第一阶段：同步快速扫描文件树结构
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

  // 第二阶段：异步并发解析元数据（前置水合）
  await hydrateMetadata(results);

  console.log('[video-scanner] 扫描完成，文件树节点数:', results.length);
  return results;
}
