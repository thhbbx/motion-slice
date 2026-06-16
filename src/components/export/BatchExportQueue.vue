<template>
  <div class="batch-export-queue">
    <div class="queue-summary">
      <h3>批量切片导出任务</h3>
      <p>共 {{ totalVideos }} 个视频，拦截 {{ disabledCount }} 处废片，最终生成 {{ activeCount }} 个有效切片</p>
    </div>

    <!-- 输出目录选择 -->
    <div class="output-dir-selector">
      <label class="dir-label">输出目录</label>
      <div class="dir-input-group">
        <input
          v-model="outputDir"
          type="text"
          class="dir-input"
          placeholder="选择导出目录..."
          readonly
          :disabled="isExporting"
        />
        <button class="btn-browse" @click="handleSelectDir" :disabled="isExporting">浏览</button>
      </div>
    </div>

    <div class="queue-progress">
      <h4>导出队列与进度</h4>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${overallProgress}%` }"></div>
      </div>
      <p class="progress-text">总进度: {{ completedCount }}/{{ totalTasks }}</p>
      <p v-if="currentTask" class="current-task">
        当前正在处理: {{ currentTask.videoName }} - {{ currentTask.sliceLabel }} ({{ currentTask.progress }}%)
      </p>
    </div>

    <div class="queue-list">
      <div v-for="task in exportTasks" :key="task.id" class="task-item" :class="task.status">
        <span class="task-name" :title="`${task.videoName} - ${task.sliceLabel}`">
          {{ task.videoName }} - {{ task.sliceLabel }}
        </span>
        <span class="task-status">{{ statusText(task.status) }}</span>
      </div>
    </div>

    <!-- 执行按钮 -->
    <div class="export-actions">
      <!-- 错误提示面板 -->
      <div v-if="exportError" class="error-panel">
        <div class="error-header">
          <span class="error-icon">⚠️</span>
          <span class="error-title">导出失败</span>
          <button class="btn-close-error" @click="exportError = ''" title="关闭">✕</button>
        </div>
        <div class="error-message">{{ exportError }}</div>
      </div>

      <button
        v-if="!isAllCompleted"
        class="btn-execute"
        :disabled="!canExecute || isExporting"
        @click="handleExecute"
      >
        <span v-if="!isExporting">执行批量导出</span>
        <span v-else>导出中...</span>
      </button>
      <button
        v-else
        class="btn-completed"
        @click="handleOpenOutputDir"
      >
        📂 打开输出目录
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 批量导出队列 UI
 *
 * 职责：
 * - 显示导出任务统计和队列
 * - 提供输出目录选择
 * - 执行批量导出（串行队列）
 * - 实时同步导出进度
 */
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import { useExportStore } from '../../store/useExportStore';

const videoStore = useVideoStore();
const { batchSliceGroups, selectedVideos } = storeToRefs(videoStore);

const exportStore = useExportStore();

const outputDir = ref('');
const isExporting = ref(false);
const exportError = ref(''); // 导出错误信息

// 任务进度状态（响应式对象）
const taskProgress = reactive<Record<string, { status: string; progress: number }>>({});

// 导出任务队列（动态计算，实时过滤禁用切片）
const exportTasks = computed(() => {
  return batchSliceGroups.value.flatMap(group => {
    return group.slices
      .filter(s => s.isActive)
      .map(slice => {
        const taskId = `${slice.id}`; // 使用 slice.id 作为唯一标识
        const progress = taskProgress[taskId] || { status: 'pending', progress: 0 };
        return {
          id: taskId,
          videoId: group.videoId,
          videoPath: group.videoPath,
          videoName: group.videoName,
          sliceLabel: slice.label,
          status: progress.status,
          progress: progress.progress
        };
      });
  });
});

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

const canExecute = computed(() => {
  return outputDir.value && exportTasks.value.length > 0 && !isExporting.value && completedCount.value < totalTasks.value;
});

const isAllCompleted = computed(() => {
  return totalTasks.value > 0 && completedCount.value === totalTasks.value;
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

onMounted(async () => {
  // 获取默认下载目录
  try {
    const defaultPath = await window.motionSlice.getDefaultDownloadPath();
    outputDir.value = defaultPath;
  } catch (error) {
    console.warn('[BatchExport] 获取默认下载目录失败:', error);
  }

  // 监听导出进度
  window.motionSlice.onExportProgress((event) => {
    console.log('[BatchExport] ========== 收到进度事件 ==========');
    console.log('[BatchExport] event.taskId:', event.taskId);
    console.log('[BatchExport] event.currentLabel:', event.currentLabel);
    console.log('[BatchExport] event.current:', event.current, '/', event.total);

    // 提取纯净的 videoId（移除 'export-' 前缀）
    const extractedVideoId = event.taskId.replace(/^export-/, '');
    console.log('[BatchExport] 提取的 videoId:', extractedVideoId);

    const allTasks = exportTasks.value;
    console.log('[BatchExport] 当前任务列表总数:', allTasks.length);

    // 复合键精确匹配：videoPath + sliceLabel
    const matchingTask = allTasks.find(t =>
      t.videoPath === extractedVideoId && t.sliceLabel === event.currentLabel
    );

    if (!matchingTask) {
      console.error('[BatchExport] ❌ 未找到匹配的任务！');
      console.error('[BatchExport] 尝试匹配的 videoPath:', extractedVideoId);
      console.error('[BatchExport] 尝试匹配的 label:', event.currentLabel);
      return;
    }

    console.log('[BatchExport] ✅ 找到匹配任务 ID:', matchingTask.id);
    console.log('[BatchExport] ✅ 匹配的切片:', matchingTask.sliceLabel);

    console.log('[BatchExport] 更新前状态:', taskProgress[matchingTask.id]);

    // 单体任务直接竣工：收到进度事件 = 该切片已处理完毕
    taskProgress[matchingTask.id] = { status: 'completed', progress: 100 };

    console.log('[BatchExport] 更新后状态:', taskProgress[matchingTask.id]);
    console.log('[BatchExport] 当前已完成任务数:', Object.values(taskProgress).filter(p => p.status === 'completed').length);
    console.log('[BatchExport] ========================================');
  });
});

// 监听视频切换，清除错误状态和进度
watch(selectedVideos, () => {
  exportError.value = '';
  // 清空进度状态
  Object.keys(taskProgress).forEach(key => {
    delete taskProgress[key];
  });
  console.log('[BatchExport] 视频切换，已清除错误和进度状态');
}, { deep: true });

onUnmounted(() => {
  window.motionSlice.offExportProgress();
});

function handleOpenOutputDir() {
  if (outputDir.value) {
    window.motionSlice.openDirectory(outputDir.value);
  }
}

async function handleSelectDir() {
  try {
    const result = await window.motionSlice.selectOutputDir();
    if (result) {
      outputDir.value = result;
    }
  } catch (error) {
    console.error('选择目录失败:', error);
  }
}

async function handleExecute() {
  if (!canExecute.value) return;

  isExporting.value = true;
  exportError.value = ''; // 清除之前的错误

  // 直接设置全局导出队列为 processing 状态
  const queueItemsData = exportTasks.value.map(task => ({
    taskId: task.id,
    title: `${task.videoName} - ${task.sliceLabel}`,
    status: 'processing' as const,
    progress: 0,
    currentIndex: 0,
    totalCount: exportTasks.value.length,
  }));

  // 手动设置队列（绕过 initQueue 的限制）
  exportStore.$patch({
    queueItems: queueItemsData
  });

  try {
    // 从 exportTaskQueue 构建完整任务列表
    const tasks = batchSliceGroups.value.flatMap(group => {
      const activeSlices = group.slices.filter(s => s.isActive);
      if (activeSlices.length === 0) return [];

      return {
        id: `export-${group.videoId}`,
        toolId: 'slicer',
        title: `${group.videoName} 切片导出`,
        summary: `共 ${activeSlices.length} 个片段`,
        status: 'pending' as const,
        payload: {
          sourceFilePath: group.videoPath,
          segments: activeSlices.map(s => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            label: s.label
          }))
        },
        createdAt: Date.now()
      };
    });

    console.log('[BatchExport] 准备导出:', tasks);

    const result = await window.motionSlice.executeExport({
      tasks,
      outputDir: outputDir.value,
      format: 'mp4',
      quality: 100
    });

    if (!result.success) {
      throw new Error(result.error || '导出失败');
    }

    console.log('[BatchExport] 导出完成');
  } catch (error) {
    console.error('[BatchExport] 导出失败:', error);

    // 提取友好的错误信息并显示在 UI 上
    exportError.value = error instanceof Error ? error.message : '导出过程中发生未知错误';
  } finally {
    isExporting.value = false;
    // 清除全局导出队列
    exportStore.clearQueue();
  }
}
</script>

<style scoped>
.batch-export-queue {
  padding: var(--vt-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
}

.queue-summary {
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.queue-summary h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--vt-space-2) 0;
}

.queue-summary p {
  font-size: 12px;
  color: var(--vt-text-muted);
  margin: 0;
}

.queue-progress {
  padding: var(--vt-space-4);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.queue-progress h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 var(--vt-space-3) 0;
}

.progress-bar {
  height: 8px;
  background: var(--vt-bg-soft);
  border-radius: var(--vt-radius-sm);
  overflow: hidden;
  border: 1px solid var(--vt-border);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  transition: width 300ms ease;
  border-radius: inherit;
}

.progress-text {
  font-size: 12px;
  color: var(--vt-text-secondary);
  margin: var(--vt-space-2) 0 0 0;
  font-family: var(--vt-font-mono);
}

.current-task {
  font-size: 12px;
  color: var(--vt-primary);
  font-family: var(--vt-font-mono);
  margin: var(--vt-space-2) 0 0 0;
  padding: var(--vt-space-2) var(--vt-space-3);
  background: var(--vt-primary-soft);
  border-radius: var(--vt-radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  background: var(--vt-bg-elevated);
}

.task-item {
  display: flex;
  align-items: center;
  gap: var(--vt-space-3);
  padding: var(--vt-space-3) var(--vt-space-4);
  border-bottom: 1px solid var(--vt-border);
  transition: background 180ms ease;
}

.task-item:last-child {
  border-bottom: none;
}

.task-item:hover {
  background: var(--vt-bg-soft);
}

.task-item.completed {
  opacity: 1;
}

.task-item.completed .task-status {
  color: rgba(16, 185, 129, 0.9);
  font-weight: 600;
}

.task-item.failed {
  background: var(--vt-danger-soft);
  color: var(--vt-danger);
}

.task-name {
  flex: 1;
  font-size: 12px;
  font-family: var(--vt-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.task-status {
  font-size: 11px;
  color: var(--vt-text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.output-dir-selector {
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.dir-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vt-text-secondary);
}

.dir-input-group {
  display: flex;
  gap: var(--vt-space-2);
}

.dir-input {
  flex: 1;
  padding: var(--vt-space-2) var(--vt-space-3);
  font-size: 12px;
  font-family: var(--vt-font-mono);
  background: var(--vt-bg);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  color: var(--vt-text-secondary);
  cursor: not-allowed;
}

.btn-browse {
  padding: var(--vt-space-2) var(--vt-space-4);
  font-size: 12px;
  font-weight: 500;
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  color: var(--vt-text);
  cursor: pointer;
  transition: all 180ms ease;
  flex-shrink: 0;
}

.btn-browse:hover {
  background: var(--vt-primary-soft);
  border-color: var(--vt-primary);
  color: var(--vt-primary);
}

.export-actions {
  padding: var(--vt-space-4);
  border-top: 1px solid var(--vt-border);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  align-items: stretch;
}

.error-panel {
  padding: var(--vt-space-4);
  background: var(--vt-danger-soft);
  border: 1px solid var(--vt-danger);
  border-radius: var(--vt-radius-md);
  animation: slideDown 200ms ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-header {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  margin-bottom: var(--vt-space-2);
}

.error-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.error-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vt-danger);
  flex: 1;
  white-space: nowrap;
}

.btn-close-error {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--vt-text-muted);
  cursor: pointer;
  border-radius: var(--vt-radius-sm);
  transition: all 180ms ease;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}

.btn-close-error:hover {
  background: rgba(0, 0, 0, 0.1);
  color: var(--vt-text);
}

.error-message {
  font-size: 12px;
  color: var(--vt-danger);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.btn-execute,
.btn-completed {
  align-self: flex-end;
}

.btn-execute {
  padding: var(--vt-space-3) var(--vt-space-6);
  font-size: 14px;
  font-weight: 600;
  background: var(--vt-primary);
  border: none;
  border-radius: var(--vt-radius-md);
  color: white;
  cursor: pointer;
  transition: all 180ms ease;
}

.btn-execute:hover:not(:disabled) {
  background: var(--vt-primary-bright);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}

.btn-execute:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-completed {
  padding: var(--vt-space-3) var(--vt-space-6);
  font-size: 14px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: var(--vt-radius-md);
  color: rgba(16, 185, 129, 0.95);
  cursor: pointer;
  transition: all 180ms ease;
}

.btn-completed:hover {
  background: rgba(16, 185, 129, 0.25);
  border-color: rgba(16, 185, 129, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}
</style>
