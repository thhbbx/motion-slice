import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FileNode } from '../types/file-tree';

export const useVideoStore = defineStore('video', () => {
  // 状态：当前激活的视频节点（null 表示未选中任何视频）
  const activeVideo = ref<FileNode | null>(null);

  // 状态：是否正在获取视频元数据
  const isFetchingMetadata = ref(false);

  // Action：设置当前激活的视频并加载深度元数据
  async function setActiveVideo(video: FileNode | null) {
    activeVideo.value = video;

    // 如果选中了视频文件，立即加载深度元数据
    if (video && video.type === 'file' && video.metadata) {
      isFetchingMetadata.value = true;

      try {
        const deepMetadata = await window.motionSlice.getVideoMetadata(video.path);

        // 合并深层元数据到 activeVideo
        if (activeVideo.value?.id === video.id) {
          activeVideo.value.metadata = {
            ...activeVideo.value.metadata,
            ...deepMetadata,
          };
        }
      } catch (error) {
        console.error('加载视频元数据失败:', error);
        // 保持浅层元数据，不阻断用户操作
      } finally {
        isFetchingMetadata.value = false;
      }
    }
  }

  // Action：清空当前激活的视频
  function clearActiveVideo() {
    activeVideo.value = null;
    isFetchingMetadata.value = false;
  }

  return {
    // 状态
    activeVideo,
    isFetchingMetadata,
    // Actions
    setActiveVideo,
    clearActiveVideo,
  };
});
