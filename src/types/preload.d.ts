import { FileNode, VideoMetadata } from './file-tree';

declare global {
  interface Window {
    motionSlice: {
      selectMediaFiles: () => Promise<FileNode[]>;
      showItemInFolder: (filePath: string) => void;
      getVideoMetadata: (filePath: string) => Promise<VideoMetadata>;
    };
  }
}

export {};
