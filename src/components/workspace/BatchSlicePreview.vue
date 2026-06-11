<template>
  <div class="batch-slice-preview">
    <div v-for="group in batchSliceGroups" :key="group.videoId" class="video-group">
      <div class="group-header" @click="toggleExpand(group.videoId)">
        <span class="expand-icon">{{ isExpanded(group.videoId) ? '▼' : '▶' }}</span>
        <span class="video-name">{{ group.videoName }}</span>
        <span class="slice-count">(共 {{ group.slices.length }} 个片段)</span>
      </div>
      <div v-if="isExpanded(group.videoId)" class="slices-list">
        <div v-for="slice in group.slices" :key="slice.id" class="slice-item" :class="{ disabled: !slice.isActive }">
          <span class="slice-label">├─ {{ slice.label }}</span>
          <span class="slice-time">({{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }})</span>
          <button @click="handleToggleActive(group.videoId, slice.id)" class="btn-toggle">
            👁️ {{ slice.isActive ? '禁用' : '启用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import { formatTimecode } from '../../utils/timeFormat';

const videoStore = useVideoStore();
const { batchSliceGroups } = storeToRefs(videoStore);
const expandedGroups = ref<Set<string>>(new Set());

function toggleExpand(videoId: string) {
  if (expandedGroups.value.has(videoId)) {
    expandedGroups.value.delete(videoId);
  } else {
    expandedGroups.value.add(videoId);
  }
}

function isExpanded(videoId: string) {
  return expandedGroups.value.has(videoId);
}

function formatTime(seconds: number) {
  return formatTimecode(seconds);
}

function handleToggleActive(videoId: string, sliceId: string) {
  videoStore.toggleSliceActive(videoId, sliceId);
}
</script>

<style scoped>
.batch-slice-preview { display: flex; flex-direction: column; gap: var(--vt-space-3); }
.video-group { border: 1px solid var(--vt-border); border-radius: var(--vt-radius-md); overflow: hidden; }
.group-header { display: flex; align-items: center; gap: var(--vt-space-2); padding: var(--vt-space-3); background: var(--vt-bg-soft); cursor: pointer; user-select: none; }
.group-header:hover { background: var(--vt-bg-elevated); }
.expand-icon { font-size: 12px; color: var(--vt-text-muted); }
.slice-count { margin-left: auto; font-size: 12px; color: var(--vt-text-muted); }
.slices-list { padding: var(--vt-space-2) var(--vt-space-3); background: var(--vt-bg); }
.slice-item { display: flex; align-items: center; gap: var(--vt-space-2); padding: var(--vt-space-2) 0; font-family: var(--vt-font-mono); font-size: 12px; }
.slice-item.disabled { opacity: 0.5; text-decoration: line-through; }
.slice-time { color: var(--vt-text-muted); }
.btn-toggle { margin-left: auto; padding: 2px 8px; font-size: 11px; background: var(--vt-bg-soft); border: 1px solid var(--vt-border); border-radius: var(--vt-radius-sm); cursor: pointer; }
.btn-toggle:hover { background: var(--vt-bg-elevated); }
</style>
