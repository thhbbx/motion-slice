import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import type { FileNode } from '../types/file-tree';
import type { BatchSliceGroup, ExportTask } from '../types/batch';
import { parseTimecode } from '../utils/timeFormat';

export const useVideoStore = defineStore('video', () => {
  const selectedVideos = ref<FileNode[]>([]);
  const focusedVideo = ref<FileNode | null>(null);
  const batchSliceGroups = ref<BatchSliceGroup[]>([]);

  const activeVideo = computed(() =>
    selectedVideos.value.length === 1 ? selectedVideos.value[0] : null
  );

  const isBatchMode = computed(() => selectedVideos.value.length > 1);

  const exportTaskQueue = computed<ExportTask[]>(() => {
    const tasks: ExportTask[] = [];

    for (const group of batchSliceGroups.value) {
      for (const slice of group.slices) {
        // 只导出激活的切片
        if (!slice.isActive) continue;

        tasks.push({
          id: `export-${slice.id}`,
          videoPath: group.videoPath,
          videoName: group.videoName,
          slice: slice,
          outputPath: '', // 由导出流程动态生成
          status: 'pending',
          progress: 0
        });
      }
    }

    return tasks;
  });

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
    // 元数据已在导入时预加载，直接使用
    if (video.metadata?.duration) {
      setDuration(parseTimecode(video.metadata.duration));
    }
  }

  async function setSelectedVideos(videos: FileNode[]) {
    selectedVideos.value = videos;
    if (videos.length === 1) {
      currentTime.value = 0;
      // 元数据已在导入时预加载，直接使用
      if (videos[0].metadata?.duration) {
        setDuration(parseTimecode(videos[0].metadata.duration));
      }
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

  function setFocusedVideo(video: FileNode | null) {
    focusedVideo.value = video;
    console.log('[VideoStore] 聚焦视频:', video?.name || 'null');
  }

  function setBatchSliceGroups(groups: BatchSliceGroup[]) {
    batchSliceGroups.value = groups;
    console.log('[VideoStore] 批量切片组更新:', groups.length);
  }

  function toggleSliceActive(videoId: string, sliceId: string) {
    const group = batchSliceGroups.value.find(g => g.videoId === videoId);
    if (!group) return;

    const slice = group.slices.find(s => s.id === sliceId);
    if (!slice) return;

    slice.isActive = !slice.isActive;
    console.log(`[VideoStore] 切片 ${sliceId} 状态: ${slice.isActive ? '启用' : '禁用'}`);
  }

  return {
    selectedVideos: readonly(selectedVideos),
    focusedVideo: readonly(focusedVideo),
    batchSliceGroups: readonly(batchSliceGroups),
    activeVideo,
    isBatchMode,
    exportTaskQueue,
    isFetchingMetadata,
    currentTime,
    duration,
    setActiveVideo,
    setSelectedVideos,
    setFocusedVideo,
    setBatchSliceGroups,
    toggleSliceActive,
    toggleVideoSelection,
    clearActiveVideo,
    setCurrentTime,
    setDuration,
  };
});
