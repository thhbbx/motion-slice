<template>
  <div class="file-tree-item">
    <!-- 节点内容 -->
    <div
      class="tree-node"
      :class="{
        'tree-node-selected': isSelected,
        'tree-node-directory': node.type === 'directory',
      }"
      :style="{ paddingLeft: `calc(var(--vt-space-4) * ${depth})` }"
      @click="handleNodeClick"
      :title="node.name"
    >
      <input
        v-if="node.type === 'file'"
        type="checkbox"
        :checked="isSelected"
        @click.stop="handleCheckboxClick"
        class="tree-checkbox"
      />

      <!-- 文件夹箭头图标 -->
      <svg
        v-if="node.type === 'directory'"
        class="tree-icon-arrow"
        :class="{ 'tree-icon-arrow-expanded': isExpanded }"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M6 4L10 8L6 12"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <!-- 文件夹图标 -->
      <svg
        v-if="node.type === 'directory'"
        class="tree-icon-folder"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M2 4.5C2 3.67157 2.67157 3 3.5 3H6L7.5 4.5H12.5C13.3284 4.5 14 5.17157 14 6V11.5C14 12.3284 13.3284 13 12.5 13H3.5C2.67157 13 2 12.3284 2 11.5V4.5Z"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <!-- 视频文件图标 -->
      <svg
        v-else
        class="tree-icon-video"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <rect
          x="2"
          y="4"
          width="9"
          height="8"
          rx="1.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M11 6.5L13.5 5V11L11 9.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <!-- 节点信息 -->
      <div class="tree-node-content">
        <div class="tree-node-name">{{ node.name }}</div>
        <div v-if="node.type === 'file' && node.metadata" class="tree-node-meta vt-secondary vt-timecode">
          {{ node.metadata.duration }} • {{ node.metadata.resolution }} • {{ node.metadata.size }}
        </div>
      </div>
    </div>

    <!-- 递归渲染子节点 -->
    <div v-if="node.type === 'directory' && isExpanded && node.children" class="tree-children">
      <FileTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useFileTreeStore } from '../store/file-tree';
import { useVideoStore } from '../store/useVideoStore';
import type { FileNode } from '../types/file-tree';

interface Props {
  node: FileNode;
  depth: number;
}

const props = defineProps<Props>();

const fileTreeStore = useFileTreeStore();
const videoStore = useVideoStore();

const isSelected = computed(() => {
  return props.node.type === 'file' &&
         videoStore.selectedVideos.some(v => v.id === props.node.id);
});

const isExpanded = computed(() => {
  return props.node.type === 'directory' && fileTreeStore.isDirectoryExpanded(props.node.id);
});

function handleNodeClick(event: MouseEvent) {
  if (props.node.type === 'directory') {
    fileTreeStore.toggleDirectory(props.node.id);
  } else {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      videoStore.toggleVideoSelection(props.node);
    } else {
      videoStore.setActiveVideo(props.node);
    }
  }
}

function handleCheckboxClick() {
  videoStore.toggleVideoSelection(props.node);
}
</script>

<style scoped>
.file-tree-item {
  width: 100%;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  min-height: 32px;
  padding-top: var(--vt-space-1);
  padding-bottom: var(--vt-space-1);
  padding-right: var(--vt-space-2);
  cursor: pointer;
  transition: background 180ms ease;
  position: relative;
}

.tree-node:hover {
  background: rgba(255, 255, 255, 0.04);
}

.tree-node-selected {
  background: var(--vt-primary-soft);
}

.tree-node-selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--vt-space-1);
  bottom: var(--vt-space-1);
  width: 2px;
  background: var(--vt-primary);
}

.tree-icon-arrow {
  flex-shrink: 0;
  color: var(--vt-text-secondary);
  transition: transform 180ms ease;
}

.tree-icon-arrow-expanded {
  transform: rotate(90deg);
}

.tree-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--vt-primary);
}

.tree-icon-folder,
.tree-icon-video {
  flex-shrink: 0;
  color: var(--vt-text-secondary);
}

.tree-node-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.tree-node-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-node-meta {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-children {
  width: 100%;
}
</style>
