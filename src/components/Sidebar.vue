<template>
  <aside class="sidebar" :style="{ width: `${sidebarWidth}px` }">
    <div class="vt-panel sidebar-panel">
      <div class="panel-header">
        <h2 class="vt-title">文件列表</h2>
        <div class="header-actions">
          <button class="vt-button-icon" @click="showFilterModal = true" title="导入偏好设置">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M2 4h4M10 4h4M2 8h4M10 8h4M2 12h4M10 12h4M6 2v4M12 6v4M6 10v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="vt-button-ghost import-button" @click="handleImport">
            <svg
              class="import-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M8 3V13M3 8H13"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            导入
          </button>
        </div>
      </div>

      <div v-if="videoFileCount > 0" class="select-toolbar">
        <button class="vt-button-ghost-sm" @click="handleSelectAll">
          {{ allVideosSelected ? '取消全选' : '全选' }} ({{ selectedCount }}/{{ videoFileCount }})
        </button>
      </div>

      <div class="panel-content">
        <!-- 空状态 -->
        <div v-if="roots.length === 0" class="empty-state">
          <div class="empty-icon">📁</div>
          <div class="empty-text vt-secondary">暂无文件</div>
          <div class="empty-hint vt-muted">点击"导入"按钮选择视频文件或文件夹</div>
        </div>

        <!-- 文件树 -->
        <div v-else class="file-tree">
          <FileTreeItem
            v-for="node in roots"
            :key="node.id"
            :node="node"
            :depth="0"
          />
        </div>
      </div>
    </div>

    <ImportFilterModal :visible="showFilterModal" @close="showFilterModal = false" @save="handleFilterSave" />

    <!-- 拖拽调整柄 -->
    <div
      class="resize-handle"
      @mousedown="handleResizeStart"
    ></div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useFileTreeStore } from '../store/file-tree';
import { useVideoStore } from '../store/useVideoStore';
import FileTreeItem from './FileTreeItem.vue';
import ImportFilterModal from './ImportFilterModal.vue';
import { useImportFilterStore } from '../store/useImportFilterStore';
import type { ImportFilterConfig } from '../types/import-filter';
import type { FileNode } from '../types/file-tree';

const fileTreeStore = useFileTreeStore();
const { roots } = storeToRefs(fileTreeStore);
const filterStore = useImportFilterStore();
const videoStore = useVideoStore();

const sidebarWidth = ref(260);
const showFilterModal = ref(false);

const videoFileCount = computed(() => {
  let count = 0;
  function countVideos(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.type === 'file') count++;
      else if (node.children) countVideos(node.children);
    }
  }
  countVideos(roots.value);
  return count;
});

const selectedCount = computed(() => videoStore.selectedVideos.length);

const allVideosSelected = computed(() =>
  videoFileCount.value > 0 && selectedCount.value === videoFileCount.value
);

async function handleImport() {
  try {
    const result = await window.motionSlice.selectMediaFilesWithFilter({ ...filterStore.config });
    fileTreeStore.roots = result.fileTree;
    if (result.summary) {
      console.log(result.summary);
    }
  } catch (error) {
    console.error('导入文件失败:', error);
    alert('导入文件失败，请重试');
  }
}

function handleFilterSave(config: ImportFilterConfig) {
  console.log('过滤配置已保存:', config);
}

function handleSelectAll() {
  if (allVideosSelected.value) {
    videoStore.setSelectedVideos([]);
  } else {
    const allVideos: FileNode[] = [];
    function collectVideos(nodes: FileNode[]) {
      for (const node of nodes) {
        if (node.type === 'file') allVideos.push(node);
        else if (node.children) collectVideos(node.children);
      }
    }
    collectVideos(roots.value);
    videoStore.setSelectedVideos(allVideos);
  }
}

// 拖拽调整宽度
let isResizing = false;
let startX = 0;
let startWidth = 0;

function handleResizeStart(e: MouseEvent) {
  isResizing = true;
  startX = e.clientX;
  startWidth = sidebarWidth.value;

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;

  const deltaX = e.clientX - startX;
  const newWidth = startWidth + deltaX;

  // 限制宽度范围：200px - 600px
  sidebarWidth.value = Math.max(200, Math.min(600, newWidth));
}

function handleResizeEnd() {
  isResizing = false;
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}
</script>

<style scoped>
.sidebar {
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.sidebar-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--vt-space-4);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--vt-space-4);
}

.panel-header h2 {
  font-size: 14px;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--vt-space-2);
  align-items: center;
}

.vt-button-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  background: transparent;
  color: var(--vt-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 180ms ease;
}

.vt-button-icon:hover {
  background: var(--vt-bg-soft);
  border-color: var(--vt-border-strong);
  color: var(--vt-text);
}

.import-button {
  height: 28px;
  padding: 0 var(--vt-space-3);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
}

.import-icon {
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.select-toolbar {
  padding: var(--vt-space-2) var(--vt-space-4);
  border-bottom: 1px solid var(--vt-border);
  background: var(--vt-bg-soft);
}

.vt-button-ghost-sm {
  height: 24px;
  padding: 0 var(--vt-space-2);
  font-size: 12px;
  border: none;
  background: transparent;
  color: var(--vt-text-secondary);
  cursor: pointer;
  transition: all 180ms ease;
}

.vt-button-ghost-sm:hover {
  color: var(--vt-text);
  background: rgba(255, 255, 255, 0.04);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--vt-space-8) var(--vt-space-4);
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--vt-space-3);
  opacity: 0.3;
}

.empty-text {
  font-size: 14px;
  margin-bottom: var(--vt-space-2);
}

.empty-hint {
  font-size: 12px;
}

/* 文件树 */
.file-tree {
  width: 100%;
}

/* 拖拽调整柄 */
.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 180ms ease;
}

.resize-handle:hover {
  background: var(--vt-border-strong);
}
</style>
