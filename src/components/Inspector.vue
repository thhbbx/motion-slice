<template>
  <aside class="inspector">
    <div class="vt-panel inspector-panel">
      <!-- Tab 导航 -->
      <div class="inspector-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab 内容区 -->
      <div class="inspector-content">
        <!-- 属性 Tab -->
        <div v-if="activeTab === 'properties'" class="tab-pane">
          <div v-if="activeVideo" class="properties-section">
            <h3 class="section-title vt-title">视频信息</h3>
            <div class="info-row">
              <span class="info-label vt-secondary">文件名</span>
              <span class="info-value">{{ activeVideo.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label vt-secondary">路径</span>
              <span class="info-value vt-muted" :title="activeVideo.path">
                {{ truncatePath(activeVideo.path) }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label vt-secondary">大小</span>
              <span class="info-value">{{ formatFileSize(activeVideo.size) }}</span>
            </div>
            <div class="info-row">
              <span class="info-label vt-secondary">类型</span>
              <span class="info-value">{{ activeVideo.type }}</span>
            </div>
          </div>

          <div v-else class="empty-state">
            <div class="empty-icon">📄</div>
            <div class="empty-text vt-secondary">未选择视频</div>
            <div class="empty-hint vt-muted">从左侧选择视频文件查看属性</div>
          </div>
        </div>

        <!-- 分析 Tab（占位） -->
        <div v-else-if="activeTab === 'analysis'" class="tab-pane">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text vt-secondary">晃动分析</div>
            <div class="empty-hint vt-muted">功能开发中</div>
          </div>
        </div>

        <!-- 导出 Tab（占位） -->
        <div v-else-if="activeTab === 'export'" class="tab-pane">
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <div class="empty-text vt-secondary">导出设置</div>
            <div class="empty-hint vt-muted">功能开发中</div>
          </div>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="inspector-actions">
        <button class="vt-button-primary" :disabled="!activeVideo">
          开始分析
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';

const videoStore = useVideoStore();
const { activeVideo } = storeToRefs(videoStore);

const activeTab = ref<'properties' | 'analysis' | 'export'>('properties');

const tabs = [
  { id: 'properties', label: '属性' },
  { id: 'analysis', label: '分析' },
  { id: 'export', label: '导出' },
] as const;

// 截断路径显示
function truncatePath(path: string): string {
  if (path.length <= 40) return path;
  return '...' + path.slice(-37);
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
</script>

<style scoped>
.inspector {
  width: 340px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.inspector-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

/* Tab 导航 */
.inspector-tabs {
  display: flex;
  gap: var(--vt-space-1);
  padding: var(--vt-space-3);
  border-bottom: 1px solid var(--vt-border);
  background: var(--vt-bg-soft);
}

.tab-button {
  flex: 1;
  height: 36px;
  padding: 0 var(--vt-space-3);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  background: transparent;
  color: var(--vt-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 180ms ease;
}

.tab-button:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--vt-border-strong);
  color: var(--vt-text-regular);
}

.tab-button.active {
  background: var(--vt-primary);
  border-color: var(--vt-primary);
  color: var(--vt-text);
}

/* Tab 内容区 */
.inspector-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--vt-space-4);
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
}

/* 属性面板 */
.properties-section {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.section-title {
  font-size: 14px;
  margin-bottom: var(--vt-space-2);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--vt-space-2) 0;
  font-size: 14px;
  gap: var(--vt-space-3);
}

.info-label {
  font-size: 13px;
  flex-shrink: 0;
}

.info-value {
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--vt-space-8);
  text-align: center;
  min-height: 200px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--vt-space-4);
  opacity: 0.2;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: var(--vt-space-2);
}

.empty-hint {
  font-size: 13px;
}

/* 底部操作按钮 */
.inspector-actions {
  padding: var(--vt-space-4);
  border-top: 1px solid var(--vt-border);
  background: var(--vt-bg-soft);
}

.inspector-actions button {
  width: 100%;
}

.inspector-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
