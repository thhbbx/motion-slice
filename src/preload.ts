import { contextBridge, ipcRenderer } from 'electron';
import { FileNode, VideoMetadata } from './types/file-tree';
import type { SliceAnalyzeParams, SliceAnalyzeResult } from './types/slice';
import type { ExportExecuteParams, ExportProgressEvent } from './types/export';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('motionSlice', {
  /**
   * 打开文件选择对话框，选择视频文件或文件夹
   * @returns 文件树数组
   */
  selectMediaFiles: (): Promise<FileNode[]> => {
    return ipcRenderer.invoke('dialog:select-media');
  },

  /**
   * 在资源管理器中显示文件
   * @param filePath 文件完整路径
   */
  showItemInFolder: (filePath: string): void => {
    ipcRenderer.send('shell:show-item-in-folder', filePath);
  },

  /**
   * 获取视频深度元数据
   * @param filePath 视频文件完整路径
   * @returns 视频元数据（8 个专业参数）
   */
  getVideoMetadata: (filePath: string): Promise<VideoMetadata> => {
    return ipcRenderer.invoke('video:get-metadata', filePath);
  },

  /**
   * 分析视频切片
   * @param params 切片分析参数（文件路径、切分模式、目标值等）
   * @returns 切片分析结果（片段数组、总数、视频时长）
   */
  analyzeSlices: (params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => {
    return ipcRenderer.invoke('analyze-video-slices', params);
  },

  /**
   * 获取默认下载目录
   * @returns 系统默认下载目录路径
   */
  getDefaultDownloadPath: (): Promise<string> => {
    return ipcRenderer.invoke('dialog:get-default-download-path');
  },

  /**
   * 选择输出目录
   * @returns 选中的目录路径，取消则返回 null
   */
  selectOutputDir: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:select-output-dir');
  },

  /**
   * 执行导出任务
   * @param params 导出执行参数（任务 ID 数组、输出目录、格式、质量）
   * @returns 执行结果
   */
  executeExport: (params: ExportExecuteParams): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('export:execute', params);
  },

  /**
   * 监听导出进度事件
   * @param callback 进度回调函数
   */
  onExportProgress: (callback: (event: ExportProgressEvent) => void): void => {
    ipcRenderer.on('export-progress', (_, data) => callback(data));
  },

  /**
   * 移除导出进度监听
   */
  offExportProgress: (): void => {
    ipcRenderer.removeAllListeners('export-progress');
  },
});

declare global {
  interface Window {
    motionSlice: {
      selectMediaFiles: () => Promise<FileNode[]>;
      showItemInFolder: (filePath: string) => void;
      getVideoMetadata: (filePath: string) => Promise<VideoMetadata>;
      analyzeSlices: (params: SliceAnalyzeParams) => Promise<SliceAnalyzeResult>;
      getDefaultDownloadPath: () => Promise<string>;
      selectOutputDir: () => Promise<string | null>;
      executeExport: (params: ExportExecuteParams) => Promise<{ success: boolean }>;
      onExportProgress: (callback: (event: ExportProgressEvent) => void) => void;
      offExportProgress: () => void;
    };
  }
}
