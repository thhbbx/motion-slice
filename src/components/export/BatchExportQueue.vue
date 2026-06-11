<template>
  <div class="batch-export-queue">
    <div class="queue-summary">
      <h3>批量切片导出任务</h3>
      <p>共 {{ totalVideos }} 个视频，拦截 {{ disabledCount }} 处废片，最终生成 {{ activeCount }} 个有效切片</p>
    </div>

    <div class="queue-progress">
      <h4>导出队列与进度</h4>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${overallProgress}%` }"></div>
      </div>
      <p class="progress-text">总进度: {{ completedCount }}/{{ totalTasks }}</p>
      <p v-if="currentTask" class="current-task">
        当前正在处理: {{ currentTask.videoName }}...{{ currentTask.slice.label }} ({{ currentTask.progress }}%)
      </p>
    </div>

    <div class="queue-list">
      <div v-for="task in exportTasks" :key="task.id" class="task-item" :class="task.status">
        <span class="task-name">{{ task.videoName }} - {{ task.slice.label }}</span>
        <span class="task-status">{{ statusText(task.status) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';

const videoStore = useVideoStore();
const { exportTaskQueue, batchSliceGroups } = storeToRefs(videoStore);

const exportTasks = computed(() => exportTaskQueue.value);

const totalVideos = computed(() => {
  return new Set(batchSliceGroups.value.map(g => g.videoId)).size;
});

const disabledCount = computed(() => {
  return batchSliceGroups.value.reduce((sum, group) => {
    return sum + group.slices.filter(s => !s.isActive).length;
  }, 0);
});

const activeCount = computed(() => exportTasks.value.length);

const totalTasks = computed(() => exportTasks.value.length);

const completedCount = computed(() => {
  return exportTasks.value.filter(t => t.status === 'completed').length;
});

const overallProgress = computed(() => {
  if (totalTasks.value === 0) return 0;
  return Math.round((completedCount.value / totalTasks.value) * 100);
});

const currentTask = computed(() => {
  return exportTasks.value.find(t => t.status === 'processing');
});

function statusText(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败'
  };
  return map[status] || status;
}
</script>

<style scoped>
.batch-export-queue { padding: var(--vt-space-4); }
.queue-summary { margin-bottom: var(--vt-space-4); }
.queue-summary h3 { font-size: 16px; margin-bottom: var(--vt-space-2); }
.queue-summary p { font-size: 12px; color: var(--vt-text-muted); }
.queue-progress { margin-bottom: var(--vt-space-4); }
.queue-progress h4 { font-size: 14px; margin-bottom: var(--vt-space-2); }
.progress-bar { height: 8px; background: var(--vt-bg-soft); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--vt-primary); transition: width 0.3s; }
.progress-text, .current-task { font-size: 12px; margin-top: var(--vt-space-2); }
.current-task { color: var(--vt-primary); font-family: var(--vt-font-mono); }
.queue-list { max-height: 300px; overflow-y: auto; }
.task-item { display: flex; justify-content: space-between; padding: var(--vt-space-2); border-bottom: 1px solid var(--vt-border); }
.task-item.completed { opacity: 0.6; }
.task-item.failed { color: var(--vt-danger); }
.task-name { font-size: 12px; font-family: var(--vt-font-mono); }
.task-status { font-size: 11px; color: var(--vt-text-muted); }
</style>
