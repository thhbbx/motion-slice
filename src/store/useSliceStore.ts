import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { VideoSegment } from '../types/slice';

export const useSliceStore = defineStore('slice', () => {
  // 状态
  const previewSlices = ref<VideoSegment[]>([]);
  const activeSliceId = ref<string | null>(null);
  const isAnalyzing = ref(false);

  // Actions
  function setPreviewSlices(segments: VideoSegment[]) {
    previewSlices.value = segments;
  }

  function setActiveSlice(id: string | null) {
    activeSliceId.value = id;
  }

  function clearSlices() {
    previewSlices.value = [];
    activeSliceId.value = null;
  }

  function setAnalyzing(status: boolean) {
    isAnalyzing.value = status;
  }

  return {
    // State
    previewSlices,
    activeSliceId,
    isAnalyzing,
    // Actions
    setPreviewSlices,
    setActiveSlice,
    clearSlices,
    setAnalyzing,
  };
});
