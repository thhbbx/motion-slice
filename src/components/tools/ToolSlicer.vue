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
              name="sliceMode"
              value="duration"
              v-model="sliceMode"
              class="radio-input"
            />
            <span class="radio-label">按时长</span>
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="sliceMode"
              value="size"
              v-model="sliceMode"
              class="radio-input"
            />
            <span class="radio-label">按大小</span>
          </label>
        </div>
      </div>

      <!-- 数值输入 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">{{ sliceMode === 'duration' ? '目标时长（秒）' : '目标大小（MB）' }}</span>
        </label>
        <input
          type="number"
          v-model.number="targetValue"
          :placeholder="sliceMode === 'duration' ? '例如：60' : '例如：100'"
          :min="sliceMode === 'duration' ? 1 : 1"
          :step="sliceMode === 'duration' ? 1 : 10"
          class="vt-input"
        />
      </div>

      <!-- 智能断句开关 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">智能断句</span>
          <input
            type="checkbox"
            v-model="useSmartSilence"
            class="vt-switch"
          />
        </label>
        <div class="form-hint vt-muted">在静音处切分，避免打断对话</div>
      </div>

      <!-- 容差范围输入（仅在智能断句开启时显示） -->
      <div v-if="useSmartSilence" class="form-row">
        <label class="form-label">
          <span class="label-text">容差范围（秒）</span>
          <span class="label-value vt-secondary">{{ tolerance }}</span>
        </label>
        <input
          type="range"
          v-model.number="tolerance"
          min="0.5"
          max="10"
          step="0.5"
          class="vt-slider"
        />
        <div class="form-hint vt-muted">允许在目标时长前后 ±{{ tolerance }}s 内寻找静音点</div>
      </div>
    </div>

    <!-- 动作区 -->
    <div class="slicer-actions">
      <button
        class="vt-button-primary"
        :disabled="!canGeneratePreview"
        @click="handleGeneratePreview"
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
          @click="handleSliceClick(slice)"
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
import type { VideoSegment } from '../../types/slice';

const videoStore = useVideoStore();
const sliceStore = useSliceStore();

const { activeVideo } = storeToRefs(videoStore);
const { previewSlices, activeSliceId, isAnalyzing } = storeToRefs(sliceStore);

// 表单状态
const sliceMode = ref<'duration' | 'size'>('duration');
const targetValue = ref<number>(60);
const useSmartSilence = ref<boolean>(true);
const tolerance = ref<number>(3);

// 计算属性：是否可以生成预览
const canGeneratePreview = computed(() => {
  return activeVideo.value !== null && !isAnalyzing.value && targetValue.value > 0;
});

/**
 * 生成切片预览
 */
async function handleGeneratePreview() {
  if (!activeVideo.value || isAnalyzing.value) return;

  sliceStore.setAnalyzing(true);

  try {
    // TODO: 调用主进程 IPC 接口进行切片分析
    // const result = await window.motionSlice.analyzeSlices({
    //   filePath: activeVideo.value.path,
    //   mode: sliceMode.value,
    //   targetValue: targetValue.value,
    //   useSmartSilence: useSmartSilence.value,
    //   tolerance: tolerance.value,
    // });
    // sliceStore.setPreviewSlices(result.segments);

    // 临时 Mock 数据（待主进程接口实现后删除）
    const mockSegments: VideoSegment[] = [
      { id: '1', startTime: 0, endTime: 60, label: '片段 1' },
      { id: '2', startTime: 60, endTime: 120, label: '片段 2' },
      { id: '3', startTime: 120, endTime: 180, label: '片段 3' },
    ];
    sliceStore.setPreviewSlices(mockSegments);
  } catch (error) {
    console.error('切片分析失败:', error);
    // TODO: 显示错误提示
  } finally {
    sliceStore.setAnalyzing(false);
  }
}

/**
 * 点击切片项：跳转播放器并高亮
 */
function handleSliceClick(slice: VideoSegment) {
  sliceStore.setActiveSlice(slice.id);
  videoStore.setCurrentTime(slice.startTime);
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
