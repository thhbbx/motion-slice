<template>
  <div class="batch-policy-card">
    <h3 class="card-title">批量切片策略汇总</h3>
    <div class="policy-item">
      <span class="label">应用视频数:</span>
      <span class="value">{{ selectedVideos.length }} 个</span>
    </div>
    <div class="policy-item">
      <span class="label">切片模式:</span>
      <span class="value">{{ policyModeText }}</span>
    </div>
    <div class="policy-item">
      <span class="label">切片参数:</span>
      <span class="value">{{ policyParamText }}</span>
    </div>
    <div v-if="showBufferInfo" class="policy-item">
      <span class="label">交叠缓冲:</span>
      <span class="value">{{ bufferInfoText }}</span>
    </div>
    <div v-if="showAdjustmentWarning" class="policy-warning">
      <span class="warning-icon">ℹ️</span>
      <span class="warning-text">{{ adjustmentWarningText }}</span>
    </div>
    <div class="policy-hint">
      点击"应用规则并批量扫描"后，将对所有选中视频执行切片分析
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';

const videoStore = useVideoStore();
const { selectedVideos, batchSliceGroups } = storeToRefs(videoStore);

// 简化版：从父组件传入切片参数，或使用默认值
const props = withDefaults(defineProps<{
  mode?: 'duration' | 'size';
  targetValue?: number;
  enabledModes?: { duration: boolean; size: boolean };
  durationDisplay?: number;
  durationUnit?: 'minutes' | 'seconds';
  sizeValue?: number;
  useOverlapHandles?: boolean;
  overlapDuration?: number;
}>(), {
  mode: 'duration',
  targetValue: 60,
  useOverlapHandles: false,
  overlapDuration: 0
});

const policyModeText = computed(() => {
  // 如果没有批量结果，使用传入的参数显示
  if (batchSliceGroups.value.length === 0) {
    return props.mode === 'duration' ? '按时长' : '按文件大小';
  }

  // 从实际结果判断：检查是否所有视频都用同一个模式
  const modes = new Set(batchSliceGroups.value.map(g => g.appliedMode));

  // 如果有多种模式被应用，说明是多选模式
  if (modes.size > 1) {
    return '按时长 或 按大小（先到先切）';
  }

  // 如果只有一种模式，显示该模式
  const appliedMode = Array.from(modes)[0];
  return appliedMode === 'duration' ? '按时长切分' : '按大小切分';
});

const policyParamText = computed(() => {
  const params: string[] = [];

  // 如果有 enabledModes，使用多选模式逻辑
  if (props.enabledModes) {
    if (props.enabledModes.duration && props.durationDisplay !== undefined && props.durationUnit) {
      const minutes = props.durationUnit === 'minutes' ? props.durationDisplay : Math.floor(props.durationDisplay / 60);
      const seconds = props.durationUnit === 'seconds' ? props.durationDisplay : props.durationDisplay % 60;

      if (props.durationUnit === 'minutes') {
        params.push(`时长 ${props.durationDisplay} 分钟`);
      } else if (minutes > 0 && seconds > 0) {
        params.push(`时长 ${minutes} 分 ${seconds} 秒`);
      } else if (minutes > 0) {
        params.push(`时长 ${minutes} 分钟`);
      } else {
        params.push(`时长 ${seconds} 秒`);
      }
    }

    if (props.enabledModes.size && props.sizeValue !== undefined) {
      params.push(`大小 ${props.sizeValue} MB`);
    }

    return params.length > 0 ? params.join(' 或 ') : '未设置';
  }

  // 向后兼容：使用旧的 mode 和 targetValue
  if (props.mode === 'duration') {
    const minutes = Math.floor(props.targetValue / 60);
    const seconds = props.targetValue % 60;
    if (minutes > 0 && seconds === 0) {
      return `时长 ${minutes} 分钟`;
    } else if (minutes === 0) {
      return `时长 ${seconds} 秒`;
    } else {
      return `时长 ${minutes} 分 ${seconds} 秒`;
    }
  } else {
    return `大小 ${props.targetValue} MB`;
  }
});

// 是否显示缓冲信息
const showBufferInfo = computed(() => {
  return props.useOverlapHandles && props.overlapDuration > 0;
});

// 缓冲信息文本
const bufferInfoText = computed(() => {
  if (!props.useOverlapHandles || props.overlapDuration === 0) return '';

  // 检查是否有多选且包含按大小模式
  const hasMultipleModes = props.enabledModes &&
    props.enabledModes.duration &&
    props.enabledModes.size;

  if (hasMultipleModes) {
    return `${props.overlapDuration.toFixed(1)} 秒（仅按时长切分时应用）`;
  }

  return `${props.overlapDuration.toFixed(1)} 秒`;
});

// 是否显示自动调整警告
const showAdjustmentWarning = computed(() => {
  // 当同时启用按时长和按大小，且开启缓冲时显示
  return props.enabledModes &&
    props.enabledModes.duration &&
    props.enabledModes.size &&
    props.useOverlapHandles &&
    props.overlapDuration > 0;
});

// 调整警告文本
const adjustmentWarningText = computed(() => {
  if (!showAdjustmentWarning.value) return '';

  const sizeMB = props.sizeValue || 0;
  return `启用缓冲后，按时长切分的视频目标时长可能自动调整，确保加缓冲后不超过 ${sizeMB} MB 限制`;
});
</script>

<style scoped>
.batch-policy-card {
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.card-title {
  margin-bottom: var(--vt-space-3);
  font-size: 14px;
  font-weight: 600;
  color: var(--vt-primary);
}

.policy-item {
  display: flex;
  justify-content: space-between;
  padding: var(--vt-space-2) 0;
  border-bottom: 1px solid var(--vt-border);
}

.policy-item:last-child {
  border-bottom: none;
}

.label {
  font-size: 12px;
  color: var(--vt-text-muted);
}

.value {
  font-size: 12px;
  font-weight: 500;
}

.policy-hint {
  margin-top: var(--vt-space-3);
  padding: var(--vt-space-2);
  font-size: 11px;
  color: var(--vt-text-secondary);
  background: var(--vt-bg);
  border-radius: var(--vt-radius-sm);
}

.policy-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--vt-space-2);
  padding: var(--vt-space-3);
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--vt-radius-md);
  margin-top: var(--vt-space-3);
}

.policy-warning .warning-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.policy-warning .warning-text {
  font-size: 12px;
  color: var(--vt-text-regular);
  line-height: 1.5;
}
</style>
