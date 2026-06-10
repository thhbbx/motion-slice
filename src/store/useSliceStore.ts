import { defineStore } from 'pinia';
import { ref } from 'vue';
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

  return {
    previewSlices,
    batchSliceGroups,
    activeSliceId,
    isAnalyzing,
    setPreviewSlices,
    setBatchSliceGroups,
    toggleGroupExpanded,
    setActiveSlice,
    clearSlices,
    setAnalyzing,
  };
});
