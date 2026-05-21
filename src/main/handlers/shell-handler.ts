import { ipcMain, shell } from 'electron';
import fs from 'node:fs';

/**
 * 注册 Shell 操作 IPC Handler
 */
export function registerShellHandlers() {
  /**
   * 在资源管理器中显示文件
   */
  ipcMain.on('shell:show-item-in-folder', (_, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        console.error('文件路径无效或文件不存在:', filePath);
        return;
      }

      shell.showItemInFolder(filePath);
    } catch (error) {
      console.error('打开资源管理器失败:', error);
    }
  });
}
