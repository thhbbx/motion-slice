<template>
  <div class="tool-slicer">
    <!-- 表单区 -->
    <div class="slicer-form">
      <h3 class="section-title vt-title">切分设置</h3>

      <!-- 切分模式选择 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">切分模式</span>
        </label>
        <div class="radio-group">
          <label class="radio-option">
            <input
              type="radio"
              name="mode"
              value="duration"
              v-model="mode"
              class="radio-input"
            />
            <span class="radio-label">按时长</span>
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="mode"
              value="size"
              v-model="mode"
              class="radio-input"
            />
            <span class="radio-label">按大小</span>
          </label>
        </div>
      </div>

      <!-- 数值输入 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">{{ inputLabel }}</span>
        </label>
        <input
          type="number"
          v-model.number="targetValue"
          :placeholder="inputPlaceholder"
          :min="mode === 'duration' ? 1 : 1"
          :step="mode === 'duration' ? 1 : 10"
          class="vt-input"
        />
      </div>

      <!-- 交叠缓冲开关 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">开启交叠缓冲</span>
          <input
            type="checkbox"
            v-model="useOverlapHandles"
            class="vt-switch"
          />
        </label>
        <div class="form-hint vt-muted">在切口两端延伸冗余时间，便于后期转场</div>
      </div>

      <!-- 缓冲时长滑块（仅在交叠缓冲开启时显示） -->
      <div v-if="useOverlapHandles" class="form-row">
        <label class="form-label">
          <span class="label-text">缓冲时长（秒）</span>
          <span class="label-value vt-secondary">{{ overlapDuration.toFixed(1) }}</span>
        </label>
        <input
          type="range"
          v-model.number="overlapDuration"
          min="0.0"
          max="5.0"
          step="0.1"
          class="vt-slider"
        />
        <div class="form-hint vt-muted">切片边界向外扩张 {{ overlapDuration.toFixed(1) }}s，形成交叠区域</div>
      </div>
    </div>

    <!-- 动作区 -->
    <div class="slicer-actions">
      <button
        class="vt-button-primary"
        :disabled="!canAnalyze"
        @click="handleAnalyze"
      >
        <span v-if="!isAnalyzing">生成切片预览</span>
        <span v-else class="loading-text">
          <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
          分析中...
        </span>
      </button>
    </div>

    <!-- 列表区 -->
    <div class="slicer-list">
      <div class="list-header">
        <h3 class="section-title vt-title">切片预览</h3>
        <span v-if="previewSlices.length > 0" class="slice-count vt-secondary">
          共 {{ previewSlices.length }} 个片段
        </span>
      </div>

      <!-- 空状态 -->
      <div v-if="previewSlices.length === 0" class="empty-state">
        <div class="empty-icon">✂️</div>
        <div class="empty-text vt-secondary">暂无切片</div>
        <div class="empty-hint vt-muted">配置参数后点击"生成切片预览"</div>
      </div>

      <!-- 切片列表 -->
      <div v-else class="slice-items">
        <div
          v-for="slice in previewSlices"
          :key="slice.id"
          :class="['slice-item', { active: slice.id === activeSliceId }]"
          @click="handleSliceClick(slice.id, slice.startTime)"
        >
          <div class="slice-label">{{ slice.label }}</div>
          <div class="slice-time vt-timecode vt-secondary">
            {{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import { useSliceStore } from '../../store/useSliceStore';
import { useExportStore } from '../../store/useExportStore';
import type { VideoSegment, SliceAnalyzeParams } from '../../types/slice';
import type { ExportTask } from '../../types/export';

const videoStore = useVideoStore();
const sliceStore = useSliceStore();
const exportStore = useExportStore();

const { activeVideo } = storeToRefs(videoStore);
const { previewSlices, activeSliceId, isAnalyzing } = storeToRefs(sliceStore);

// 表单状态
const mode = ref<'duration' | 'size'>('duration');
const targetValue = ref<number>(60);
const useOverlapHandles = ref<boolean>(false);
const overlapDuration = ref<number>(1.0);

// 计算属性：是否可以生成预览
const canAnalyze = computed(() => {
  return activeVideo.value !== null && !isAnalyzing.value && targetValue.value > 0;
});

const inputLabel = computed(() => {
  return mode.value === 'duration' ? '目标时长 (秒)' : '目标大小 (MB)';
});

const inputPlaceholder = computed(() => {
  return mode.value === 'duration' ? '60' : '50';
});

// 方法
function handleModeChange(newMode: 'duration' | 'size') {
  mode.value = newMode;
  targetValue.value = newMode === 'duration' ? 60 : 50;
}

/**
 * 生成切片预览
 */
async function handleAnalyze() {
  if (!activeVideo.value || isAnalyzing.value) return;

  sliceStore.setAnalyzing(true);

  try {
    const params: SliceAnalyzeParams = {
      filePath: activeVideo.value.path,
      mode: mode.value,
      targetValue: targetValue.value,
      useOverlapHandles: useOverlapHandles.value,
      overlapDuration: overlapDuration.value,
    };

    console.log('[ToolSlicer] 发送切片分析请求:', params);
    const result = await window.motionSlice.analyzeSlices(params);
    console.log('[ToolSlicer] 收到切片分析结果:', result);
    sliceStore.setPreviewSlices(result.segments);
    console.log('[ToolSlicer] 已更新 Store，当前切片数量:', result.segments.length);

    // 推送导出任务到全局导出池
    const exportTask: ExportTask = {
      id: `slicer-${activeVideo.value.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      toolId: 'slicer',
      title: '视频切片导出',
      summary: `按${mode.value === 'duration' ? '时长' : '大小'} ${targetValue.value}${mode.value === 'duration' ? 's' : 'MB'} 切分，共 ${result.segments.length} 个片段${useOverlapHandles.value ? ` | 交叠缓冲 ${overlapDuration.value.toFixed(1)}s` : ''}`,
      status: 'pending',
      payload: {
        sourceFilePath: activeVideo.value.path,
        segments: result.segments.map(seg => ({
          id: seg.id,
          startTime: seg.startTime,
          endTime: seg.endTime,
          label: seg.label,
        })),
      },
      createdAt: Date.now(),
    };
    try {
      exportStore.upsertTask(exportTask);
      console.log('[ToolSlicer] 已推送导出任务到全局池:', exportTask.id);
    } catch (error) {
      console.error('[ToolSlicer] 推送导出任务失败:', error);
    }
  } catch (error) {
    console.error('切片分析失败:', error);
  } finally {
    sliceStore.setAnalyzing(false);
  }
}

/**
 * 点击切片项：跳转播放器并高亮
 */
function handleSliceClick(sliceId: string, startTime: number) {
  sliceStore.setActiveSlice(sliceId);
  videoStore.setCurrentTime(startTime);
}

/**
 * 格式化时间（秒 -> HH:mm:ss）
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.tool-slicer {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  height: 100%;
}

/* 表单区 */
.slicer-form {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-lg);
}

.section-title {
  font-size: 14px;
  margin: 0;
}

/* 表单行 */
.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.label-text {
  color: var(--vt-text-regular);
  font-weight: 500;
}

.label-value {
  font-size: 12px;
}

.form-hint {
  font-size: 12px;
  line-height: 1.4;
}

/* Radio 按钮组 */
.radio-group {
  display: flex;
  gap: var(--vt-space-3);
}

.radio-option {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  cursor: pointer;
}

.radio-input {
  width: 16px;
  height: 16px;
  appearance: none;
  border: 2px solid var(--vt-border);
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  transition: all 180ms ease;
}

.radio-input:checked {
  border-color: var(--vt-primary);
  background: var(--vt-primary);
}

.radio-input:checked::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  background: var(--vt-text);
  border-radius: 50%;
}

.radio-label {
  font-size: 14px;
  color: var(--vt-text-regular);
  user-select: none;
}

/* Switch 开关 */
.vt-switch {
  width: 44px;
  height: 24px;
  appearance: none;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-full);
  cursor: pointer;
  position: relative;
  transition: all 180ms ease;
}

.vt-switch::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--vt-text-secondary);
  border-radius: 50%;
  transition: all 180ms ease;
}

.vt-switch:checked {
  background: var(--vt-primary);
  border-color: var(--vt-primary);
}

.vt-switch:checked::before {
  left: 22px;
  background: var(--vt-text);
}

/* Slider 滑块 */
.vt-slider {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--vt-bg-elevated);
  border-radius: var(--vt-radius-full);
  outline: none;
  cursor: pointer;
}

.vt-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--vt-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: all 180ms ease;
}

.vt-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 0 4px var(--vt-primary-glow);
}

/* 动作区 */
.slicer-actions {
  padding: 0 var(--vt-space-4);
}

.slicer-actions button {
  width: 100%;
}

.slicer-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--vt-space-2);
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 列表区 */
.slicer-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-lg);
  overflow: hidden;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slice-count {
  font-size: 12px;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--vt-space-8);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--vt-space-4);
  opacity: 0.2;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: var(--vt-space-2);
}

.empty-hint {
  font-size: 12px;
}

/* 切片列表 */
.slice-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
  overflow-y: auto;
}

.slice-item {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-1);
  padding: var(--vt-space-3);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  cursor: pointer;
  transition: all 180ms ease;
}

.slice-item:hover {
  background: var(--vt-panel-hover);
  border-color: var(--vt-border-strong);
}

.slice-item.active {
  background: var(--vt-primary-soft);
  border-color: var(--vt-border-active);
  box-shadow: 0 0 0 2px var(--vt-primary-glow);
}

.slice-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text-regular);
}

.slice-time {
  font-size: 12px;
}
</style>
