<template>
  <div class="export-tab">
    <!-- 批量模式：显示批量导出队列 -->
    <BatchExportQueue v-if="isBatchMode" />

    <!-- 单选模式：显示原有导出界面 -->
    <template v-else>
    <!-- 前置审查区 -->
    <div class="export-preview">
      <h3 class="section-title vt-title">待导出任务</h3>

      <!-- 空状态 -->
      <div v-if="!hasPendingTasks" class="empty-state-inline">
        <span class="vt-muted">当前暂无导出任务</span>
      </div>

      <!-- 任务列表 -->
      <div v-else class="task-list">
        <div
          v-for="task in pendingTasks"
          :key="task.id"
          class="task-item"
        >
          <div class="task-header">
            <span class="task-title">{{ task.title }}</span>
            <span class="task-tool vt-secondary">{{ task.toolId }}</span>
          </div>
          <div class="task-summary vt-muted">{{ task.summary }}</div>
        </div>
      </div>
    </div>

    <!-- 导出设置 -->
    <div class="export-settings">
      <h3 class="section-title vt-title">导出设置</h3>

      <!-- 输出格式 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">输出格式</span>
        </label>
        <select v-model="exportConfig.format" class="vt-select">
          <option value="mp4">MP4</option>
          <option value="mov">MOV</option>
          <option value="avi">AVI</option>
        </select>
      </div>

      <!-- 视频质量 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">视频质量</span>
          <span class="label-value vt-secondary">{{ exportConfig.quality }}%</span>
        </label>
        <input
          type="range"
          v-model.number="exportConfig.quality"
          min="10"
          max="100"
          step="10"
          class="vt-slider"
        />
      </div>

      <!-- 输出目录 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">输出目录</span>
        </label>
        <div class="path-input-group">
          <input
            type="text"
            v-model="exportConfig.outputDir"
            class="vt-input"
            readonly
            placeholder="选择输出目录"
          />
          <button
            class="vt-button-ghost path-button"
            @click="handleSelectOutputDir"
          >
            浏览
          </button>
        </div>
      </div>
    </div>

    <!-- 导出队列 -->
    <div class="export-queue">
      <h3 class="section-title vt-title">导出队列</h3>

      <!-- 空状态 -->
      <div v-if="queueItems.length === 0" class="empty-state-inline">
        <span class="vt-muted">暂无正在执行的任务</span>
      </div>

      <!-- 队列列表 -->
      <div v-else class="queue-list">
        <div
          v-for="item in queueItems"
          :key="item.taskId"
          class="queue-item"
        >
          <div class="queue-header">
            <span class="queue-title">{{ item.title }}</span>
            <span class="queue-status" :class="`status-${item.status}`">
              {{ getStatusText(item.status) }}
            </span>
          </div>
          <div class="queue-progress">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${item.progress}%` }"
              ></div>
            </div>
            <span class="progress-text vt-secondary">
              {{ item.currentIndex || 0 }} / {{ item.totalCount || 0 }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 执行按钮 -->
    <div class="export-actions">
      <button
        class="vt-button-primary"
        :disabled="!canExecute"
        @click="handleExecuteExport"
      >
        <span v-if="!isExporting">执行导出</span>
        <span v-else class="loading-text">
          <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
          导出中...
        </span>
      </button>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useExportStore } from '../store/useExportStore';
import { useVideoStore } from '../store/useVideoStore';
import type { ExportTaskStatus } from '../types/export';
import BatchExportQueue from './export/BatchExportQueue.vue';

const exportStore = useExportStore();
const { pendingTasks, queueItems, hasPendingTasks, isExporting } = storeToRefs(exportStore);

const videoStore = useVideoStore();
const { isBatchMode } = storeToRefs(videoStore);

// 导出配置
const exportConfig = ref({
  format: 'mp4' as 'mp4' | 'mov' | 'avi',
  quality: 100,
  outputDir: '',
});

// 初始化默认下载路径
onMounted(async () => {
  try {
    const defaultPath = await window.motionSlice.getDefaultDownloadPath();
    exportConfig.value.outputDir = defaultPath;
  } catch (error) {
    console.error('获取默认下载路径失败:', error);
  }

  // 监听导出进度事件
  window.motionSlice.onExportProgress((event) => {
    console.log('[ExportTab] 收到进度事件:', event);
    exportStore.updateQueueProgress(event.taskId, event.current, event.total);

    // 如果完成，更新状态
    if (event.current >= event.total) {
      exportStore.setQueueStatus(event.taskId, 'success');
    } else {
      exportStore.setQueueStatus(event.taskId, 'processing');
    }
  });
});

// 计算属性：是否可以执行导出
const canExecute = computed(() => {
  return hasPendingTasks.value &&
         exportConfig.value.outputDir !== '' &&
         !isExporting.value;
});

/**
 * 选择输出目录
 */
async function handleSelectOutputDir() {
  try {
    const result = await window.motionSlice.selectOutputDir();
    if (result) {
      exportConfig.value.outputDir = result;
    }
  } catch (error) {
    console.error('选择输出目录失败:', error);
  }
}

/**
 * 执行导出
 */
async function handleExecuteExport() {
  if (!canExecute.value) return;

  try {
    const taskIds = pendingTasks.value.map(t => t.id);

    // 初始化队列
    exportStore.initQueue(taskIds);

    // 调用主进程执行导出（将响应式对象转换为纯对象）
    await window.motionSlice.executeExport({
      tasks: JSON.parse(JSON.stringify(pendingTasks.value)),
      outputDir: exportConfig.value.outputDir,
      format: exportConfig.value.format,
      quality: exportConfig.value.quality,
    });

    console.log('[ExportTab] 导出任务已提交');
  } catch (error) {
    console.error('执行导出失败:', error);

    // 将所有队列项标记为失败
    queueItems.value.forEach(item => {
      exportStore.setQueueStatus(item.taskId, 'failed');
    });

    alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 获取状态文本
 */
function getStatusText(status: ExportTaskStatus): string {
  const statusMap: Record<ExportTaskStatus, string> = {
    pending: '等待中',
    processing: '导出中',
    success: '已完成',
    failed: '失败',
  };
  return statusMap[status] || '未知';
}

onUnmounted(() => {
  window.motionSlice.offExportProgress();
});
</script>

<style scoped>
.export-tab {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  height: 100%;
}

/* 前置审查区 */
.export-preview {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.section-title {
  font-size: 14px;
  margin: 0;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.task-item {
  padding: var(--vt-space-3);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--vt-space-1);
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text-regular);
}

.task-tool {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.task-summary {
  font-size: 12px;
  line-height: 1.4;
}

/* 导出设置 */
.export-settings {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
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

.vt-select {
  width: 100%;
  height: 40px;
  padding: 0 var(--vt-space-3);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  background: rgba(26, 26, 30, 0.9);
  color: var(--vt-text-regular);
  font-size: 14px;
  outline: none;
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.vt-select:focus {
  border-color: var(--vt-border-active);
  box-shadow: 0 0 0 4px var(--vt-primary-glow);
}

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

.path-input-group {
  display: flex;
  gap: var(--vt-space-2);
}

.path-input-group .vt-input {
  flex: 1;
}

.path-button {
  height: 40px;
  padding: 0 var(--vt-space-3);
  flex-shrink: 0;
}

/* 导出队列 */
.export-queue {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  flex: 1;
  overflow: hidden;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
  overflow-y: auto;
}

.queue-item {
  padding: var(--vt-space-3);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--vt-space-2);
}

.queue-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text-regular);
}

.queue-status {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-pending {
  color: var(--vt-text-secondary);
}

.status-processing {
  color: var(--vt-info);
}

.status-success {
  color: var(--vt-success);
}

.status-failed {
  color: var(--vt-danger);
}

.queue-progress {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--vt-bg-soft);
  border-radius: var(--vt-radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--vt-primary);
  transition: width 300ms ease;
}

.progress-text {
  font-size: 12px;
  font-family: var(--vt-font-mono);
  flex-shrink: 0;
}

/* 空状态 */
.empty-state-inline {
  padding: var(--vt-space-4);
  text-align: center;
  font-size: 13px;
  border: 1px dashed var(--vt-border);
  border-radius: var(--vt-radius-md);
}

/* 执行按钮 */
.export-actions {
  padding-top: var(--vt-space-2);
}

.export-actions button {
  width: 100%;
}

.export-actions button:disabled {
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
