<template>
  <div class="export-tab">
    <!-- 1. 任务摘要区 (Summary Card) -->
    <div class="summary-card">
      <h3 class="summary-title">
        {{ isBatchMode ? '批量切片导出任务' : '视频切片导出' }}
      </h3>
      <p class="summary-text">
        <template v-if="isBatchMode">
          共 {{ totalVideos }} 个视频，拦截 {{ disabledCount }} 处废片，最终生成 {{ activeCount }} 个有效切片
        </template>
        <template v-else>
          共 {{ pendingTasks.length }} 个片段
        </template>
      </p>
    </div>

    <!-- 2. 导出设置区 (Export Settings) -->
    <div class="export-settings">
      <h3 class="section-title">导出设置</h3>

      <!-- 输出格式 -->
      <div class="form-row">
        <label class="form-label">
          <span class="label-text">输出格式</span>
        </label>
        <ToolSelector
          v-model="exportConfig.format"
          :options="formatOptions"
          :disabled="isExporting"
        />
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
            :disabled="isExporting"
          />
          <button
            class="vt-button-ghost path-button"
            @click="handleSelectOutputDir"
            :disabled="isExporting"
          >
            浏览
          </button>
        </div>
      </div>
    </div>

    <!-- 3. 队列与进度区 (Queue & Progress) -->
    <div class="export-queue">
      <h3 class="section-title">导出队列与进度</h3>

      <!-- 全局进度条 -->
      <div v-if="totalTasks > 0" class="global-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${overallProgress}%` }"></div>
        </div>
        <p class="progress-text">总进度: {{ completedCount }}/{{ totalTasks }}</p>
        <p
          v-if="currentTask"
          class="current-task"
          :title="`当前正在处理: ${currentTaskLabel}`"
        >
          当前正在处理: {{ currentTaskLabel }}
        </p>
      </div>

      <!-- 队列列表 -->
      <div v-if="exportTasks.length === 0" class="empty-state-inline">
        <span class="vt-muted">当前暂无待导出任务</span>
      </div>
      <div v-else class="queue-list">
        <div
          v-for="task in exportTasks"
          :key="task.id"
          class="task-item"
          :class="task.status"
        >
          <div class="task-info">
            <div class="task-name-line">
              <span class="task-name" :title="task.fullPath">
                {{ task.displayName }}
              </span>
              <span class="task-status">{{ statusText(task.status) }}</span>
            </div>
            <div v-if="task.parentPath" class="task-path-line">
              <span class="task-parent-path">
                📁 {{ task.parentPath }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. 底部操作区 (Actions) -->
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
        class="vt-button-primary"
        :disabled="!canExecute || isExporting"
        @click="handleExecuteExport"
      >
        <span v-if="!isExporting">
          {{ isBatchMode ? '执行批量导出' : '执行导出' }}
        </span>
        <span v-else class="loading-text">
          <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
          导出中...
        </span>
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
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useExportStore } from '../store/useExportStore';
import { useVideoStore } from '../store/useVideoStore';
import { useToolConfigStore } from '../store/useToolConfigStore';
import type { ExportTaskStatus } from '../types/export';
import { formatPathFromRoot } from '../utils/pathFormat';
import ToolSelector from './common/ToolSelector.vue';

const exportStore = useExportStore();
const { pendingTasks, queueItems, hasPendingTasks, isExporting } = storeToRefs(exportStore);

const videoStore = useVideoStore();
const { isBatchMode, selectedVideos, batchSliceGroups } = storeToRefs(videoStore);

const toolConfigStore = useToolConfigStore();
const { exportConfig } = storeToRefs(toolConfigStore);

const exportError = ref(''); // 导出错误信息

// 格式选项
const formatOptions = [
  { value: 'auto', label: '与源视频相同' },
  { value: 'mp4', label: 'MP4' },
  { value: 'mov', label: 'MOV' },
  { value: 'avi', label: 'AVI' }
];

// 初始化默认下载路径（仅在首次加载时）
onMounted(async () => {
  if (!exportConfig.value.outputDir) {
    try {
      const defaultPath = await window.motionSlice.getDefaultDownloadPath();
      toolConfigStore.setDefaultOutputDir(defaultPath);
    } catch (error) {
      console.error('获取默认下载路径失败:', error);
    }
  }
});

// ========== 多选模式统计 ==========
const totalVideos = computed(() => {
  if (!isBatchMode.value) return 0;
  return new Set(batchSliceGroups.value.map(g => g.videoId)).size;
});

const disabledCount = computed(() => {
  if (!isBatchMode.value) return 0;
  return batchSliceGroups.value.reduce((sum, group) => {
    return sum + group.slices.filter(s => !s.isActive).length;
  }, 0);
});

const activeCount = computed(() => {
  if (!isBatchMode.value) return pendingTasks.value.length;
  return batchSliceGroups.value.reduce((sum, group) => {
    return sum + group.slices.filter(s => s.isActive).length;
  }, 0);
});

// ========== 统一的导出任务列表 ==========
/**
 * 统一的导出任务列表
 * 单选模式：未开始导出时显示 pendingTasks，导出中显示 queueItems
 * 多选模式：始终从 batchSliceGroups 构建（与 queueItems 同步状态）
 */
const exportTasks = computed(() => {
  if (isBatchMode.value) {
    // 多选模式：从 batchSliceGroups 构建
    return batchSliceGroups.value.flatMap(group => {
      return group.slices
        .filter(s => s.isActive)
        .map((slice, index) => {
          const taskId = `${group.videoPath}-slice-${index}`;
          const queueItem = queueItems.value.find(q => q.taskId === taskId);
          const status = queueItem?.status || 'pending';
          const progress = queueItem?.progress ?? 0;

          return {
            id: taskId,
            displayName: `${group.videoName} - ${slice.label}`,
            fullPath: `${group.videoPath} - ${slice.label}`,
            parentPath: getParentPath(group.videoPath),
            status,
            progress
          };
        });
    });
  } else {
    // 单选模式：根据是否有执行队列决定数据源
    if (queueItems.value.length > 0) {
      // 导出中：显示执行队列
      return queueItems.value.map(item => {
        // 注意事项 3: 单选模式进度条换算兼容
        const progress = item.progress ?? (item.totalCount > 0 ? Math.round((item.currentIndex / item.totalCount) * 100) : 0);

        return {
          id: item.taskId,
          displayName: item.title,
          fullPath: item.title,
          parentPath: '', // 单选模式不显示路径
          status: item.status,
          progress
        };
      });
    } else {
      // 未开始导出：展开 segments，每个切片一个列表项
      return pendingTasks.value.flatMap(task => {
        // 如果没有 segments，回退到显示任务本身
        if (!task.payload?.segments || task.payload.segments.length === 0) {
          return [{
            id: task.id,
            displayName: task.title,
            fullPath: task.title,
            parentPath: '',
            status: 'pending' as const,
            progress: 0
          }];
        }

        // 展开 segments，每个切片作为独立列表项
        return task.payload.segments.map((segment, index) => ({
          id: `${task.id}-segment-${index}`,
          displayName: segment.label,
          fullPath: `${task.payload.sourceFilePath} - ${segment.label}`,
          parentPath: '',
          status: 'pending' as const,
          progress: 0
        }));
      });
    }
  }
});

// ========== 进度统计 ==========
const totalTasks = computed(() => exportTasks.value.length);

const completedCount = computed(() => {
  return exportTasks.value.filter(t => t.status === 'success').length;
});

const overallProgress = computed(() => {
  if (totalTasks.value === 0) return 0;
  return Math.round((completedCount.value / totalTasks.value) * 100);
});

const currentTask = computed(() => {
  return exportTasks.value.find(t => t.status === 'processing');
});

const currentTaskLabel = computed(() => {
  if (!currentTask.value) return '';
  return currentTask.value.displayName;
});

const isAllCompleted = computed(() => {
  return totalTasks.value > 0 && completedCount.value === totalTasks.value;
});

// ========== 执行条件判断 ==========
const canExecute = computed(() => {
  const hasOutputDir = exportConfig.value.outputDir !== '';
  const hasTasks = isBatchMode.value
    ? activeCount.value > 0
    : hasPendingTasks.value;

  return hasOutputDir && hasTasks && !isExporting.value;
});

// ========== 工具函数 ==========
/**
 * 获取从根目录开始的相对路径（用于显示）
 */
function getParentPath(fullPath: string): string {
  if (!isBatchMode.value) return '';
  const rootDir = videoStore.inferRootDir(fullPath);
  return formatPathFromRoot(fullPath, rootDir, 35);
}

/**
 * 获取状态文本
 */
function statusText(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '处理中',
    success: '已完成',
    failed: '失败'
  };
  return map[status] || status;
}

/**
 * 打开输出目录
 */
function handleOpenOutputDir() {
  if (exportConfig.value.outputDir) {
    window.motionSlice.openDirectory(exportConfig.value.outputDir);
  }
}

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
 * 执行导出（统一单选和多选逻辑）
 */
async function handleExecuteExport() {
  if (!canExecute.value) return;

  exportError.value = ''; // 清除之前的错误

  try {
    if (isBatchMode.value) {
      // 多选模式：手动构建队列项
      const queueItemsData = batchSliceGroups.value.flatMap(group => {
        return group.slices
          .filter(s => s.isActive)
          .map((slice, index) => ({
            taskId: `${group.videoPath}-slice-${index}`,
            videoPath: group.videoPath,
            sliceLabel: slice.label,
            title: `${group.videoName} - ${slice.label}`,
            status: 'processing' as const,
            progress: 0,
            currentIndex: 0,
            totalCount: 0,
          }));
      });

      // 手动设置队列（绕过 initQueue 的限制）
      exportStore.$patch({
        queueItems: queueItemsData
      });

      // 从 batchSliceGroups 构建完整任务列表
      const tasks = batchSliceGroups.value.flatMap(group => {
        const activeSlices = group.slices.filter(s => s.isActive);
        if (activeSlices.length === 0) return [];

        const rootDir = videoStore.inferRootDir(group.videoPath);

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
            })),
            rootDir: rootDir
          },
          createdAt: Date.now()
        };
      });

      // 执行导出（传递用户配置的 format 和 quality）
      const result = await window.motionSlice.executeExport({
        tasks,
        outputDir: exportConfig.value.outputDir,
        format: exportConfig.value.format,
        quality: exportConfig.value.quality
      });

      if (!result.success) {
        throw new Error(result.error || '导出失败');
      }

      console.log('[ExportTab] 批量导出完成');
    } else {
      // 单选模式：按 segment 级别初始化队列
      if (pendingTasks.value.length > 0) {
        const task = pendingTasks.value[0];

        if (task.payload?.segments) {
          // 为每个 segment 创建队列项
          const queueItemsData = task.payload.segments.map((segment, index) => ({
            taskId: `${task.id}-segment-${index}`,
            title: segment.label,
            status: 'processing' as const,
            progress: 0,
            currentIndex: 0,
            totalCount: 1
          }));

          exportStore.$patch({ queueItems: queueItemsData });
        }
      }

      const result = await window.motionSlice.executeExport({
        tasks: JSON.parse(JSON.stringify(pendingTasks.value)),
        outputDir: exportConfig.value.outputDir,
        format: exportConfig.value.format,
        quality: exportConfig.value.quality,
      });

      if (!result.success) {
        throw new Error(result.error || '导出失败');
      }

      console.log('[ExportTab] 单选导出完成');
    }
  } catch (error: any) {
    // 展开打印完整的 error 对象，包括可能包含底层堆栈的 error.cause 或 error.details
    console.error('[ExportTab] 导出失败，拦截到的完整异常对象:', {
      message: error?.message,
      cause: error?.cause,
      details: error?.details,
      stack: error?.stack,
      rawError: error
    });

    // 仅将非成功状态的任务标记为失败，保留已成功导出的切片状态
    queueItems.value.forEach(item => {
      if (item.status !== 'success') {
        exportStore.setQueueStatus(item.taskId, 'failed');
      }
    });

    // 显示友好的错误信息
    exportError.value = error instanceof Error ? error.message : '导出过程中发生未知错误';
  }
}

// 监听视频切换，清除错误状态和队列
watch(selectedVideos, () => {
  exportError.value = '';
  exportStore.clearQueue();
  console.log('[ExportTab] 视频切换，已清除错误状态和执行队列');
}, { deep: true });
</script>

<style scoped>
.export-tab {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  height: 100%;
}

/* ========== 1. 任务摘要区 ========== */
.summary-card {
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  flex-shrink: 0;
}

.summary-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--vt-space-2) 0;
  color: var(--vt-text-regular);
}

.summary-text {
  font-size: 12px;
  color: var(--vt-text-muted);
  margin: 0;
  line-height: 1.5;
}

/* ========== 2. 导出设置区 ========== */
.export-settings {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  flex-shrink: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 var(--vt-space-2) 0;
  color: var(--vt-text-regular);
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
  color: var(--vt-text-secondary);
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

/* ========== 3. 队列与进度区 ========== */
.export-queue {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  padding: var(--vt-space-4);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  flex: 1;
  overflow: hidden;
}

.global-progress {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
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
  margin: 0;
  font-family: var(--vt-font-mono);
}

.current-task {
  font-size: 12px;
  color: var(--vt-primary);
  font-family: var(--vt-font-mono);
  margin: 0;
  padding: var(--vt-space-2) var(--vt-space-3);
  background: var(--vt-primary-soft);
  border-radius: var(--vt-radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-list {
  height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  background: var(--vt-bg-elevated);
}

.task-item {
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

.task-item.success .task-status {
  color: rgba(16, 185, 129, 0.9);
  font-weight: 600;
}

.task-item.failed {
  background: var(--vt-danger-soft);
}

.task-item.failed .task-status {
  color: var(--vt-danger);
  font-weight: 600;
}

.task-info {
  width: 100%;
}

.task-name-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--vt-space-2);
}

.task-name {
  flex: 1;
  font-size: 13px;
  font-family: var(--vt-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.task-path-line {
  margin-top: var(--vt-space-1);
  font-size: 11px;
  padding-right: var(--vt-space-2);
  width: 100%;
  overflow: hidden;
  display: block;
}

.task-parent-path {
  font-family: var(--vt-font-mono);
  font-size: 11px;
  font-weight: 400;
  color: var(--vt-text-muted);
  opacity: 0.8;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

.task-status {
  font-size: 11px;
  color: var(--vt-text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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

/* ========== 4. 底部操作区 ========== */
.export-actions {
  padding: var(--vt-space-4);
  border-top: 1px solid var(--vt-border);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  flex-shrink: 0;
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
