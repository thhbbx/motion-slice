<template>
  <aside class="inspector">
    <!-- SVG 图标库 -->
    <svg style="display: none;">
      <symbol id="icon-folder-open" viewBox="0 0 16 16">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14 13.5V5.5a1 1 0 0 0-1-1H8.5L7 3H2.5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1z"
        />
      </symbol>
      <symbol id="icon-loader" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
      </symbol>
    </svg>

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
            <!-- 文件名（大字号，粗字重） -->
            <div class="file-header">
              <div class="file-name-row">
                <div class="file-name">{{ activeVideo.name }}</div>
                <!-- 加载状态指示器 -->
                <div v-if="isFetchingMetadata" class="loading-indicator">
                  <svg class="loading-spinner" width="14" height="14">
                    <use href="#icon-loader"></use>
                  </svg>
                  <span class="loading-text vt-muted">读取中...</span>
                </div>
              </div>
              <!-- 路径（小字号，弱化，自动换行） -->
              <div class="file-path vt-muted">{{ activeVideo.path }}</div>
            </div>

            <!-- 分割线 -->
            <div class="divider"></div>

            <!-- 规格列表（左右对齐 Key-Value） -->
            <div class="specs-list">
              <div class="spec-row">
                <span class="spec-label vt-secondary">文件大小</span>
                <span class="spec-value">{{ formatFileSize(activeVideo.metadata?.size) }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">时长</span>
                <span class="spec-value vt-timecode">{{ activeVideo.metadata?.duration || '--' }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">分辨率</span>
                <span class="spec-value">{{ activeVideo.metadata?.resolution || '--' }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">帧率</span>
                <span class="spec-value">{{ formatFrameRate(activeVideo.metadata) }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">视频编码</span>
                <span class="spec-value">{{ activeVideo.metadata?.videoCodec || '--' }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">音频编码</span>
                <span class="spec-value">{{ activeVideo.metadata?.audioCodec || '--' }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">码率</span>
                <span class="spec-value">{{ formatBitrate(activeVideo.metadata) }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label vt-secondary">创建时间</span>
                <span class="spec-value">{{ formatCreatedTime(activeVideo.metadata) }}</span>
              </div>
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

      <!-- 底部操作按钮（上下文感知） -->
      <div class="inspector-actions">
        <button
          v-if="activeTab === 'properties'"
          class="vt-button-ghost action-button action-button-fusion"
          :disabled="!activeVideo"
          @click="handleShowInFolder"
        >
          <svg class="button-icon button-icon-windows" width="16" height="16">
            <use href="#icon-folder-open"></use>
          </svg>
          <span>在资源管理器中显示</span>
        </button>
        <button
          v-else-if="activeTab === 'analysis'"
          class="vt-button-primary"
          :disabled="!activeVideo"
        >
          开始检测晃动
        </button>
        <button
          v-else-if="activeTab === 'export'"
          class="vt-button-primary"
          :disabled="!activeVideo"
        >
          执行导出
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
const { activeVideo, isFetchingMetadata } = storeToRefs(videoStore);

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

/**
 * 在资源管理器中显示当前视频文件
 */
function handleShowInFolder() {
  if (!activeVideo.value) return;

  try {
    window.motionSlice.showItemInFolder(activeVideo.value.path);
  } catch (error) {
    console.error('打开资源管理器失败:', error);
  }
}

// 格式化文件大小（安全处理 NaN）
function formatFileSize(sizeStr: string | undefined): string {
  if (!sizeStr) return '--';

  // 尝试从字符串中提取数字（如 "125.4 MB" -> 125.4）
  const match = sizeStr.match(/[\d.]+/);
  if (!match) return sizeStr; // 如果已经是格式化的字符串，直接返回

  const bytes = parseFloat(match[0]);
  if (isNaN(bytes) || bytes === 0) return '--';

  // 如果字符串中包含单位，直接返回
  if (/[KMGT]B/i.test(sizeStr)) return sizeStr;

  // 否则按字节数格式化
  if (bytes < 1024) return bytes.toFixed(0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// 格式化帧率
function formatFrameRate(metadata: any): string {
  if (!metadata || !metadata.fps) return '--';
  return metadata.fps;
}

// 格式化码率
function formatBitrate(metadata: any): string {
  if (!metadata || !metadata.bitrate) return '--';
  return metadata.bitrate;
}

// 格式化创建时间
function formatCreatedTime(metadata: any): string {
  if (!metadata || !metadata.createdAt) return '--';
  return metadata.createdAt;
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
  gap: var(--vt-space-4);
}

/* 文件头部（文件名 + 路径） */
.file-header {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.file-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--vt-space-3);
  min-height: 20px; /* 防止布局跳动 */
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text);
  line-height: 1.4;
  flex: 1;
}

/* 加载状态指示器 */
.loading-indicator {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  flex-shrink: 0;
}

.loading-spinner {
  flex-shrink: 0;
  color: var(--vt-primary);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 12px;
  white-space: nowrap;
}

.file-path {
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
  opacity: 0.7;
}

/* 分割线 */
.divider {
  border-top: 1px solid var(--vt-border);
  margin: var(--vt-space-2) 0;
}

/* 规格列表 */
.specs-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.spec-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.spec-label {
  flex-shrink: 0;
}

.spec-value {
  font-weight: 500;
  text-align: right;
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

/* 操作按钮图标 */
.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--vt-space-2);
}

.button-icon {
  flex-shrink: 0;
  color: currentColor;
  opacity: 0.8;
  transition: opacity 180ms ease;
}

.action-button:hover:not(:disabled) .button-icon {
  opacity: 1;
}

.action-button:disabled .button-icon {
  opacity: 0.4;
}
</style>
