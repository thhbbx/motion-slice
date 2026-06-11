import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { VideoSegment } from '../types/slice';

export interface VideoSliceGroup {
  videoId: string;
  videoName: string;
  segments: VideoSegment[];
  isExpanded: boolean;
}

export const useSliceStore = defineStore('slice', () => {
  const previewSlices = ref<VideoSegment[]>([]);
  const batchSliceGroups = ref<VideoSliceGroup[]>([]);
  const activeSliceId = ref<string | null>(null);
  const isAnalyzing = ref(false);

  const allSlices = computed(() => {
    if (batchSliceGroups.value.length > 0) {
      return batchSliceGroups.value.flatMap(g => g.segments);
    }
    return previewSlices.value;
  });

  const activeSlice = computed(() => {
    if (!activeSliceId.value) return null;
    return allSlices.value.find(s => s.id === activeSliceId.value) || null;
  });

  function setPreviewSlices(segments: VideoSegment[]) {
    previewSlices.value = segments;
  }

  function setBatchSliceGroups(groups: VideoSliceGroup[]) {
    batchSliceGroups.value = groups;
  }

  function toggleGroupExpanded(videoId: string) {
    const group = batchSliceGroups.value.find(g => g.videoId === videoId);
    if (group) {
      group.isExpanded = !group.isExpanded;
    }
  }

  function setActiveSlice(id: string | null) {
    activeSliceId.value = id;
  }

  function clearSlices() {
    previewSlices.value = [];
    batchSliceGroups.value = [];
    activeSliceId.value = null;
  }

  function setAnalyzing(status: boolean) {
    isAnalyzing.value = status;
  }

  function clearBatchMode() {
    batchSliceGroups.value = [];
    activeSliceId.value = null;
  }

  function clearPreviewMode() {
    previewSlices.value = [];
    activeSliceId.value = null;
  }

  return {
    previewSlices,
    batchSliceGroups,
    activeSliceId,
    isAnalyzing,
    allSlices,
    activeSlice,
    setPreviewSlices,
    setBatchSliceGroups,
    toggleGroupExpanded,
    setActiveSlice,
    clearSlices,
    setAnalyzing,
    clearBatchMode,
    clearPreviewMode,
  };
});
