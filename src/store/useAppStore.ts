import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 全局应用状态 Store
 * 负责管理跨组件的全局状态（加载中、系统通知等）
 */
export const useAppStore = defineStore('app', () => {
  // 全局加载状态
  const isImporting = ref(false);
  const importingMessage = ref('正在解析媒体资产...');

  /**
   * 开始导入（显示全局加载遮罩）
   */
  function startImporting(message = '正在解析媒体资产...') {
    isImporting.value = true;
    importingMessage.value = message;
    console.log('[AppStore] 开始全局加载:', message);
  }

  /**
   * 完成导入（隐藏全局加载遮罩）
   */
  function finishImporting() {
    isImporting.value = false;
    console.log('[AppStore] 完成全局加载');
  }

  return {
    // State
    isImporting,
    importingMessage,
    // Actions
    startImporting,
    finishImporting,
  };
});
