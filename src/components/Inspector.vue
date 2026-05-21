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

        <!-- 分析 Tab -->
        <div v-else-if="activeTab === 'analysis'" class="tab-pane">
          <div v-if="activeVideo" class="analysis-section">
            <!-- 分析设置折叠面板 -->
            <div class="collapsible-panel">
              <button class="panel-toggle" @click="toggleAnalysisSettings">
                <span class="toggle-icon">{{ analysisSettingsExpanded ? '▼' : '▶' }}</span>
                <span class="toggle-label">分析设置</span>
              </button>

              <div v-if="analysisSettingsExpanded" class="panel-body">
                <!-- 启用晃动检测 -->
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-text">启用晃动检测</span>
                    <input type="checkbox" v-model="analysisConfig.enableShakeDetection" class="vt-switch" />
                  </label>
                </div>

                <!-- 灵敏度滑块 -->
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-text">灵敏度</span>
                    <span class="label-value vt-secondary">{{ analysisConfig.sensitivity }}%</span>
                  </label>
                  <input
                    type="range"
                    v-model.number="analysisConfig.sensitivity"
                    min="0"
                    max="100"
                    step="5"
                    class="vt-slider"
                    :disabled="!analysisConfig.enableShakeDetection"
                  />
                </div>

                <!-- 最小持续时间 -->
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-text">最小持续时间（秒）</span>
                    <span class="label-value vt-secondary">{{ analysisConfig.minDuration }}</span>
                  </label>
                  <input
                    type="range"
                    v-model.number="analysisConfig.minDuration"
                    min="0.1"
                    max="5"
                    step="0.1"
                    class="vt-slider"
                    :disabled="!analysisConfig.enableShakeDetection"
                  />
                </div>
              </div>
            </div>

            <!-- 分析结果列表 -->
            <div class="analysis-results">
              <h3 class="section-title vt-title">检测结果</h3>
              <div class="result-list">
                <div class="empty-state-inline">
                  <span class="vt-muted">暂无分析结果</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text vt-secondary">晃动分析</div>
            <div class="empty-hint vt-muted">选择视频后开始分析</div>
          </div>
        </div>

        <!-- 导出 Tab -->
        <div v-else-if="activeTab === 'export'" class="tab-pane">
          <div v-if="activeVideo" class="export-section">
            <!-- 导出设置 -->
            <div class="export-settings">
              <h3 class="section-title vt-title">导出设置</h3>

              <!-- 输出格式 -->
              <div class="form-row">
                <label class="form-label">
                  <span class="label-text">输出格式</span>
                </label>
                <select v-model="exportConfig.format" class="vt-select">
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                  <option value="avi">AVI</option>
                </select>
              </div>

              <!-- 视频质量 -->
              <div class="form-row">
                <label class="form-label">
                  <span class="label-text">视频质量</span>
                  <span class="label-value vt-secondary">{{ exportConfig.quality }}%</span>
                </label>
                <input
                  type="range"
                  v-model.number="exportConfig.quality"
                  min="10"
                  max="100"
                  step="10"
                  class="vt-slider"
                />
              </div>

              <!-- 输出目录 -->
              <div class="form-row">
                <label class="form-label">
                  <span class="label-text">输出目录</span>
                </label>
                <div class="path-input-group">
                  <input
                    type="text"
                    v-model="exportConfig.outputDir"
                    class="vt-input"
                    readonly
                    placeholder="选择输出目录"
                  />
                  <button class="vt-button-ghost path-button">浏览</button>
                </div>
              </div>
            </div>

            <!-- 导出队列 -->
            <div class="export-queue">
              <h3 class="section-title vt-title">导出队列</h3>
              <div class="queue-list">
                <div class="empty-state-inline">
                  <span class="vt-muted">暂无导出任务</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <div class="empty-icon">📦</div>
            <div class="empty-text vt-secondary">导出设置</div>
            <div class="empty-hint vt-muted">选择视频后配置导出</div>
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

// 分析设置折叠状态
const analysisSettingsExpanded = ref(true);

// 分析配置
const analysisConfig = ref({
  enableShakeDetection: true,
  sensitivity: 50,
  minDuration: 0.5,
});

// 导出配置
const exportConfig = ref({
  format: 'mp4',
  quality: 80,
  outputDir: '',
});

function toggleAnalysisSettings() {
  analysisSettingsExpanded.value = !analysisSettingsExpanded.value;
}

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

/* 折叠面板 */
.collapsible-panel {
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  overflow: hidden;
}

.panel-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  padding: var(--vt-space-3);
  border: none;
  background: var(--vt-bg-soft);
  color: var(--vt-text-regular);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 180ms ease;
}

.panel-toggle:hover {
  background: var(--vt-bg-elevated);
}

.toggle-icon {
  font-size: 10px;
  color: var(--vt-text-secondary);
}

.toggle-label {
  flex: 1;
  text-align: left;
}

.panel-body {
  padding: var(--vt-space-4);
  background: var(--vt-bg);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
}

/* 表单行 */
.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.label-text {
  color: var(--vt-text-regular);
  font-weight: 500;
}

.label-value {
  font-size: 12px;
}

/* Switch 开关 */
.vt-switch {
  width: 44px;
  height: 24px;
  appearance: none;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-full);
  cursor: pointer;
  position: relative;
  transition: all 180ms ease;
}

.vt-switch::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--vt-text-secondary);
  border-radius: 50%;
  transition: all 180ms ease;
}

.vt-switch:checked {
  background: var(--vt-primary);
  border-color: var(--vt-primary);
}

.vt-switch:checked::before {
  left: 22px;
  background: var(--vt-text);
}

/* Slider 滑块 */
.vt-slider {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--vt-bg-soft);
  border-radius: var(--vt-radius-full);
  outline: none;
  cursor: pointer;
}

.vt-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--vt-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: all 180ms ease;
}

.vt-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 0 4px var(--vt-primary-glow);
}

.vt-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vt-slider:disabled::-webkit-slider-thumb {
  cursor: not-allowed;
}

/* 分析结果区域 */
.analysis-section {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
}

.analysis-results {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.empty-state-inline {
  padding: var(--vt-space-4);
  text-align: center;
  font-size: 13px;
  border: 1px dashed var(--vt-border);
  border-radius: var(--vt-radius-md);
}

/* 导出设置区域 */
.export-section {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
}

.export-settings {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

/* Select 下拉框 */
.vt-select {
  width: 100%;
  height: 40px;
  padding: 0 var(--vt-space-3);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  background: rgba(26, 26, 30, 0.9);
  color: var(--vt-text-regular);
  font-size: 14px;
  outline: none;
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.vt-select:focus {
  border-color: var(--vt-border-active);
  box-shadow: 0 0 0 4px var(--vt-primary-glow);
}

/* 路径输入组 */
.path-input-group {
  display: flex;
  gap: var(--vt-space-2);
}

.path-input-group .vt-input {
  flex: 1;
}

.path-button {
  height: 40px;
  padding: 0 var(--vt-space-3);
  flex-shrink: 0;
}

/* 导出队列 */
.export-queue {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}
</style>
