import { dialog, ipcMain } from 'electron';
import { scanVideoFiles } from '../utils/video-scanner';
import { FileNode } from '../../types/file-tree';

/**
 * 注册文件选择对话框 IPC Handler
 */
export function registerDialogHandlers() {
  ipcMain.handle('dialog:select-media', async (): Promise<FileNode[]> => {
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
        return [];
      }

      // 扫描选中的路径并返回文件树
      const fileTree = scanVideoFiles(result.filePaths);
      return fileTree;
    } catch (error) {
      console.error('文件选择失败:', error);
      throw new Error('文件选择失败，请重试');
    }
  });
}
