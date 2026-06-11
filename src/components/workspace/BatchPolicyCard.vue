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
const { selectedVideos } = storeToRefs(videoStore);

// 简化版：从父组件传入切片参数，或使用默认值
const props = withDefaults(defineProps<{
  mode?: 'duration' | 'size';
  targetValue?: number;
}>(), {
  mode: 'duration',
  targetValue: 60
});

const policyModeText = computed(() => {
  return props.mode === 'duration' ? '按时长' : '按文件大小';
});

const policyParamText = computed(() => {
  if (props.mode === 'duration') {
    return `每 ${props.targetValue} 秒`;
  } else {
    return `每 ${props.targetValue} MB`;
  }
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
</style>
