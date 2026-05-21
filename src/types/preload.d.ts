import { FileNode } from './file-tree';

declare global {
  interface Window {
    motionSlice: {
      selectMediaFiles: () => Promise<FileNode[]>;
    };
  }
}

export {};
