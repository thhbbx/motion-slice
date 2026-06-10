import { FileNode, VideoMetadata } from './file-tree';
import { ImportFilterConfig } from './import-filter';

declare global {
  interface Window {
    motionSlice: {
      selectMediaFiles: () => Promise<FileNode[]>;
      selectMediaFilesWithFilter: (config: ImportFilterConfig) => Promise<{
        fileTree: FileNode[];
        summary: string;
      }>;
      showItemInFolder: (filePath: string) => void;
      getVideoMetadata: (filePath: string) => Promise<VideoMetadata>;
    };
  }
}

export {};
