import { dialog, ipcMain } from 'electron';
import { scanVideoFilesAsync } from '../utils/video-scanner';
import { FileNode } from '../../types/file-tree';
import path from 'node:path';
import os from 'node:os';
import { filterVideoFiles } from '../utils/import-filter';
import type { ImportFilterConfig } from '../../types/import-filter';

/**
 * 获取系统默认下载目录
 */
function getDefaultDownloadPath(): string {
  // Windows: C:\Users\用户名\Downloads
  // macOS: /Users/用户名/Downloads
  // Linux: /home/用户名/Downloads
  const homeDir = os.homedir();
  return path.join(homeDir, 'Downloads');
}

/**
 * 递归收集所有视频节点
 */
function collectVideos(nodes: FileNode[], allVideoPaths: string[]) {
  for (const node of nodes) {
    if (node.type === 'file') {
      allVideoPaths.push(node.path);
    } else if (node.children) {
      collectVideos(node.children, allVideoPaths);
    }
  }
}

/**
 * 过滤文件树，只保留接受的视频
 */
function filterTree(nodes: FileNode[], acceptedSet: Set<string>): FileNode[] {
  return nodes
    .map(node => {
      if (node.type === 'file') {
        return acceptedSet.has(node.path) ? node : null;
      } else if (node.children) {
        const filteredChildren = filterTree(node.children, acceptedSet);
        return filteredChildren.length > 0 ? { ...node, children: filteredChildren } : null;
      }
      return null;
    })
    .filter((node): node is FileNode => node !== null);
}

/**
 * 注册文件选择对话框 IPC Handler
 */
export function registerDialogHandlers() {
  // 获取默认下载目录
  ipcMain.handle('dialog:get-default-download-path', async (): Promise<string> => {
    return getDefaultDownloadPath();
  });

  // 仅选择文件（不扫描）
  ipcMain.handle('dialog:select-files-only', async () => {
    console.log('[Dialog Handler] 收到 select-files-only 请求');
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory', 'multiSelections'],
        title: '选择视频文件或文件夹',
        buttonLabel: '导入',
        filters: [
          { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        console.log('[Dialog Handler] 用户取消或未选择文件');
        return [];
      }

      console.log('[Dialog Handler] 用户选择了文件:', result.filePaths);
      return result.filePaths;
    } catch (error) {
      console.error('[Dialog Handler] 文件选择失败:', error);
      throw new Error('文件选择失败，请重试');
    }
  });

  // 扫描并过滤文件（不包含文件选择）
  ipcMain.handle('video:scan-and-filter', async (event, paths: string[], filterConfig: ImportFilterConfig) => {
    console.log('[Dialog Handler] 收到 scan-and-filter 请求，文件数:', paths.length);
    try {
      // 使用异步扫描（前置元数据解析）
      const fileTree = await scanVideoFilesAsync(paths);

      const allVideoPaths: string[] = [];
      collectVideos(fileTree, allVideoPaths);

      const { accepted, rejected } = await filterVideoFiles(allVideoPaths, filterConfig);

      const acceptedSet = new Set(accepted);
      const filteredTree = filterTree(fileTree, acceptedSet);
      const summary = `成功导入 ${accepted.length} 个视频，按规则过滤掉 ${rejected.length} 个`;

      return { fileTree: filteredTree, summary };
    } catch (error) {
      console.error('[Dialog Handler] 扫描和过滤失败:', error);
      throw new Error('扫描和过滤失败，请重试');
    }
  });

  ipcMain.handle('dialog:select-media', async (): Promise<FileNode[]> => {
    console.log('[Dialog Handler] 收到 select-media 请求');
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory', 'multiSelections'],
        title: '选择视频文件或文件夹',
        buttonLabel: '导入',
        filters: [
          { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      console.log('[Dialog Handler] 对话框结果:', result);

      if (result.canceled || result.filePaths.length === 0) {
        console.log('[Dialog Handler] 用户取消或未选择文件');
        return [];
      }

      // 扫描选中的路径并返回文件树（前置元数据解析）
      console.log('[Dialog Handler] 开始扫描文件:', result.filePaths);
      const fileTree = await scanVideoFilesAsync(result.filePaths);
      console.log('[Dialog Handler] 扫描完成，文件数:', fileTree.length);
      return fileTree;
    } catch (error) {
      console.error('[Dialog Handler] 文件选择失败:', error);
      throw new Error('文件选择失败，请重试');
    }
  });

  ipcMain.handle('dialog:select-media-with-filter', async (event, filterConfig: ImportFilterConfig) => {
    console.log('[Dialog Handler] 收到 select-media-with-filter 请求');
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory', 'multiSelections'],
        title: '选择视频文件或文件夹',
        buttonLabel: '导入',
        filters: [
          { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { fileTree: [], summary: '' };
      }

      // 使用异步扫描（前置元数据解析）
      const fileTree = await scanVideoFilesAsync(result.filePaths);

      const allVideoPaths: string[] = [];
      collectVideos(fileTree, allVideoPaths);

      const { accepted, rejected } = await filterVideoFiles(allVideoPaths, filterConfig);

      const acceptedSet = new Set(accepted);
      const filteredTree = filterTree(fileTree, acceptedSet);
      const summary = `成功导入 ${accepted.length} 个视频，按规则过滤掉 ${rejected.length} 个`;

      return { fileTree: filteredTree, summary };
    } catch (error) {
      console.error('[Dialog Handler] 文件选择失败:', error);
      throw new Error('文件选择失败，请重试');
    }
  });
}
