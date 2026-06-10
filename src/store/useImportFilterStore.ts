import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ImportFilterConfig } from '../types/import-filter';

export const useImportFilterStore = defineStore('importFilter', () => {
  const config = ref<ImportFilterConfig>({
    enableSizeFilter: false,
    minSizeMB: 1,
    maxSizeMB: 1000,
    enableDurationFilter: false,
    minDurationSec: 1,
    maxDurationSec: 3600,
    enableFormatFilter: true,
    allowedFormats: ['mp4', 'mov'],
  });

  function updateConfig(newConfig: Partial<ImportFilterConfig>) {
    config.value = { ...config.value, ...newConfig };
  }

  function resetConfig() {
    config.value = {
      enableSizeFilter: false,
      minSizeMB: 1,
      maxSizeMB: 1000,
      enableDurationFilter: false,
      minDurationSec: 1,
      maxDurationSec: 3600,
      enableFormatFilter: true,
      allowedFormats: ['mp4', 'mov'],
    };
  }

  return {
    config,
    updateConfig,
    resetConfig,
  };
});
