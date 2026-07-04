import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { VideoSegment, SliceAnalyzeResult } from '../types/slice';

export const useSliceStore = defineStore('slice', () => {
  const previewSlices = ref<VideoSegment[]>([]);
  const activeSliceId = ref<string | null>(null);
  const isAnalyzing = ref(false);
  const lastAnalyzeResult = ref<SliceAnalyzeResult | null>(null);

  const activeSlice = computed(() => {
    if (!activeSliceId.value) return null;
    return previewSlices.value.find(s => s.id === activeSliceId.value) || null;
  });

  function setPreviewSlices(segments: VideoSegment[], result?: SliceAnalyzeResult) {
    previewSlices.value = segments;
    if (result) {
      lastAnalyzeResult.value = result;
    }
  }

  function setActiveSlice(id: string | null) {
    activeSliceId.value = id;
  }

  /**
   * 重置工作区状态（导入新视频时调用）
   */
  function reset() {
    previewSlices.value = [];
    activeSliceId.value = null;
    isAnalyzing.value = false;
    lastAnalyzeResult.value = null;
    console.log('[SliceStore] 工作区状态已重置');
  }

  function setAnalyzing(status: boolean) {
    isAnalyzing.value = status;
  }

  return {
    previewSlices,
    activeSliceId,
    isAnalyzing,
    lastAnalyzeResult,
    activeSlice,
    setPreviewSlices,
    setActiveSlice,
    clearSlices: reset, // 兼容旧代码
    reset,
    setAnalyzing,
  };
});
