import { dialog, ipcMain, app } from 'electron';
import { scanVideoFiles } from '../utils/video-scanner';
import { FileNode } from '../../types/file-tree';
import path from 'node:path';
import os from 'node:os';

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
 * 注册文件选择对话框 IPC Handler
 */
export function registerDialogHandlers() {
  // 获取默认下载目录
  ipcMain.handle('dialog:get-default-download-path', async (): Promise<string> => {
    return getDefaultDownloadPath();
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

      // 扫描选中的路径并返回文件树
      console.log('[Dialog Handler] 开始扫描文件:', result.filePaths);
      const fileTree = scanVideoFiles(result.filePaths);
      console.log('[Dialog Handler] 扫描完成，文件数:', fileTree.length);
      return fileTree;
    } catch (error) {
      console.error('[Dialog Handler] 文件选择失败:', error);
      throw new Error('文件选择失败，请重试');
    }
  });
}
