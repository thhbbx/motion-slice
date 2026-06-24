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
              :disabled="disabled"
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
              :disabled="disabled"
            />
            <span class="radio-label">按大小</span>
          </label>
        </div>
      </div>

      <!-- 目标时长输入：输入框 + 单位切换器 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">{{ inputLabel }}</span>
        </label>
        <div class="input-with-unit">
          <input
            type="number"
            v-model.number="displayValue"
            :placeholder="inputPlaceholder"
            :min="targetUnit === 'minutes' ? 1 : 1"
            :step="targetUnit === 'minutes' ? 1 : 10"
            class="vt-input"
            :disabled="disabled"
          />
          <div v-if="mode === 'duration'" class="unit-toggle">
            <button
              type="button"
              class="unit-option"
              :class="{ active: targetUnit === 'minutes' }"
              @click="targetUnit = 'minutes'"
              :disabled="disabled"
            >
              分钟
            </button>
            <button
              type="button"
              class="unit-option"
              :class="{ active: targetUnit === 'seconds' }"
              @click="targetUnit = 'seconds'"
              :disabled="disabled"
            >
              秒
            </button>
          </div>
        </div>
      </div>

      <!-- 交叠缓冲开关 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">开启交叠缓冲</span>
          <input
            type="checkbox"
            v-model="useOverlapHandles"
            class="vt-switch"
            :disabled="disabled"
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
          max="30.0"
          step="0.1"
          class="vt-slider"
          :disabled="disabled"
        />
        <div class="form-hint vt-muted">切片边界向外扩张 {{ overlapDuration.toFixed(1) }}s，形成交叠区域（最大 30s）</div>
      </div>
    </div>

    <!-- 动作区 -->
    <div class="slicer-actions">
      <button
        class="vt-button-primary"
        :disabled="!canAnalyze"
        @click="handleAnalyze"
      >
        <span v-if="!isAnalyzing">{{ isBatchMode ? '应用规则并批量扫描' : '生成切片预览' }}</span>
        <span v-else class="loading-text">
          <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
          分析中...
        </span>
      </button>
    </div>

    <!-- 动态组件：策略模式 -->
    <component :is="currentModeComponent" :mode="mode" :target-value="targetValue" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import { useSliceStore } from '../../store/useSliceStore';
import { useExportStore } from '../../store/useExportStore';
import type { SliceAnalyzeParams } from '../../types/slice';
import type { ExportTask } from '../../types/export';
import SlicerSingleMode from './SlicerSingleMode.vue';
import SlicerBatchMode from './SlicerBatchMode.vue';

interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const videoStore = useVideoStore();
const sliceStore = useSliceStore();
const exportStore = useExportStore();

const { activeVideo, selectedVideos, isBatchMode } = storeToRefs(videoStore);
const { isAnalyzing } = storeToRefs(sliceStore);

const mode = ref<'duration' | 'size'>('duration');
const targetUnit = ref<'minutes' | 'seconds'>('minutes'); // 新增：单位状态，默认分钟
const displayValue = ref<number>(20); // 新增：UI 展示值，默认 20 分钟
const targetValue = ref<number>(1200); // 修改默认值为 1200 秒（20 分钟）
const useOverlapHandles = ref<boolean>(false);
const overlapDuration = ref<number>(10.0); // 修改默认值：1.0 → 10.0

// 新增：监听单位切换，自动转换数值
watch(targetUnit, (newUnit, oldUnit) => {
  if (oldUnit && newUnit !== oldUnit) {
    if (newUnit === 'seconds' && oldUnit === 'minutes') {
      // 分钟 → 秒：乘以 60
      displayValue.value = Math.round(displayValue.value * 60);
    } else if (newUnit === 'minutes' && oldUnit === 'seconds') {
      // 秒 → 分钟：除以 60，保留整数
      displayValue.value = Math.round(displayValue.value / 60);
    }
  }
});

// 新增：监听展示值变化，同步更新实际秒数值
watch(displayValue, (newVal) => {
  if (mode.value === 'duration') {
    targetValue.value = targetUnit.value === 'minutes' ? newVal * 60 : newVal;
  }
});

const currentModeComponent = computed(() => {
  return isBatchMode.value ? markRaw(SlicerBatchMode) : markRaw(SlicerSingleMode);
});

// 计算属性：是否可以生成预览
const canAnalyze = computed(() => {
  const hasVideo = activeVideo.value !== null || selectedVideos.value.length > 0;
  return hasVideo && !isAnalyzing.value && !props.disabled && targetValue.value > 0;
});

const inputLabel = computed(() => {
  if (mode.value === 'size') return '目标大小 (MB)';
  return '目标时长';
});

const inputPlaceholder = computed(() => {
  if (mode.value === 'size') return '50';
  return targetUnit.value === 'minutes' ? '20' : '1200';
});

// 方法
function handleModeChange(newMode: 'duration' | 'size') {
  mode.value = newMode;
  if (newMode === 'duration') {
    targetUnit.value = 'minutes';
    displayValue.value = 20;
    targetValue.value = 1200;
  } else {
    displayValue.value = 50;
    targetValue.value = 50;
  }
}

/**
 * 生成切片预览
 */
async function handleAnalyze() {
  if (isAnalyzing.value) return;

  const videos = selectedVideos.value.length > 0
    ? selectedVideos.value
    : (activeVideo.value ? [activeVideo.value] : []);

  if (videos.length === 0) return;

  sliceStore.setAnalyzing(true);

  try {
    const params: SliceAnalyzeParams = {
      filePath: '',
      mode: mode.value,
      targetValue: targetValue.value,
      useOverlapHandles: useOverlapHandles.value,
      overlapDuration: overlapDuration.value,
    };

    if (videos.length === 1) {
      params.filePath = videos[0].path;
      const result = await window.motionSlice.analyzeSlices(params);
      sliceStore.setPreviewSlices(result.segments);
      // 不操作 batchSliceGroups（单选模式不触碰批量轨数据）

      // 自动创建导出任务（使用视频路径作为唯一标识，避免重复添加）
      if (result.segments.length > 0) {
        const task: ExportTask = {
          id: `slicer-${videos[0].path}`, // 使用视频路径保证同一视频的任务唯一
          toolId: 'slicer',
          title: '视频切片导出',
          summary: `共 ${result.segments.length} 个片段`,
          status: 'pending',
          payload: {
            sourceFilePath: videos[0].path,
            segments: result.segments.map(s => ({
              id: s.id,
              startTime: s.startTime,
              endTime: s.endTime,
              label: s.label
            }))
          },
          createdAt: Date.now()
        };
        exportStore.upsertTask(task);
      }
    } else {
      // 批量模式：调用批量分析 API
      sliceStore.setPreviewSlices([]);
      const videoList = videos.map(v => ({ path: v.path, id: v.id, name: v.name }));
      const groups = await window.motionSlice.batchAnalyzeSlices(videoList, params);
      videoStore.setBatchSliceGroups(groups);

      // 清空之前的导出队列（重新扫描后，旧的导出结果已失效）
      exportStore.clearQueue();
    }
  } catch (error) {
    console.error('切片分析失败:', error);
  } finally {
    sliceStore.setAnalyzing(false);
  }
}
</script>

<style scoped>
.tool-slicer {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  height: 100%;
}

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

/* 输入框与单位切换器组合容器 */
.input-with-unit {
  display: flex;
  gap: var(--vt-space-2);
  align-items: center;
}

.input-with-unit .vt-input {
  flex: 1;
  min-width: 0;
}

/* 单位切换器（macOS 分段控制风格） */
.unit-toggle {
  display: flex;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  padding: 2px;
  gap: 2px;
}

.unit-option {
  flex: 1;
  height: 32px;
  min-width: 56px;
  padding: 0 var(--vt-space-3);
  border: none;
  border-radius: calc(var(--vt-radius-sm) - 2px);
  background: transparent;
  color: var(--vt-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 180ms ease;
  white-space: nowrap;
}

.unit-option:hover:not(:disabled) {
  color: var(--vt-text-regular);
  background: rgba(255, 255, 255, 0.04);
}

.unit-option.active {
  background: var(--vt-primary);
  color: var(--vt-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.unit-option:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
</style>

