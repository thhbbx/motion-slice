import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import type { FileNode } from '../types/file-tree';
import type { BatchSliceGroup, BatchExportTask } from '../types/batch';
import { parseTimecode } from '../utils/timeFormat';

export const useVideoStore = defineStore('video', () => {
  const selectedVideos = ref<FileNode[]>([]);
  const focusedVideo = ref<FileNode | null>(null);
  const batchSliceGroups = ref<BatchSliceGroup[]>([]);

  const activeVideo = computed(() =>
    selectedVideos.value.length === 1 ? selectedVideos.value[0] : null
  );

  const isBatchMode = computed(() => selectedVideos.value.length > 1);

  const exportTaskQueue = computed<BatchExportTask[]>(() => {
    const tasks: BatchExportTask[] = [];

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
      // 清空选择
      const wasSingleMode = selectedVideos.value.length === 1;
      if (wasSingleMode) {
        await cleanupSingleModeData(selectedVideos.value[0]);
      }
      selectedVideos.value = [];
      currentTime.value = 0;
      duration.value = 0;
      return;
    }

    // 单选切换：先清理旧数据
    if (selectedVideos.value.length === 1 && selectedVideos.value[0].id !== video.id) {
      await cleanupSingleModeData(selectedVideos.value[0]);
    }

    selectedVideos.value = [video];
    currentTime.value = 0;
    // 元数据已在导入时预加载，直接使用
    if (video.metadata?.duration) {
      setDuration(parseTimecode(video.metadata.duration));
    }
  }

  async function setSelectedVideos(videos: FileNode[]) {
    const wasSingleMode = selectedVideos.value.length === 1;
    const wasBatchMode = selectedVideos.value.length > 1;
    const isSingleMode = videos.length === 1;
    const isBatchMode = videos.length > 1;

    // 场景 1: 单选切换（A → B）
    if (wasSingleMode && isSingleMode) {
      const oldVideo = selectedVideos.value[0];
      const newVideo = videos[0];
      if (oldVideo.id !== newVideo.id) {
        await cleanupSingleModeData(oldVideo);
      }
    }

    // 场景 2: 单选 → 批量
    if (wasSingleMode && isBatchMode) {
      await cleanupSingleModeData(selectedVideos.value[0]);
    }

    // 场景 3: 批量 → 单选
    if (wasBatchMode && isSingleMode) {
      await cleanupBatchModeData();
    }

    // 场景 4: 清空所有选择
    if (videos.length === 0) {
      if (wasSingleMode) {
        await cleanupSingleModeData(selectedVideos.value[0]);
      } else if (wasBatchMode) {
        await cleanupBatchModeData();
      }
    }

    selectedVideos.value = videos;

    if (isSingleMode) {
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

  async function toggleVideoSelection(video: FileNode) {
    const index = selectedVideos.value.findIndex(v => v.id === video.id);

    if (index >= 0) {
      // 【取消勾选】- 检测降维转换
      const currentLength = selectedVideos.value.length;
      const afterLength = currentLength - 1;

      // 场景 1: Batch -> Single (2 → 1) - 彻底清洗批量数据并初始化单选状态
      if (currentLength === 2 && afterLength === 1) {
        await cleanupBatchModeData(); // 清空整个批量状态
        selectedVideos.value.splice(index, 1);

        // 初始化剩余单选视频状态
        const remainingVideo = selectedVideos.value[0];
        currentTime.value = 0;
        if (remainingVideo?.metadata?.duration) {
          setDuration(parseTimecode(remainingVideo.metadata.duration));
        }

        console.log(`[VideoStore] 批量降维到单选 (移除: ${video.name}, 激活: ${remainingVideo.name})`);
      }
      // 场景 2: Single -> Empty (1 → 0) - 清洗单选数据
      else if (currentLength === 1 && afterLength === 0) {
        const removedVideo = selectedVideos.value[0];
        // 先异步清理再清空状态
        await cleanupSingleModeData(removedVideo);
        selectedVideos.value = [];
        currentTime.value = 0;
        duration.value = 0;
        console.log(`[VideoStore] 单选降维到空，已清理数据`);
      }
      // 场景 3: Batch -> Batch (>2 → >1) - 靶向剔除
      else if (afterLength > 1) {
        const removedVideoId = selectedVideos.value[index].id;

        // 靶向删除该视频的批量切片
        batchSliceGroups.value = batchSliceGroups.value.filter(
          group => group.videoId !== removedVideoId
        );

        selectedVideos.value.splice(index, 1);
        console.log(`[VideoStore] 取消勾选视频 ${video.name}，已清理批量数据`);
      }
    } else {
      // 【勾选】- 仅添加
      selectedVideos.value.push(video);
    }
  }

  async function clearActiveVideo() {
    if (selectedVideos.value.length === 1) {
      await cleanupSingleModeData(selectedVideos.value[0]);
    } else if (selectedVideos.value.length > 1) {
      await cleanupBatchModeData();
    }

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

  /**
   * 清理单选模式的派生数据
   */
  async function cleanupSingleModeData(video: FileNode) {
    try {
      const { useSliceStore } = await import('./useSliceStore');
      const { useExportStore } = await import('./useExportStore');

      const sliceStore = useSliceStore();
      const exportStore = useExportStore();

      // 清理切片数据
      sliceStore.reset();

      // 靶向清理导出任务：只删除该视频的 slicer 任务
      console.log(`[VideoStore] 准备清理导出任务 - video.path: ${video.path}`);
      console.log(`[VideoStore] 当前导出任务数量: ${exportStore.pendingTasks.length}`);
      exportStore.removeTasksBySource('slicer', video.path);
      console.log(`[VideoStore] 清理后导出任务数量: ${exportStore.pendingTasks.length}`);

      console.log(`[VideoStore] 已清理单选视频 ${video.name} 的派生数据`);
    } catch (error) {
      console.error(`[VideoStore] 清理单选视频 ${video.name} 失败:`, error);
      // 不阻断主流程，仅记录错误
    }
  }

  /**
   * 清理批量模式的派生数据
   */
  async function cleanupBatchModeData() {
    console.log('[VideoStore] ========== 开始清理批量模式数据 V2 ==========');
    try {
      const { useSliceStore } = await import('./useSliceStore');
      const { useExportStore } = await import('./useExportStore');

      const sliceStore = useSliceStore();
      const exportStore = useExportStore();

      console.log('[VideoStore] Store 实例获取成功');

      // 清理批量切片数据
      batchSliceGroups.value = [];
      console.log('[VideoStore] 已清空 batchSliceGroups');

      // 清理单选模式的切片数据（如果是从单选切换到批量，需要清理单选的切片）
      sliceStore.reset();
      console.log('[VideoStore] 已调用 sliceStore.reset()');

      // 清理导出队列中所有 slicer 相关的任务
      // 批量模式切换时，清空所有 slicer 任务
      const tasksToRemove = exportStore.pendingTasks.filter(t => t.toolId === 'slicer');
      console.log('[VideoStore] 需要移除的任务数量:', tasksToRemove.length);

      tasksToRemove.forEach(task => {
        if (task.payload?.sourceFilePath) {
          console.log('[VideoStore] 移除任务:', task.id, task.payload.sourceFilePath);
          exportStore.removeTasksBySource('slicer', task.payload.sourceFilePath);
        }
      });

      console.log('[VideoStore] 已清理批量模式数据');
    } catch (error) {
      console.error('[VideoStore] 清理批量模式数据失败:', error);
    }
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
    reset,
  };
});
