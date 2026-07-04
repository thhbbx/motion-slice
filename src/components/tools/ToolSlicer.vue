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
        <div class="checkbox-group">
          <label class="checkbox-option">
            <input
              type="checkbox"
              :checked="enabledModes.duration"
              @change="handleModeToggle('duration', $event)"
              class="vt-checkbox"
              :disabled="disabled"
            />
            <span class="checkbox-label">按时长</span>
          </label>
          <label class="checkbox-option">
            <input
              type="checkbox"
              :checked="enabledModes.size"
              @change="handleModeToggle('size', $event)"
              class="vt-checkbox"
              :disabled="disabled"
            />
            <span class="checkbox-label">按大小</span>
          </label>
        </div>
      </div>

      <!-- 按时长配置 -->
      <div v-if="enabledModes.duration" class="form-row mode-config">
        <label class="form-label">
          <span class="label-text">目标时长</span>
        </label>
        <div class="input-with-unit">
          <input
            type="number"
            v-model.number="durationDisplay"
            min="1"
            step="1"
            class="vt-input"
            :disabled="disabled"
          />
          <div class="unit-toggle">
            <button type="button" class="unit-option" :class="{ active: durationUnit === 'minutes' }" @click="durationUnit = 'minutes'" :disabled="disabled">分钟</button>
            <button type="button" class="unit-option" :class="{ active: durationUnit === 'seconds' }" @click="durationUnit = 'seconds'" :disabled="disabled">秒</button>
          </div>
        </div>
      </div>

      <!-- 按大小配置 -->
      <div v-if="enabledModes.size" class="form-row mode-config">
        <label class="form-label">
          <span class="label-text">目标大小</span>
        </label>
        <div class="input-with-unit">
          <input
            type="number"
            v-model.number="sizeValue"
            min="1"
            step="10"
            class="vt-input"
            :disabled="disabled"
          />
          <div class="unit-label">MB</div>
        </div>
      </div>

      <!-- 缓冲警告横幅 -->
      <div v-if="showBufferWarning" class="buffer-warning">
        <span class="warning-icon">⚠️</span>
        <span class="warning-text">已勾选按大小模式，若最终按大小切分将忽略交叠缓冲</span>
      </div>

      <!-- 交叠缓冲开关 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">开启交叠缓冲</span>
          <input
            type="checkbox"
            v-model="useOverlapHandles"
            class="vt-switch"
            :disabled="bufferDisabled || disabled"
          />
        </label>
        <div class="form-hint vt-muted">{{ bufferHintText }}</div>
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
    <component
      :is="currentModeComponent"
      :mode="mode"
      :target-value="targetValue"
      :enabled-modes="enabledModes"
      :duration-display="durationDisplay"
      :duration-unit="durationUnit"
      :size-value="sizeValue"
      :use-overlap-handles="useOverlapHandles"
      :overlap-duration="overlapDuration"
    />
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

// 切分模式启用状态
const enabledModes = ref({
  duration: true,
  size: true
});

// 按时长配置
const durationUnit = ref<'minutes' | 'seconds'>('minutes');
const durationDisplay = ref(20);

// 按大小配置
const sizeValue = ref(1024);

// 缓冲配置
const useOverlapHandles = ref<boolean>(false);
const overlapDuration = ref<number>(10.0);

// 向后兼容的计算属性
const mode = computed(() => {
  if (enabledModes.value.duration && !enabledModes.value.size) return 'duration';
  if (enabledModes.value.size && !enabledModes.value.duration) return 'size';
  return 'duration'; // 多选时默认显示按时长
});

const targetValue = computed(() => {
  if (mode.value === 'duration') {
    return durationUnit.value === 'minutes' ? durationDisplay.value * 60 : durationDisplay.value;
  }
  return sizeValue.value;
});

// 缓冲是否禁用（单选按大小时禁用）
const bufferDisabled = computed(() => {
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  // 只有按大小模式被勾选时（无论单选还是多选后取消按时长），都禁用缓冲
  return enabledCount === 1 && enabledModes.value.size && !enabledModes.value.duration;
});

// 处理模式切换，确保至少保留一个
function handleModeToggle(mode: 'duration' | 'size', event: Event) {
  const checkbox = event.target as HTMLInputElement;
  const newValue = checkbox.checked;

  // 如果是取消勾选，检查是否至少还有一个模式
  if (!newValue) {
    const otherMode = mode === 'duration' ? 'size' : 'duration';
    if (!enabledModes.value[otherMode]) {
      // 阻止取消，至少保留一个
      checkbox.checked = true;
      return;
    }
  }

  // 更新状态
  enabledModes.value[mode] = newValue;

  // 如果只剩按大小，自动关闭缓冲
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  if (enabledCount === 1 && enabledModes.value.size && !enabledModes.value.duration) {
    useOverlapHandles.value = false;
  }
}

// 缓冲警告横幅显示条件
const showBufferWarning = computed(() => {
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  return enabledCount > 1 && enabledModes.value.size && useOverlapHandles.value;
});

// 缓冲提示文字
const bufferHintText = computed(() => {
  if (bufferDisabled.value) {
    return '按大小模式不支持交叠缓冲（会导致切片大小不准确）';
  }
  return '在切口两端延伸冗余时间，便于后期转场';
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
  if (mode.value === 'size') return '目标大小';
  return '目标时长';
});

const inputPlaceholder = computed(() => {
  if (mode.value === 'size') return '1024';
  return durationUnit.value === 'minutes' ? '20' : '1200';
});

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
      modes: [
        ...(enabledModes.value.duration ? [{
          mode: 'duration' as const,
          targetValue: durationUnit.value === 'minutes' ? durationDisplay.value * 60 : durationDisplay.value,
          enabled: true
        }] : []),
        ...(enabledModes.value.size ? [{
          mode: 'size' as const,
          targetValue: sizeValue.value,
          enabled: true
        }] : [])
      ],
      useOverlapHandles: useOverlapHandles.value,
      overlapDuration: overlapDuration.value,
    };

    if (videos.length === 1) {
      params.filePath = videos[0].path;
      const result = await window.motionSlice.analyzeSlices(params);
      sliceStore.setPreviewSlices(result.segments, result);
      // 不操作 batchSliceGroups（单选模式不触碰批量轨数据）

      // 自动创建导出任务（使用视频路径作为唯一标识，避免重复添加）
      if (result.segments.length > 0) {
        const rootDir = videoStore.inferRootDir(videos[0].path);

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
            })),
            rootDir: rootDir
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
/* Checkbox 组 */
.checkbox-group {
  display: flex;
  gap: var(--vt-space-4);
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  cursor: pointer;
}

.vt-checkbox {
  width: 24px;
  height: 24px;
  appearance: none;
  border: 2px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  cursor: pointer;
  position: relative;
  transition: all 180ms ease;
  flex-shrink: 0;
}

.vt-checkbox:hover {
  border-color: var(--vt-primary);
}

.vt-checkbox:checked {
  background: var(--vt-primary);
  border-color: var(--vt-primary);
}

.vt-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 10px;
  border: solid var(--vt-text);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-label {
  font-size: 14px;
  color: var(--vt-text-regular);
  user-select: none;
}

/* 模式配置区 */
.mode-config {
  padding-left: var(--vt-space-6);
  border-left: 2px solid var(--vt-border);
}

.unit-label {
  padding: 0 var(--vt-space-3);
  font-size: 13px;
  color: var(--vt-text-secondary);
  font-weight: 500;
}

/* 缓冲警告横幅 */
.buffer-warning {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  padding: var(--vt-space-3);
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--vt-radius-md);
}

.warning-icon {
  font-size: 16px;
}

.warning-text {
  font-size: 12px;
  color: var(--vt-text-regular);
  line-height: 1.4;
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

