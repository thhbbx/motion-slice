<template>
  <div class="batch-grid-container">
    <div class="grid-header">
      <h3 class="grid-title">批量视频列表 ({{ videos.length }} 个)</h3>
    </div>

    <div class="grid-list">
      <div v-for="video in videos" :key="video.id" class="video-group">
        <!-- 视频行 -->
        <div class="video-row" @click="toggleExpand(video.id)">
          <span class="expand-icon">{{ isExpanded(video.id) ? '▼' : '▶' }}</span>
          <span class="video-name">{{ video.name }}</span>
          <span class="video-duration vt-timecode">{{ video.metadata?.duration || '--' }}</span>
          <span class="video-size">{{ video.metadata?.size || '--' }}</span>
          <span class="status-badge" :class="getStatusClass(video.id)">{{ getStatusText(video.id) }}</span>
        </div>

        <!-- 展开：切片列表 -->
        <div v-if="isExpanded(video.id)" class="slices-panel">
          <div v-if="getSlicesForVideo(video.id).length === 0" class="empty-hint">
            暂无切片数据，请在工作台执行"应用规则并批量扫描"
          </div>
          <div v-else class="slices-list">
            <div v-for="slice in getSlicesForVideo(video.id)" :key="slice.id" class="slice-item" :class="{ disabled: !slice.isActive }">
              <span class="slice-label">├─ {{ slice.label }}</span>
              <span class="slice-time vt-timecode">({{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }})</span>
              <button @click.stop="handleToggleActive(video.id, slice.id)" class="btn-toggle">
                👁️ {{ slice.isActive ? '禁用' : '启用' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';
import type { FileNode } from '../types/file-tree';
import { formatTimecode } from '../utils/timeFormat';

defineProps<{
  videos: FileNode[];
}>();

const videoStore = useVideoStore();
const { batchSliceGroups } = storeToRefs(videoStore);
const expandedVideos = ref<Set<string>>(new Set());

function toggleExpand(videoId: string) {
  if (expandedVideos.value.has(videoId)) {
    expandedVideos.value.delete(videoId);
  } else {
    expandedVideos.value.add(videoId);
  }
}

function isExpanded(videoId: string) {
  return expandedVideos.value.has(videoId);
}

function getSlicesForVideo(videoId: string) {
  const group = batchSliceGroups.value.find(g => g.videoId === videoId);
  return group?.slices || [];
}

function getStatusClass(videoId: string) {
  const slices = getSlicesForVideo(videoId);
  if (slices.length === 0) return 'status-pending';
  return 'status-ready';
}

function getStatusText(videoId: string) {
  const slices = getSlicesForVideo(videoId);
  if (slices.length === 0) return '等待分析';
  return `${slices.length} 个切片`;
}

function formatTime(seconds: number) {
  return formatTimecode(seconds);
}

function handleToggleActive(videoId: string, sliceId: string) {
  videoStore.toggleSliceActive(videoId, sliceId);
}
</script>

<style scoped>
.batch-grid-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-xl);
  overflow: hidden;
}

.grid-header {
  padding: var(--vt-space-4);
  border-bottom: 1px solid var(--vt-border);
  background: var(--vt-bg-soft);
}

.grid-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.grid-list {
  flex: 1;
  overflow-y: auto;
}

.video-group {
  border-bottom: 1px solid var(--vt-border);
}

.video-row {
  display: flex;
  align-items: center;
  gap: var(--vt-space-3);
  padding: var(--vt-space-3) var(--vt-space-4);
  cursor: pointer;
  user-select: none;
  transition: background 180ms ease;
}

.video-row:hover {
  background: var(--vt-bg-soft);
}

.expand-icon {
  font-size: 10px;
  color: var(--vt-text-muted);
  width: 12px;
}

.video-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-duration, .video-size {
  font-size: 12px;
  color: var(--vt-text-secondary);
  min-width: 80px;
}

.status-badge {
  display: inline-block;
  padding: 2px var(--vt-space-2);
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--vt-radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-ready {
  background: var(--vt-primary-soft);
  color: var(--vt-primary);
}

.status-pending {
  background: var(--vt-bg-soft);
  color: var(--vt-text-muted);
}

.slices-panel {
  background: var(--vt-bg);
  padding: var(--vt-space-3) var(--vt-space-4) var(--vt-space-3) 52px;
}

.empty-hint {
  font-size: 12px;
  color: var(--vt-text-muted);
  padding: var(--vt-space-2) 0;
}

.slices-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.slice-item {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  padding: var(--vt-space-2) 0;
  font-family: var(--vt-font-mono);
  font-size: 12px;
}

.slice-item.disabled {
  opacity: 0.5;
  text-decoration: line-through;
}

.slice-label {
  min-width: 100px;
}

.slice-time {
  color: var(--vt-text-muted);
  flex: 1;
}

.btn-toggle {
  margin-left: auto;
  padding: 2px 8px;
  font-size: 11px;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  cursor: pointer;
  transition: background 180ms ease;
}

.btn-toggle:hover {
  background: var(--vt-bg-elevated);
}
</style>
