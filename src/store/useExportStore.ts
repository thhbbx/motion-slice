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
    console.log(`[ExportStore] 清理前任务列表:`, pendingTasks.value.map(t => ({ id: t.id, toolId: t.toolId, source: t.payload?.sourceFilePath })));
    console.log(`[ExportStore] 尝试清理: toolId=${toolId}, sourceFilePath=${sourceFilePath}`);

    // 清理待导出任务
    const removedTaskIds: string[] = [];
    pendingTasks.value = pendingTasks.value.filter(task => {
      const shouldKeep = !(task.toolId === toolId && task.payload?.sourceFilePath === sourceFilePath);
      if (!shouldKeep) {
        removedTaskIds.push(task.id);
        console.log(`[ExportStore] 匹配到需要删除的任务:`, task.id);
      }
      return shouldKeep;
    });

    // 同时清理执行队列中对应的项
    if (removedTaskIds.length > 0) {
      queueItems.value = queueItems.value.filter(item => !removedTaskIds.includes(item.taskId));
      console.log(`[ExportStore] 同时清理了 ${removedTaskIds.length} 个执行队列项`);
    }

    const removed = before - pendingTasks.value.length;
    if (removed > 0) {
      console.log(`[ExportStore] 已移除 ${removed} 个任务 (toolId=${toolId}, source=${sourceFilePath})`);
    } else {
      console.warn(`[ExportStore] 没有找到匹配的任务需要移除 (toolId=${toolId}, source=${sourceFilePath})`);
    }
    console.log(`[ExportStore] 清理后任务列表:`, pendingTasks.value.map(t => ({ id: t.id, toolId: t.toolId, source: t.payload?.sourceFilePath })));
    console.log(`[ExportStore] 清理后队列项数量:`, queueItems.value.length);
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
