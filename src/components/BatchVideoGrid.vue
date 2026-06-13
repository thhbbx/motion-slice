<template>
  <div class="batch-grid-container">
    <div class="grid-header">
      <h3 class="grid-title">批量视频列表 ({{ videos.length }} 个)</h3>
    </div>

    <div class="grid-list">
      <div v-for="video in videos" :key="video.id" class="video-group">
        <!-- 视频行 -->
        <div
          class="video-row"
          :class="{ focused: isFocused(video.id) }"
          @click="handleRowClick(video)"
        >
          <span class="expand-icon" @click.stop="toggleExpand(video.id)">
            {{ isExpanded(video.id) ? '▼' : '▶' }}
          </span>
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
              <span class="slice-label">{{ slice.label }}</span>
              <span class="slice-time vt-timecode">{{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }}</span>
              <button class="btn-preview" title="预览切片" @click.stop="handlePreview(video, slice)">▶</button>
              <button @click.stop="handleToggleActive(video.id, slice.id)" class="btn-toggle" :class="{ active: slice.isActive }">
                <svg v-if="slice.isActive" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 预览播放器 -->
    <SlicePreviewModal
      :is-visible="previewModal.visible"
      :video-path="previewModal.videoPath"
      :slice-label="previewModal.sliceLabel"
      :start-time="previewModal.startTime"
      :end-time="previewModal.endTime"
      @close="handleClosePreview"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';
import type { FileNode } from '../types/file-tree';
import type { BatchSliceItem } from '../types/batch';
import { formatTimecode } from '../utils/timeFormat';
import SlicePreviewModal from './video/SlicePreviewModal.vue';

defineProps<{
  videos: FileNode[];
}>();

const videoStore = useVideoStore();
const { batchSliceGroups, focusedVideo } = storeToRefs(videoStore);
const expandedVideos = ref<Set<string>>(new Set());

const previewModal = reactive({
  visible: false,
  videoPath: '',
  sliceLabel: '',
  startTime: 0,
  endTime: 0
});

function handleRowClick(video: FileNode) {
  videoStore.setFocusedVideo(video);
}

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

function isFocused(videoId: string) {
  return focusedVideo.value?.id === videoId;
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

function handlePreview(video: FileNode, slice: BatchSliceItem) {
  previewModal.visible = true;
  previewModal.videoPath = video.path;
  previewModal.sliceLabel = slice.label;
  previewModal.startTime = slice.startTime;
  previewModal.endTime = slice.endTime;
}

function handleClosePreview() {
  previewModal.visible = false;
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

.video-row.focused {
  background: rgba(139, 92, 246, 0.15);
  border-left: 2px solid var(--vt-primary);
}

.expand-icon {
  font-size: 10px;
  color: var(--vt-text-muted);
  width: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--vt-space-1);
  transition: color 180ms ease;
}

.expand-icon:hover {
  color: var(--vt-primary);
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
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid var(--vt-border);
}

.empty-hint {
  font-size: 12px;
  color: var(--vt-text-muted);
  padding: var(--vt-space-4);
}

.slices-list {
  display: flex;
  flex-direction: column;
  padding: var(--vt-space-2) 0 var(--vt-space-2) var(--vt-space-6);
  border-left: 1px solid var(--vt-border);
  margin-left: var(--vt-space-4);
}

.slice-item {
  display: flex;
  align-items: center;
  gap: var(--vt-space-3);
  padding: var(--vt-space-2) var(--vt-space-4) var(--vt-space-2) var(--vt-space-3);
  font-size: 12px;
  transition: all 180ms ease;
}

.slice-item:hover {
  background: var(--vt-bg-soft);
}

.slice-item.disabled {
  opacity: 0.4;
}

.slice-item.disabled .slice-label,
.slice-item.disabled .slice-time {
  text-decoration: line-through;
}

.slice-label {
  font-family: var(--vt-font-mono);
  font-weight: 500;
  min-width: 80px;
}

.slice-time {
  color: var(--vt-text-muted);
  font-family: var(--vt-font-mono);
  flex: 1;
}

.btn-preview {
  padding: 4px 8px;
  font-size: 10px;
  background: transparent;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  color: var(--vt-text-secondary);
  cursor: pointer;
  transition: all 180ms ease;
}

.btn-preview:hover {
  background: var(--vt-primary-soft);
  color: var(--vt-primary);
  border-color: var(--vt-primary);
}

.btn-toggle {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  cursor: pointer;
  transition: all 180ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-toggle.active {
  color: var(--vt-text-secondary);
}

.btn-toggle.active:hover {
  background: var(--vt-danger-soft);
  border-color: var(--vt-danger);
  color: var(--vt-danger);
}

.btn-toggle:not(.active) {
  color: var(--vt-text-muted);
  opacity: 0.6;
}

.btn-toggle:not(.active):hover {
  background: var(--vt-primary-soft);
  border-color: var(--vt-primary);
  color: var(--vt-primary);
  opacity: 1;
}
</style>
