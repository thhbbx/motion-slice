import { contextBridge, ipcRenderer } from 'electron';
import { FileNode, VideoMetadata } from './types/file-tree';
import type { SliceAnalyzeParams, SliceAnalyzeResult } from './types/slice';
import type { ExportExecuteParams, ExportExecuteResult, ExportProgressEvent } from './types/export';
import type { ImportFilterConfig } from './types/import-filter';
import type { BatchSliceGroup } from './types/batch';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('motionSlice', {
  /**
   * 打开文件选择对话框，选择视频文件或文件夹
   * @returns 文件树数组
   */
  selectMediaFiles: (): Promise<FileNode[]> => {
    return ipcRenderer.invoke('dialog:select-media');
  },

  selectMediaFilesWithFilter: (config: ImportFilterConfig): Promise<{ fileTree: FileNode[]; summary: string }> => {
    return ipcRenderer.invoke('dialog:select-media-with-filter', config);
  },

  /**
   * 仅选择文件（不扫描元数据）
   * @param config 过滤配置
   * @returns 文件路径数组，用户取消则返回空数组
   */
  selectFilesOnly: (): Promise<string[]> => {
    return ipcRenderer.invoke('dialog:select-files-only');
  },

  /**
   * 扫描并过滤视频文件
   * @param paths 文件路径数组
   * @param config 过滤配置
   * @returns 文件树和摘要
   */
  scanAndFilterVideos: (paths: string[], config: ImportFilterConfig): Promise<{ fileTree: FileNode[]; summary: string }> => {
    return ipcRenderer.invoke('video:scan-and-filter', paths, config);
  },

  /**
   * 在资源管理器中显示文件
   * @param filePath 文件完整路径
   */
  showItemInFolder: (filePath: string): void => {
    ipcRenderer.send('shell:show-item-in-folder', filePath);
  },

  /**
   * 打开目录（进入目录内部）
   * @param dirPath 目录完整路径
   */
  openDirectory: (dirPath: string): Promise<string> => {
    return ipcRenderer.invoke('shell:open-directory', dirPath);
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
   * 批量分析视频切片
   * @param videos 视频列表（路径、ID、名称）
   * @param params 切片分析参数（切分模式、目标值等，不含文件路径）
   * @returns 批量切片组数组
   */
  batchAnalyzeSlices: (
    videos: { path: string; id: string; name: string }[],
    params: Omit<SliceAnalyzeParams, 'filePath'>
  ): Promise<BatchSliceGroup[]> => {
    return ipcRenderer.invoke('batch-analyze-slices', videos, params);
  },

  /**
   * 监听批量分析进度
   * @param callback 进度回调函数
   */
  onBatchAnalyzeProgress: (callback: (event: { current: number; total: number }) => void): void => {
    ipcRenderer.on('batch-analyze-progress', (_, data) => callback(data));
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
  executeExport: (params: ExportExecuteParams): Promise<ExportExecuteResult> => {
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
      selectMediaFilesWithFilter: (config: ImportFilterConfig) => Promise<{ fileTree: FileNode[]; summary: string }>;
      showItemInFolder: (filePath: string) => void;
      openDirectory: (dirPath: string) => Promise<string>;
      getVideoMetadata: (filePath: string) => Promise<VideoMetadata>;
      analyzeSlices: (params: SliceAnalyzeParams) => Promise<SliceAnalyzeResult>;
      batchAnalyzeSlices: (
        videos: { path: string; id: string; name: string }[],
        params: Omit<SliceAnalyzeParams, 'filePath'>
      ) => Promise<BatchSliceGroup[]>;
      onBatchAnalyzeProgress: (callback: (event: { current: number; total: number }) => void) => void;
      getDefaultDownloadPath: () => Promise<string>;
      selectOutputDir: () => Promise<string | null>;
      executeExport: (params: ExportExecuteParams) => Promise<ExportExecuteResult>;
      onExportProgress: (callback: (event: ExportProgressEvent) => void) => void;
      offExportProgress: () => void;
    };
  }
}
