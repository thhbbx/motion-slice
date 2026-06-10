<template>
  <div class="batch-grid-container">
    <div class="grid-header">
      <h3 class="grid-title">批量视频列表 ({{ videos.length }} 个)</h3>
    </div>

    <div class="grid-table">
      <table>
        <thead>
          <tr>
            <th>文件名称</th>
            <th>原始时长</th>
            <th>文件大小</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="video in videos" :key="video.id" class="grid-row">
            <td class="cell-name">{{ video.name }}</td>
            <td class="cell-duration vt-timecode">{{ video.metadata?.duration || '--' }}</td>
            <td class="cell-size">{{ video.metadata?.size || '--' }}</td>
            <td class="cell-status">
              <span class="status-badge status-ready">就绪</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileNode } from '../types/file-tree';

defineProps<{
  videos: FileNode[];
}>();
</script>

<style scoped>
.batch-grid-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-xl);
  overflow: hidden;
}

.grid-header {
  padding: var(--vt-space-4);
  border-bottom: 1px solid var(--vt-border);
  background: var(--vt-bg-soft);
}

.grid-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.grid-table {
  flex: 1;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  position: sticky;
  top: 0;
  background: var(--vt-bg-soft);
  z-index: 10;
}

th {
  padding: var(--vt-space-3) var(--vt-space-4);
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--vt-text-secondary);
  border-bottom: 1px solid var(--vt-border);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.grid-row {
  transition: background 180ms ease;
}

.grid-row:hover {
  background: var(--vt-bg-soft);
}

td {
  padding: var(--vt-space-3) var(--vt-space-4);
  font-size: 13px;
  border-bottom: 1px solid var(--vt-border);
}

.cell-name {
  font-weight: 500;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-duration,
.cell-size {
  color: var(--vt-text-secondary);
}

.status-badge {
  display: inline-block;
  padding: 2px var(--vt-space-2);
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--vt-radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-ready {
  background: var(--vt-primary-soft);
  color: var(--vt-primary);
}
</style>
