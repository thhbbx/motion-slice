import { defineStore } from 'pinia';
import { ref, computed, readonly, watch } from 'vue';
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

  /**
   * 重置工作区状态（导入新视频时调用）
   */
  function reset() {
    selectedVideos.value = [];
    focusedVideo.value = null;
    batchSliceGroups.value = [];
    currentTime.value = 0;
    duration.value = 0;
    console.log('[VideoStore] 工作区状态已重置');
  }

  // ========== 状态依赖生命周期管理 ==========
  // 监听视频选择变化，自动清理孤儿状态
  watch(
    () => selectedVideos.value,
    async (newVideos, oldVideos) => {
      // 导入其他 Store（使用动态 import 避免循环依赖）
      const { useSliceStore } = await import('./useSliceStore');
      const { useExportStore } = await import('./useExportStore');
      const sliceStore = useSliceStore();
      const exportStore = useExportStore();

      // 场景 1: 单视频模式切换（从视频 A 切换到视频 B）
      if (newVideos.length === 1 && oldVideos && oldVideos.length === 1) {
        const oldVideoId = oldVideos[0].id;
        const newVideoId = newVideos[0].id;

        if (oldVideoId !== newVideoId) {
          console.log('[VideoStore] 单视频切换: %s → %s，清理旧数据', oldVideos[0].name, newVideos[0].name);

          // 清理单视频模式的切片数据
          sliceStore.reset();

          // 清理单视频模式的导出任务
          exportStore.clearTasks();
        }
      }

      // 场景 2: 从单视频模式切换到批量模式
      if (newVideos.length > 1 && oldVideos && oldVideos.length === 1) {
        console.log('[VideoStore] 从单视频切换到批量模式，清理单视频数据');
        sliceStore.reset();
        exportStore.clearTasks();
      }

      // 场景 3: 从批量模式切换到单视频模式
      if (newVideos.length === 1 && oldVideos && oldVideos.length > 1) {
        console.log('[VideoStore] 从批量模式切换到单视频，清理批量数据');
        batchSliceGroups.value = [];
        exportStore.clearTasks();
      }

      // 场景 4: 批量模式下取消选择某些视频
      if (newVideos.length > 1 && oldVideos && oldVideos.length > 1) {
        const newVideoIds = new Set(newVideos.map(v => v.id));
        const removedVideos = oldVideos.filter(v => !newVideoIds.has(v.id));

        if (removedVideos.length > 0) {
          console.log('[VideoStore] 批量模式取消选择 %d 个视频，清理相关数据', removedVideos.length);

          // 从批量切片组中移除
          const removedVideoIds = new Set(removedVideos.map(v => v.id));
          batchSliceGroups.value = batchSliceGroups.value.filter(group =>
            !removedVideoIds.has(group.videoId)
          );

          // 从导出队列中移除相关任务（通过 videoPath 匹配）
          const removedVideoPaths = new Set(removedVideos.map(v => v.path));
          const tasksToRemove = exportStore.pendingTasks.filter(task =>
            task.payload?.sourceFilePath && removedVideoPaths.has(task.payload.sourceFilePath)
          );

          tasksToRemove.forEach(task => {
            exportStore.removeTask(task.id);
            console.log('[VideoStore] 移除导出任务:', task.id, '来源:', task.title);
          });
        }
      }

      // 场景 5: 清空所有选择
      if (newVideos.length === 0 && oldVideos && oldVideos.length > 0) {
        console.log('[VideoStore] 清空所有选择，清理所有数据');
        sliceStore.reset();
        exportStore.clearTasks();
        batchSliceGroups.value = [];
      }
    },
    { deep: true }
  );

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
    reset,
  };
});
