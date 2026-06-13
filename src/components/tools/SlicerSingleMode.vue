<template>
  <div class="slicer-single-mode">
    <div class="list-header">
      <h3 class="section-title">切片预览</h3>
      <span v-if="previewSlices.length > 0" class="slice-count">
        共 {{ previewSlices.length }} 个片段
      </span>
    </div>

    <div v-if="previewSlices.length === 0" class="empty-state">
      <div class="empty-icon">✂️</div>
      <div class="empty-text">暂无切片</div>
      <div class="empty-hint">配置参数后点击"生成切片预览"</div>
    </div>

    <div v-else class="slice-items">
      <div
        v-for="slice in previewSlices"
        :key="slice.id"
        :class="['slice-item', { active: slice.id === activeSliceId }]"
        @click="handleSliceClick(slice.id, slice.startTime)"
      >
        <div class="slice-label">{{ slice.label }}</div>
        <div class="slice-time">
          {{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useSliceStore } from '../../store/useSliceStore';
import { useVideoStore } from '../../store/useVideoStore';
import { formatTimecode } from '../../utils/timeFormat';

const sliceStore = useSliceStore();
const videoStore = useVideoStore();
const { previewSlices, activeSliceId } = storeToRefs(sliceStore);

function formatTime(seconds: number) {
  return formatTimecode(seconds);
}

function handleSliceClick(sliceId: string, startTime: number) {
  sliceStore.setActiveSlice(sliceId);
  videoStore.seekTo(startTime);
}
</script>

<style scoped>
.slicer-single-mode { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.list-header { display: flex; align-items: center; justify-content: space-between; padding: 0 0 var(--vt-space-3) 0; border-bottom: 1px solid var(--vt-border); }
.section-title { font-size: 14px; font-weight: 600; margin: 0; }
.slice-count { font-size: 12px; color: var(--vt-text-secondary); }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--vt-space-2); }
.empty-icon { font-size: 32px; opacity: 0.3; }
.empty-text { font-size: 14px; font-weight: 500; color: var(--vt-text-secondary); }
.empty-hint { font-size: 12px; color: var(--vt-text-muted); }
.slice-items { flex: 1; overflow-y: auto; padding: var(--vt-space-2) 0; }
.slice-item { display: flex; flex-direction: column; gap: var(--vt-space-1); padding: var(--vt-space-3); border-radius: var(--vt-radius-md); cursor: pointer; transition: background 180ms ease; }
.slice-item:hover { background: var(--vt-bg-soft); }
.slice-item.active { background: var(--vt-primary-soft); border-left: 2px solid var(--vt-primary); }
.slice-label { font-size: 13px; font-weight: 500; }
.slice-time { font-size: 12px; font-family: var(--vt-font-mono); color: var(--vt-text-secondary); }
</style>
