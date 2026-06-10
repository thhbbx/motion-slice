import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FileNode } from '../types/file-tree';
import { parseTimecode } from '../utils/timeFormat';

export const useVideoStore = defineStore('video', () => {
  const selectedVideos = ref<FileNode[]>([]);

  const activeVideo = computed(() =>
    selectedVideos.value.length === 1 ? selectedVideos.value[0] : null
  );

  const isFetchingMetadata = ref(false);
  const currentTime = ref<number>(0);
  const duration = ref<number>(0);

  async function setActiveVideo(video: FileNode | null) {
    if (!video) {
      selectedVideos.value = [];
      currentTime.value = 0;
      duration.value = 0;
      return;
    }
    selectedVideos.value = [video];
    currentTime.value = 0;
    await loadVideoMetadata(video);
  }

  async function setSelectedVideos(videos: FileNode[]) {
    selectedVideos.value = videos;
    if (videos.length === 1) {
      currentTime.value = 0;
      await loadVideoMetadata(videos[0]);
    } else {
      currentTime.value = 0;
      duration.value = 0;
    }
  }

  function toggleVideoSelection(video: FileNode) {
    const index = selectedVideos.value.findIndex(v => v.id === video.id);
    if (index >= 0) {
      selectedVideos.value.splice(index, 1);
    } else {
      selectedVideos.value.push(video);
    }
  }

  async function loadVideoMetadata(video: FileNode) {
    if (!video || video.type !== 'file') return;

    isFetchingMetadata.value = true;
    try {
      const deepMetadata = await window.motionSlice.getVideoMetadata(video.path);
      const target = selectedVideos.value.find(v => v.id === video.id);
      if (target) {
        Object.assign(target, {
          metadata: { ...target.metadata, ...deepMetadata }
        });
        if (deepMetadata.duration) {
          setDuration(parseTimecode(deepMetadata.duration));
        }
      }
    } catch (error) {
      console.error('加载元数据失败:', error);
    } finally {
      isFetchingMetadata.value = false;
    }
  }

  function clearActiveVideo() {
    selectedVideos.value = [];
    currentTime.value = 0;
    duration.value = 0;
  }

  function setCurrentTime(time: number) {
    currentTime.value = Math.max(0, Math.min(time, duration.value));
  }

  function setDuration(dur: number) {
    duration.value = Math.max(0, dur);
    if (currentTime.value > duration.value) {
      currentTime.value = duration.value;
    }
  }

  return {
    selectedVideos,
    activeVideo,
    isFetchingMetadata,
    currentTime,
    duration,
    setActiveVideo,
    setSelectedVideos,
    toggleVideoSelection,
    clearActiveVideo,
    setCurrentTime,
    setDuration,
  };
});
