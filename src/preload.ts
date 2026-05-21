import { contextBridge, ipcRenderer } from 'electron';
import { FileNode } from './types/file-tree';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('motionSlice', {
  /**
   * 打开文件选择对话框，选择视频文件或文件夹
   * @returns 文件树数组
   */
  selectMediaFiles: (): Promise<FileNode[]> => {
    return ipcRenderer.invoke('dialog:select-media');
  },
});
