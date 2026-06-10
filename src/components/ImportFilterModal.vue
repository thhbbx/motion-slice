<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h2 class="modal-title">导入偏好设置</h2>
        <button class="modal-close" @click="handleClose">×</button>
      </div>

      <div class="modal-body">
        <div class="filter-section">
          <label class="filter-toggle">
            <input type="checkbox" v-model="localConfig.enableSizeFilter" class="vt-switch"/>
            <span>文件大小限制</span>
          </label>
          <div v-if="localConfig.enableSizeFilter" class="filter-inputs">
            <div class="input-row">
              <label>最小 (MB)</label>
              <input type="number" v-model.number="localConfig.minSizeMB" min="1" class="vt-input"/>
            </div>
            <div class="input-row">
              <label>最大 (MB)</label>
              <input type="number" v-model.number="localConfig.maxSizeMB" min="1" class="vt-input"/>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-toggle">
            <input type="checkbox" v-model="localConfig.enableDurationFilter" class="vt-switch"/>
            <span>视频时长限制</span>
          </label>
          <div v-if="localConfig.enableDurationFilter" class="filter-inputs">
            <div class="input-row">
              <label>最小 (秒)</label>
              <input type="number" v-model.number="localConfig.minDurationSec" min="1" class="vt-input"/>
            </div>
            <div class="input-row">
              <label>最大 (秒)</label>
              <input type="number" v-model.number="localConfig.maxDurationSec" min="1" class="vt-input"/>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-toggle">
            <input type="checkbox" v-model="localConfig.enableFormatFilter" class="vt-switch"/>
            <span>支持格式</span>
          </label>
          <div v-if="localConfig.enableFormatFilter" class="format-checkboxes">
            <label v-for="fmt in availableFormats" :key="fmt" class="format-checkbox">
              <input type="checkbox" :value="fmt" v-model="localConfig.allowedFormats"/>
              <span>{{ fmt.toUpperCase() }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="vt-button-ghost" @click="handleReset">重置</button>
        <button class="vt-button-primary" @click="handleSave">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useImportFilterStore } from '../store/useImportFilterStore';
import type { ImportFilterConfig } from '../types/import-filter';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; save: [config: ImportFilterConfig] }>();

const filterStore = useImportFilterStore();
const { config } = storeToRefs(filterStore);
const availableFormats = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
const localConfig = ref<ImportFilterConfig>({ ...config.value });

watch(() => props.visible, (v) => { if (v) localConfig.value = { ...config.value }; });

function handleClose() { emit('close'); }
function handleSave() { filterStore.updateConfig(localConfig.value); emit('save', localConfig.value); emit('close'); }
function handleReset() { filterStore.resetConfig(); localConfig.value = { ...config.value }; }
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-container { width: 480px; background: var(--vt-bg-elevated); border: 1px solid var(--vt-border-strong); border-radius: var(--vt-radius-xl); max-height: 80vh; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: var(--vt-space-4); border-bottom: 1px solid var(--vt-border); }
.modal-title { font-size: 16px; font-weight: 600; margin: 0; }
.modal-close { width: 32px; height: 32px; border: none; background: transparent; font-size: 24px; cursor: pointer; }
.modal-body { flex: 1; padding: var(--vt-space-4); overflow-y: auto; display: flex; flex-direction: column; gap: var(--vt-space-4); }
.filter-section { display: flex; flex-direction: column; gap: var(--vt-space-3); padding: var(--vt-space-4); background: var(--vt-bg-soft); border: 1px solid var(--vt-border); border-radius: var(--vt-radius-lg); }
.filter-toggle { display: flex; align-items: center; gap: var(--vt-space-3); font-size: 14px; font-weight: 500; cursor: pointer; }
.filter-inputs { display: flex; flex-direction: column; gap: var(--vt-space-3); padding-left: var(--vt-space-8); }
.input-row { display: flex; align-items: center; gap: var(--vt-space-3); }
.input-row label { flex: 0 0 80px; font-size: 13px; }
.format-checkboxes { display: flex; flex-wrap: wrap; gap: var(--vt-space-3); padding-left: var(--vt-space-8); }
.format-checkbox { display: flex; align-items: center; gap: var(--vt-space-2); font-size: 13px; cursor: pointer; }
.modal-footer { display: flex; justify-content: flex-end; gap: var(--vt-space-3); padding: var(--vt-space-4); border-top: 1px solid var(--vt-border); }
</style>
