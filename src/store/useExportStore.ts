import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ExportTask, ExportQueueItem } from '../types/export';

export const useExportStore = defineStore('export', () => {
  // 状态：待导出任务池
  const pendingTasks = ref<ExportTask[]>([]);

  // 状态：执行队列（运行时状态）
  const queueItems = ref<ExportQueueItem[]>([]);

  // 计算属性：是否有待导出任务
  const hasPendingTasks = computed(() => pendingTasks.value.length > 0);

  // 计算属性：是否正在执行导出
  const isExporting = computed(() =>
    queueItems.value.some(item => item.status === 'processing')
  );

  // Actions: 添加或更新任务
  function upsertTask(task: ExportTask) {
    const index = pendingTasks.value.findIndex(t => t.id === task.id);
    if (index >= 0) {
      pendingTasks.value[index] = task;
    } else {
      pendingTasks.value.push(task);
    }
  }

  // Actions: 移除任务
  function removeTask(taskId: string) {
    pendingTasks.value = pendingTasks.value.filter(t => t.id !== taskId);
  }

  // Actions: 清空所有任务
  function clearTasks() {
    pendingTasks.value = [];
  }

  // Actions: 更新队列项进度
  function updateQueueProgress(taskId: string, current: number, total: number) {
    const item = queueItems.value.find(q => q.taskId === taskId);
    if (item) {
      item.currentIndex = current;
      item.totalCount = total;
      item.progress = total > 0 ? Math.round((current / total) * 100) : 0;
    }
  }

  // Actions: 设置队列项状态
  function setQueueStatus(taskId: string, status: ExportTask['status']) {
    const item = queueItems.value.find(q => q.taskId === taskId);
    if (item) {
      item.status = status;
    }
  }

  // Actions: 初始化执行队列
  function initQueue(taskIds: string[]) {
    queueItems.value = taskIds.map(taskId => {
      const task = pendingTasks.value.find(t => t.id === taskId);
      return {
        taskId,
        title: task?.title || '未知任务',
        progress: 0,
        status: 'pending' as const,
        currentIndex: 0,
        totalCount: 0,
      };
    });
  }

  // Actions: 清空队列
  function clearQueue() {
    queueItems.value = [];
  }

  /**
   * 按工具 ID 和源文件路径移除任务（靶向清理）
   * @param toolId 工具标识符（如 'slicer'）
   * @param sourceFilePath 源文件路径
   */
  function removeTasksBySource(toolId: string, sourceFilePath: string) {
    const before = pendingTasks.value.length;
    pendingTasks.value = pendingTasks.value.filter(task => {
      // 保留不匹配的任务
      return !(task.toolId === toolId && task.payload?.sourceFilePath === sourceFilePath);
    });
    const removed = before - pendingTasks.value.length;
    if (removed > 0) {
      console.log(`[ExportStore] 已移除 ${removed} 个任务 (toolId=${toolId}, source=${sourceFilePath})`);
    }
  }

  /**
   * 重置工作区状态（导入新视频时调用）
   */
  function reset() {
    pendingTasks.value = [];
    queueItems.value = [];
    console.log('[ExportStore] 工作区状态已重置');
  }

  return {
    // State
    pendingTasks,
    queueItems,
    hasPendingTasks,
    isExporting,
    // Actions
    upsertTask,
    removeTask,
    removeTasksBySource,
    clearTasks,
    updateQueueProgress,
    setQueueStatus,
    initQueue,
    clearQueue,
    reset,
  };
});
