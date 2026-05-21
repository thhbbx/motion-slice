<template>
  <aside class="sidebar" :style="{ width: `${sidebarWidth}px` }">
    <div class="vt-panel sidebar-panel">
      <div class="panel-header">
        <h2 class="vt-title">文件列表</h2>
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

    <!-- 拖拽调整柄 -->
    <div
      class="resize-handle"
      @mousedown="handleResizeStart"
    ></div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useFileTreeStore } from '../store/file-tree';
import FileTreeItem from './FileTreeItem.vue';

const fileTreeStore = useFileTreeStore();
const { roots } = storeToRefs(fileTreeStore);

// 侧边栏宽度（200px - 600px）
const sidebarWidth = ref(260);

// 处理导入按钮点击
async function handleImport() {
  try {
    await fileTreeStore.loadFileTree();
  } catch (error) {
    console.error('导入文件失败:', error);
    alert('导入文件失败，请重试');
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
