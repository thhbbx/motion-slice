import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 工具配置 Store - 持久化工具表单配置，避免 Tab 切换时状态丢失
 */
export const useToolConfigStore = defineStore('toolConfig', () => {
  // ========== 切片工具配置 (ToolSlicer) ==========
  const slicerConfig = ref({
    // 切分模式启用状态
    enabledModes: {
      duration: true,
      size: true
    },
    // 按时长配置
    durationUnit: 'minutes' as 'minutes' | 'seconds',
    durationDisplay: 20,
    // 按大小配置
    sizeValue: 1024,
    // 缓冲配置
    useOverlapHandles: false,
    overlapDuration: 10.0
  });

  // ========== 导出配置 (ExportTab) ==========
  const exportConfig = ref({
    format: 'auto' as 'auto' | 'mp4' | 'mov' | 'avi',
    quality: 100,
    outputDir: ''
  });

  /**
   * 重置切片工具配置为默认值
   */
  function resetSlicerConfig() {
    slicerConfig.value = {
      enabledModes: { duration: true, size: true },
      durationUnit: 'minutes',
      durationDisplay: 20,
      sizeValue: 1024,
      useOverlapHandles: false,
      overlapDuration: 10.0
    };
  }

  /**
   * 重置导出配置（保留输出目录）
   */
  function resetExportConfig(keepOutputDir = true) {
    const currentOutputDir = exportConfig.value.outputDir;
    exportConfig.value = {
      format: 'auto',
      quality: 100,
      outputDir: keepOutputDir ? currentOutputDir : ''
    };
  }

  /**
   * 设置默认输出目录
   */
  function setDefaultOutputDir(path: string) {
    exportConfig.value.outputDir = path;
  }

  return {
    // 状态
    slicerConfig,
    exportConfig,

    // 方法
    resetSlicerConfig,
    resetExportConfig,
    setDefaultOutputDir
  };
});
