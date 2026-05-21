import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FileNode } from '../types/file-tree';

export const useVideoStore = defineStore('video', () => {
  // 状态：当前激活的视频节点（null 表示未选中任何视频）
  const activeVideo = ref<FileNode | null>(null);

  // Action：设置当前激活的视频
  function setActiveVideo(video: FileNode | null) {
    activeVideo.value = video;
  }

  // Action：清空当前激活的视频
  function clearActiveVideo() {
    activeVideo.value = null;
  }

  return {
    // 状态
    activeVideo,
    // Actions
    setActiveVideo,
    clearActiveVideo,
  };
});
