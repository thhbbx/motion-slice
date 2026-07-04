<template>
  <div class="slicer-single-mode">
    <div class="list-header">
      <h3 class="section-title">切片预览</h3>
      <span v-if="previewSlices.length > 0" class="slice-count">
        共 {{ previewSlices.length }} 个片段
      </span>
    </div>

    <!-- 自动调整提示 -->
    <div v-if="showAdjustmentInfo" class="adjustment-info">
      <span class="info-icon">ℹ️</span>
      <span class="info-text">{{ adjustmentInfoText }}</span>
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
          <span v-if="slice.estimatedSize" class="slice-size">
            • 约 {{ slice.estimatedSize.toFixed(1) }} MB
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useSliceStore } from '../../store/useSliceStore';
import { useVideoStore } from '../../store/useVideoStore';
import { formatTimecode } from '../../utils/timeFormat';

const sliceStore = useSliceStore();
const videoStore = useVideoStore();
const { previewSlices, activeSliceId, lastAnalyzeResult } = storeToRefs(sliceStore);

const showAdjustmentInfo = computed(() => {
  return lastAnalyzeResult.value?.durationAdjusted === true;
});

const adjustmentInfoText = computed(() => {
  if (!lastAnalyzeResult.value?.durationAdjusted) return '';

  // 这里需要从用户设置获取原始值，但我们没有存储
  // 简化版：只说明已自动调整
  return '已自动调整时长以确保加缓冲后不超过大小限制';
});

function formatTime(seconds: number) {
  return formatTimecode(seconds);
}

function handleSliceClick(sliceId: string, startTime: number) {
  sliceStore.setActiveSlice(sliceId);
  videoStore.setCurrentTime(startTime);
}
</script>

<style scoped>
.slicer-single-mode { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.list-header { display: flex; align-items: center; justify-content: space-between; padding: 0 0 var(--vt-space-3) 0; border-bottom: 1px solid var(--vt-border); }
.section-title { font-size: 14px; font-weight: 600; margin: 0; }
.slice-count { font-size: 12px; color: var(--vt-text-secondary); }
.adjustment-info { display: flex; align-items: flex-start; gap: var(--vt-space-2); padding: var(--vt-space-3); margin-top: var(--vt-space-2); background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--vt-radius-md); }
.info-icon { font-size: 14px; flex-shrink: 0; }
.info-text { font-size: 12px; color: var(--vt-text-regular); line-height: 1.5; }
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
.slice-size { color: var(--vt-text-muted); font-size: 11px; margin-left: var(--vt-space-1); }
</style>
