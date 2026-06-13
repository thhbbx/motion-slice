import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { VideoSegment } from '../types/slice';

export const useSliceStore = defineStore('slice', () => {
  const previewSlices = ref<VideoSegment[]>([]);
  const activeSliceId = ref<string | null>(null);
  const isAnalyzing = ref(false);

  const activeSlice = computed(() => {
    if (!activeSliceId.value) return null;
    return previewSlices.value.find(s => s.id === activeSliceId.value) || null;
  });

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
    previewSlices,
    activeSliceId,
    isAnalyzing,
    activeSlice,
    setPreviewSlices,
    setActiveSlice,
    clearSlices,
    setAnalyzing,
  };
});
