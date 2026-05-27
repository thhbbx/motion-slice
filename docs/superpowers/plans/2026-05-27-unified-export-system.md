# 统一导出调度中心与 FFmpeg 物理切割流水线 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建解耦的导出任务调度系统，支持多工具扩展，并实现基于 FFmpeg 的视频物理切分与实时进度反馈。

**架构：** 采用统一任务契约（ExportTask）作为工具与导出面板的解耦层，主进程使用 fluent-ffmpeg 执行物理切割，通过 IPC 事件流实时回传进度，前端队列动态映射任务状态。

**技术栈：** Pinia (状态管理)、Electron IPC (进程通信)、fluent-ffmpeg (视频处理)、Vue 3 Composition API

---

## 文件结构

### 新建文件
- `src/types/export.ts` - 导出任务类型定义（ExportTask、ExportQueueItem、ExportProgress）
- `src/store/useExportStore.ts` - 导出任务全局状态管理
- `src/main/handlers/export-handler.ts` - 主进程 FFmpeg 导出引擎
- `src/components/ExportTab.vue` - 导出面板 UI 组件（替换 Inspector.vue 中的内联实现）

### 修改文件
- `src/components/tools/ToolSlicer.vue:174-198` - 添加导出任务推送逻辑
- `src/components/Inspector.vue:139-207` - 重构导出 Tab，使用独立组件
- `src/preload.ts:39-50` - 添加导出相关 IPC 桥接
- `src/main.ts` - 注册导出 handler

---

## 任务 1：定义导出任务类型契约

**文件：**
- 创建：`src/types/export.ts`

- [ ] **步骤 1：编写导出任务类型定义**

```typescript
/**
 * 导出任务状态
 */
export type ExportTaskStatus = 'pending' | 'processing' | 'success' | 'failed';

/**
 * 导出任务接口（工具无关的统一契约）
 */
export interface ExportTask {
  /** 唯一标识符 */
  id: string;
  /** 来源工具 ID（如 'slicer'） */
  toolId: string;
  /** 任务标题（如 "视频切片导出"） */
  title: string;
  /** 配置摘要文本（如 "按时长 60s 切分，共 12 个片段"） */
  summary: string;
  /** 任务状态 */
  status: ExportTaskStatus;
  /** 供主进程执行的具体数据（工具特定） */
  payload: ExportTaskPayload;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 导出任务 Payload（工具特定数据）
 */
export interface ExportTaskPayload {
  /** 视频源文件路径 */
  sourceFilePath: string;
  /** 切片数组（仅 slicer 工具使用） */
  segments?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    label: string;
  }>;
  /** 其他工具可扩展字段 */
  [key: string]: any;
}

/**
 * 导出队列项（UI 展示用）
 */
export interface ExportQueueItem {
  /** 任务 ID */
  taskId: string;
  /** 任务标题 */
  title: string;
  /** 当前进度（0-100） */
  progress: number;
  /** 状态 */
  status: ExportTaskStatus;
  /** 当前处理的片段索引（可选） */
  currentIndex?: number;
  /** 总片段数（可选） */
  totalCount?: number;
}

/**
 * 导出进度事件（主进程 -> 渲染进程）
 */
export interface ExportProgressEvent {
  /** 任务 ID */
  taskId: string;
  /** 当前完成数 */
  current: number;
  /** 总数 */
  total: number;
  /** 当前处理的片段标签 */
  currentLabel?: string;
}

/**
 * 导出执行参数（渲染进程 -> 主进程）
 */
export interface ExportExecuteParams {
  /** 任务 ID 数组 */
  taskIds: string[];
  /** 输出目录 */
  outputDir: string;
  /** 输出格式 */
  format: 'mp4' | 'mov' | 'avi';
  /** 视频质量（10-100） */
  quality: number;
}
```

- [ ] **步骤 2：验证类型文件编译通过**

运行：`npm run lint`
预期：无 TypeScript 错误

- [ ] **步骤 3：Commit**

```bash
git add src/types/export.ts
git commit -m "feat(类型): 定义统一导出任务契约与类型系统"
```

---

## 任务 2：创建导出任务全局状态管理

**文件：**
- 创建：`src/store/useExportStore.ts`

- [ ] **步骤 1：编写 Pinia Store 基础结构**

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ExportTask, ExportQueueItem } from '../types/export';

export const useExportStore = defineStore('export', () => {
  // 状态：待导出任务池
  const pendingTasks = ref<ExportTask[]>([]);
  
  // 状态：执行队列（运行时状态）
  const queueItems = ref<ExportQueueItem[]>([]);

  // 计算属性：是否有待导出任务
  const hasPendingTasks = computed(() => pendingTasks.value.length > 0);

  // 计算属性：是否正在执行导出
  const isExporting = computed(() => 
    queueItems.value.some(item => item.status === 'processing')
  );

  return {
    pendingTasks,
    queueItems,
    hasPendingTasks,
    isExporting,
  };
});
```

- [ ] **步骤 2：添加任务管理 Actions**

在 `return` 之前添加：

```typescript
  // Actions: 添加或更新任务
  function upsertTask(task: ExportTask) {
    const index = pendingTasks.value.findIndex(t => t.id === task.id);
    if (index >= 0) {
      pendingTasks.value[index] = task;
    } else {
      pendingTasks.value.push(task);
    }
  }

  // Actions: 移除任务
  function removeTask(taskId: string) {
    pendingTasks.value = pendingTasks.value.filter(t => t.id !== taskId);
  }

  // Actions: 清空所有任务
  function clearTasks() {
    pendingTasks.value = [];
  }

  // Actions: 更新队列项进度
  function updateQueueProgress(taskId: string, current: number, total: number) {
    const item = queueItems.value.find(q => q.taskId === taskId);
    if (item) {
      item.currentIndex = current;
      item.totalCount = total;
      item.progress = Math.round((current / total) * 100);
    }
  }

  // Actions: 设置队列项状态
  function setQueueStatus(taskId: string, status: ExportTask['status']) {
    const item = queueItems.value.find(q => q.taskId === taskId);
    if (item) {
      item.status = status;
    }
  }

  // Actions: 初始化执行队列
  function initQueue(taskIds: string[]) {
    queueItems.value = taskIds.map(taskId => {
      const task = pendingTasks.value.find(t => t.id === taskId);
      return {
        taskId,
        title: task?.title || '未知任务',
        progress: 0,
        status: 'pending' as const,
      };
    });
  }

  // Actions: 清空队列
  function clearQueue() {
    queueItems.value = [];
  }
```

并在 return 中添加这些 actions。

- [ ] **步骤 3：验证 Store 编译通过**

运行：`npm run lint`
预期：无 TypeScript 错误

- [ ] **步骤 4：Commit**

```bash
git add src/store/useExportStore.ts
git commit -m "feat(状态): 创建导出任务全局状态管理 Store"
```

---

## 任务 3：改造 ToolSlicer 推送导出任务

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue:174-198`

- [ ] **步骤 1：导入导出 Store 和类型**

在 `<script setup>` 顶部添加：

```typescript
import { useExportStore } from '../../store/useExportStore';
import type { ExportTask } from '../../types/export';
```

并初始化：

```typescript
const exportStore = useExportStore();
```

- [ ] **步骤 2：在切片分析成功后推送导出任务**

修改 `handleAnalyze` 函数，在 `sliceStore.setPreviewSlices(result.segments);` 之后添加：

```typescript
    // 推送导出任务到全局导出池
    const exportTask: ExportTask = {
      id: `slicer-${Date.now()}`,
      toolId: 'slicer',
      title: '视频切片导出',
      summary: `按${mode.value === 'duration' ? '时长' : '大小'} ${targetValue.value}${mode.value === 'duration' ? 's' : 'MB'} 切分，共 ${result.segments.length} 个片段`,
      status: 'pending',
      payload: {
        sourceFilePath: activeVideo.value.path,
        segments: result.segments.map(seg => ({
          id: seg.id,
          startTime: seg.startTime,
          endTime: seg.endTime,
          label: seg.label,
        })),
      },
      createdAt: Date.now(),
    };
    exportStore.upsertTask(exportTask);
    console.log('[ToolSlicer] 已推送导出任务到全局池:', exportTask.id);
```

- [ ] **步骤 3：验证功能**

运行：`npm start`
操作：生成切片预览
预期：控制台输出 "已推送导出任务到全局池"

- [ ] **步骤 4：Commit**

```bash
git add src/components/tools/ToolSlicer.vue
git commit -m "feat(切片): 切片生成后自动推送导出任务到全局池"
```

---

## 任务 4：创建独立的导出面板组件

**文件：**
- 创建：`src/components/ExportTab.vue`

- [ ] **步骤 1：编写组件模板结构（第一部分）**

```vue
<template>
  <div class="export-tab">
    <!-- 前置审查区 -->
    <div class="export-preview">
      <h3 class="section-title vt-title">待导出任务</h3>
      
      <!-- 空状态 -->
      <div v-if="!hasPendingTasks" class="empty-state-inline">
        <span class="vt-muted">当前暂无导出任务</span>
      </div>
      
      <!-- 任务列表 -->
      <div v-else class="task-list">
        <div
          v-for="task in pendingTasks"
          :key="task.id"
          class="task-item"
        >
          <div class="task-header">
            <span class="task-title">{{ task.title }}</span>
            <span class="task-tool vt-secondary">{{ task.toolId }}</span>
          </div>
          <div class="task-summary vt-muted">{{ task.summary }}</div>
        </div>
      </div>
    </div>

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
```

- [ ] **步骤 2：编写组件模板结构（第二部分）**

继续添加：

```vue
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
          <button 
            class="vt-button-ghost path-button"
            @click="handleSelectOutputDir"
          >
            浏览
          </button>
        </div>
      </div>
    </div>

    <!-- 导出队列 -->
    <div class="export-queue">
      <h3 class="section-title vt-title">导出队列</h3>
      
      <!-- 空状态 -->
      <div v-if="queueItems.length === 0" class="empty-state-inline">
        <span class="vt-muted">暂无正在执行的任务</span>
      </div>
      
      <!-- 队列列表 -->
      <div v-else class="queue-list">
        <div
          v-for="item in queueItems"
          :key="item.taskId"
          class="queue-item"
        >
          <div class="queue-header">
            <span class="queue-title">{{ item.title }}</span>
            <span class="queue-status" :class="`status-${item.status}`">
              {{ getStatusText(item.status) }}
            </span>
          </div>
          <div class="queue-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${item.progress}%` }"
              ></div>
            </div>
            <span class="progress-text vt-secondary">
              {{ item.currentIndex || 0 }} / {{ item.totalCount || 0 }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 执行按钮 -->
    <div class="export-actions">
      <button
        class="vt-button-primary"
        :disabled="!canExecute"
        @click="handleExecuteExport"
      >
        <span v-if="!isExporting">执行导出</span>
        <span v-else class="loading-text">
          <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
          导出中...
        </span>
      </button>
    </div>
  </div>
</template>
```

- [ ] **步骤 3：编写组件脚本逻辑**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useExportStore } from '../store/useExportStore';
import type { ExportTaskStatus } from '../types/export';

const exportStore = useExportStore();
const { pendingTasks, queueItems, hasPendingTasks, isExporting } = storeToRefs(exportStore);

// 导出配置
const exportConfig = ref({
  format: 'mp4' as 'mp4' | 'mov' | 'avi',
  quality: 80,
  outputDir: '',
});

// 计算属性：是否可以执行导出
const canExecute = computed(() => {
  return hasPendingTasks.value && 
         exportConfig.value.outputDir !== '' && 
         !isExporting.value;
});

/**
 * 选择输出目录
 */
async function handleSelectOutputDir() {
  try {
    const result = await window.motionSlice.selectOutputDir();
    if (result) {
      exportConfig.value.outputDir = result;
    }
  } catch (error) {
    console.error('选择输出目录失败:', error);
  }
}

/**
 * 执行导出
 */
async function handleExecuteExport() {
  if (!canExecute.value) return;

  try {
    const taskIds = pendingTasks.value.map(t => t.id);
    
    // 初始化队列
    exportStore.initQueue(taskIds);
    
    // 调用主进程执行导出
    await window.motionSlice.executeExport({
      taskIds,
      outputDir: exportConfig.value.outputDir,
      format: exportConfig.value.format,
      quality: exportConfig.value.quality,
    });
    
    console.log('[ExportTab] 导出任务已提交');
  } catch (error) {
    console.error('执行导出失败:', error);
  }
}

/**
 * 获取状态文本
 */
function getStatusText(status: ExportTaskStatus): string {
  const statusMap: Record<ExportTaskStatus, string> = {
    pending: '等待中',
    processing: '导出中',
    success: '已完成',
    failed: '失败',
  };
  return statusMap[status] || '未知';
}
</script>
```

- [ ] **步骤 4：Commit**

```bash
git add src/components/ExportTab.vue
git commit -m "feat(导出): 创建独立的导出面板组件"
```

---

## 任务 5：添加导出面板样式

**文件：**
- 修改：`src/components/ExportTab.vue`

- [ ] **步骤 1：添加组件样式**

在 `</script>` 后添加：

```vue
<style scoped>
.export-tab {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  height: 100%;
}

/* 前置审查区 */
.export-preview {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.section-title {
  font-size: 14px;
  margin: 0;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.task-item {
  padding: var(--vt-space-3);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--vt-space-1);
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text-regular);
}

.task-tool {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.task-summary {
  font-size: 12px;
  line-height: 1.4;
}

/* 导出设置 */
.export-settings {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

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

.vt-slider {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--vt-bg-elevated);
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
  flex: 1;
  overflow: hidden;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
  overflow-y: auto;
}

.queue-item {
  padding: var(--vt-space-3);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--vt-space-2);
}

.queue-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text-regular);
}

.queue-status {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-pending {
  color: var(--vt-text-secondary);
}

.status-processing {
  color: var(--vt-info);
}

.status-success {
  color: var(--vt-success);
}

.status-failed {
  color: var(--vt-danger);
}

.queue-progress {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--vt-bg-soft);
  border-radius: var(--vt-radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--vt-primary);
  transition: width 300ms ease;
}

.progress-text {
  font-size: 12px;
  font-family: var(--vt-font-mono);
  flex-shrink: 0;
}

/* 空状态 */
.empty-state-inline {
  padding: var(--vt-space-4);
  text-align: center;
  font-size: 13px;
  border: 1px dashed var(--vt-border);
  border-radius: var(--vt-radius-md);
}

/* 执行按钮 */
.export-actions {
  padding-top: var(--vt-space-2);
}

.export-actions button {
  width: 100%;
}

.export-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--vt-space-2);
}

.spinner {
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
</style>
```

- [ ] **步骤 2：验证样式**

运行：`npm start`
预期：导出面板样式符合设计规范

- [ ] **步骤 3：Commit**

```bash
git add src/components/ExportTab.vue
git commit -m "style(导出): 添加导出面板样式"
```

---

## 任务 6：重构 Inspector 使用独立导出组件

**文件：**
- 修改：`src/components/Inspector.vue:139-207`

- [ ] **步骤 1：导入 ExportTab 组件**

在 `<script setup>` 中添加：

```typescript
import ExportTab from './ExportTab.vue';
```

- [ ] **步骤 2：替换导出 Tab 内容**

将第 139-207 行的内联导出实现替换为：

```vue
        <!-- 导出 Tab -->
        <div v-else-if="activeTab === 'export'" class="tab-pane">
          <ExportTab v-if="activeVideo" />
          
          <div v-else class="empty-state">
            <div class="empty-icon">📦</div>
            <div class="empty-text vt-secondary">导出设置</div>
            <div class="empty-hint vt-muted">选择视频后配置导出</div>
          </div>
        </div>
```

- [ ] **步骤 3：移除底部导出按钮**

删除第 224-229 行的导出按钮代码（因为按钮已集成到 ExportTab 组件中）：

```vue
        <button
          v-else-if="activeTab === 'export'"
          class="vt-button-primary"
          :disabled="!activeVideo"
        >
          执行导出
        </button>
```

- [ ] **步骤 4：移除导出配置状态**

删除第 258-263 行的 `exportConfig` ref（已移至 ExportTab 组件）：

```typescript
// 导出配置
const exportConfig = ref({
  format: 'mp4',
  quality: 80,
  outputDir: '',
});
```

- [ ] **步骤 5：验证重构**

运行：`npm start`
预期：导出 Tab 正常显示，功能完整

- [ ] **步骤 6：Commit**

```bash
git add src/components/Inspector.vue
git commit -m "refactor(导出): 重构 Inspector 使用独立导出组件"
```

---

## 任务 7：主进程 FFmpeg 导出引擎（第一部分：基础结构）

**文件：**
- 创建：`src/main/handlers/export-handler.ts`

- [ ] **步骤 1：编写导入和辅助函数**

```typescript
import { ipcMain, dialog, BrowserWindow } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import path from 'node:path';
import fs from 'node:fs';
import { getFfmpegPath } from '../utils/ffmpeg-helper';
import type { ExportExecuteParams, ExportTask } from '../../types/export';

// 配置 ffmpeg 路径
const ffmpegPath = getFfmpegPath();
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * 生成安全的文件名（移除特殊字符）
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * 确保输出目录存在
 */
function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}
```

- [ ] **步骤 2：编写单个切片导出函数**

```typescript
/**
 * 导出单个视频切片
 * @param sourceFilePath 源视频路径
 * @param outputPath 输出文件路径
 * @param startTime 起始时间（秒）
 * @param endTime 结束时间（秒）
 * @param quality 质量（10-100）
 * @returns Promise<void>
 */
function exportSegment(
  sourceFilePath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
  quality: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = endTime - startTime;
    
    // 质量映射：10-100 -> CRF 28-18（数值越小质量越高）
    const crf = Math.round(28 - (quality / 100) * 10);
    
    ffmpeg(sourceFilePath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-c:v libx264',        // 视频编码器
        `-crf ${crf}`,         // 质量控制
        '-preset fast',        // 编码速度预设
        '-c:a aac',            // 音频编码器
        '-b:a 128k',           // 音频码率
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`[ExportHandler] 切片导出完成: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`[ExportHandler] 切片导出失败: ${outputPath}`, err);
        reject(new Error(`导出失败: ${err.message}`));
      })
      .run();
  });
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/main/handlers/export-handler.ts
git commit -m "feat(主进程): 创建 FFmpeg 导出引擎基础结构"
```

---

## 任务 8：主进程 FFmpeg 导出引擎（第二部分：核心逻辑）

**文件：**
- 修改：`src/main/handlers/export-handler.ts`

- [ ] **步骤 1：编写批量导出函数**

在文件末尾添加：

```typescript
/**
 * 批量导出切片任务
 * @param task 导出任务
 * @param outputDir 输出目录
 * @param format 输出格式
 * @param quality 质量
 * @param mainWindow 主窗口（用于发送进度事件）
 */
async function exportSlicerTask(
  task: ExportTask,
  outputDir: string,
  format: string,
  quality: number,
  mainWindow: BrowserWindow
): Promise<void> {
  const { sourceFilePath, segments } = task.payload;
  
  if (!segments || segments.length === 0) {
    throw new Error('切片数组为空');
  }

  // 确保输出目录存在
  ensureOutputDir(outputDir);

  // 获取源文件名（不含扩展名）
  const sourceBasename = path.basename(sourceFilePath, path.extname(sourceFilePath));

  // 逐个导出切片
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // 生成输出文件名
    const outputFilename = sanitizeFilename(`${sourceBasename}_${segment.label}.${format}`);
    const outputPath = path.join(outputDir, outputFilename);

    console.log(`[ExportHandler] 开始导出切片 ${i + 1}/${segments.length}: ${segment.label}`);

    // 发送进度事件到渲染进程
    mainWindow.webContents.send('export-progress', {
      taskId: task.id,
      current: i + 1,
      total: segments.length,
      currentLabel: segment.label,
    });

    // 执行导出
    await exportSegment(
      sourceFilePath,
      outputPath,
      segment.startTime,
      segment.endTime,
      quality
    );
  }

  console.log(`[ExportHandler] 任务导出完成: ${task.id}`);
}
```

- [ ] **步骤 2：编写 IPC Handler 注册函数**

```typescript
/**
 * 注册导出相关 IPC Handlers
 */
export function registerExportHandler(mainWindow: BrowserWindow) {
  // 选择输出目录
  ipcMain.handle('dialog:select-output-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择输出目录',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // 执行导出
  ipcMain.handle('export:execute', async (_, params: ExportExecuteParams) => {
    try {
      console.log('[ExportHandler] 收到导出请求:', params);
      const { taskIds, outputDir, format, quality } = params;

      // 参数验证
      if (!taskIds || taskIds.length === 0) {
        throw new Error('任务 ID 列表为空');
      }
      if (!outputDir || !fs.existsSync(outputDir)) {
        throw new Error('输出目录无效');
      }

      // 这里需要从渲染进程传递完整的任务数据
      // 或者在主进程中维护任务缓存
      // 为简化实现，假设渲染进程会传递完整任务数据
      // 实际实现中需要调整架构

      console.log('[ExportHandler] 导出任务已接收，等待任务数据传递');
      
      return { success: true };
    } catch (error) {
      console.error('[ExportHandler] 导出失败:', error);
      throw error;
    }
  });
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/main/handlers/export-handler.ts
git commit -m "feat(主进程): 实现批量导出与进度回传逻辑"
```

---

## 任务 9：创建 FFmpeg 路径辅助工具

**文件：**
- 创建：`src/main/utils/ffmpeg-helper.ts`

- [ ] **步骤 1：编写 FFmpeg 路径解析函数**

```typescript
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 获取 FFmpeg 可执行文件路径
 * 开发环境：从 node_modules 读取
 * 生产环境：从 app.asar.unpacked 读取
 */
export function getFfmpegPath(): string {
  const isPackaged = app.isPackaged;
  
  if (isPackaged) {
    // 生产环境：从 asar.unpacked 读取
    const unpackedPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
    const ffmpegPath = path.join(
      unpackedPath,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
    
    if (!fs.existsSync(ffmpegPath)) {
      throw new Error(`FFmpeg 未找到: ${ffmpegPath}`);
    }
    
    return ffmpegPath;
  } else {
    // 开发环境：从 node_modules 读取
    const ffmpegPath = require('ffmpeg-static');
    return ffmpegPath;
  }
}
```

- [ ] **步骤 2：验证辅助函数**

运行：`npm run lint`
预期：无 TypeScript 错误

- [ ] **步骤 3：Commit**

```bash
git add src/main/utils/ffmpeg-helper.ts
git commit -m "feat(工具): 创建 FFmpeg 路径解析辅助函数"
```

---

## 任务 10：添加 Preload IPC 桥接

**文件：**
- 修改：`src/preload.ts:39-50`

- [ ] **步骤 1：导入导出类型**

在文件顶部添加：

```typescript
import type { ExportExecuteParams, ExportProgressEvent } from './types/export';
```

- [ ] **步骤 2：添加导出相关 API**

在 `contextBridge.exposeInMainWorld` 的对象中添加：

```typescript
  /**
   * 选择输出目录
   * @returns 目录路径或 null
   */
  selectOutputDir: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:select-output-dir');
  },

  /**
   * 执行导出任务
   * @param params 导出参数
   */
  executeExport: (params: ExportExecuteParams): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('export:execute', params);
  },

  /**
   * 监听导出进度事件
   * @param callback 进度回调函数
   */
  onExportProgress: (callback: (event: ExportProgressEvent) => void): void => {
    ipcRenderer.on('export-progress', (_, data) => callback(data));
  },

  /**
   * 移除导出进度监听器
   */
  offExportProgress: (): void => {
    ipcRenderer.removeAllListeners('export-progress');
  },
```

- [ ] **步骤 3：更新全局类型声明**

在 `declare global` 块中添加：

```typescript
      selectOutputDir: () => Promise<string | null>;
      executeExport: (params: ExportExecuteParams) => Promise<{ success: boolean }>;
      onExportProgress: (callback: (event: ExportProgressEvent) => void) => void;
      offExportProgress: () => void;
```

- [ ] **步骤 4：验证类型**

运行：`npm run lint`
预期：无 TypeScript 错误

- [ ] **步骤 5：Commit**

```bash
git add src/preload.ts
git commit -m "feat(IPC): 添加导出相关 Preload 桥接 API"
```

---

## 任务 11：注册导出 Handler 到主进程

**文件：**
- 修改：`src/main.ts`

- [ ] **步骤 1：导入导出 Handler**

在文件顶部添加：

```typescript
import { registerExportHandler } from './main/handlers/export-handler';
```

- [ ] **步骤 2：注册 Handler**

在创建 `mainWindow` 之后，找到其他 handler 注册的位置，添加：

```typescript
// 注册导出 Handler
registerExportHandler(mainWindow);
```

- [ ] **步骤 3：验证主进程启动**

运行：`npm start`
预期：应用正常启动，无错误

- [ ] **步骤 4：Commit**

```bash
git add src/main.ts
git commit -m "feat(主进程): 注册导出 Handler"
```

---

## 任务 12：添加导出进度监听到 ExportTab

**文件：**
- 修改：`src/components/ExportTab.vue`

- [ ] **步骤 1：添加生命周期钩子监听进度**

在 `<script setup>` 中添加：

```typescript
import { onMounted, onUnmounted } from 'vue';

// 监听导出进度事件
onMounted(() => {
  window.motionSlice.onExportProgress((event) => {
    console.log('[ExportTab] 收到进度事件:', event);
    exportStore.updateQueueProgress(event.taskId, event.current, event.total);
    
    // 如果完成，更新状态
    if (event.current === event.total) {
      exportStore.setQueueStatus(event.taskId, 'success');
    } else {
      exportStore.setQueueStatus(event.taskId, 'processing');
    }
  });
});

onUnmounted(() => {
  window.motionSlice.offExportProgress();
});
```

- [ ] **步骤 2：验证进度监听**

运行：`npm start`
预期：控制台能接收到进度事件（需要先完成任务 13 的架构调整）

- [ ] **步骤 3：Commit**

```bash
git add src/components/ExportTab.vue
git commit -m "feat(导出): 添加导出进度实时监听"
```

---

## 任务 13：架构调整 - 传递完整任务数据到主进程

**文件：**
- 修改：`src/types/export.ts`
- 修改：`src/components/ExportTab.vue`
- 修改：`src/main/handlers/export-handler.ts`

- [ ] **步骤 1：调整导出执行参数类型**

在 `src/types/export.ts` 中修改 `ExportExecuteParams`：

```typescript
/**
 * 导出执行参数（渲染进程 -> 主进程）
 */
export interface ExportExecuteParams {
  /** 任务数组（包含完整任务数据） */
  tasks: ExportTask[];
  /** 输出目录 */
  outputDir: string;
  /** 输出格式 */
  format: 'mp4' | 'mov' | 'avi';
  /** 视频质量（10-100） */
  quality: number;
}
```

- [ ] **步骤 2：修改 ExportTab 传递完整任务**

在 `src/components/ExportTab.vue` 的 `handleExecuteExport` 函数中修改：

```typescript
async function handleExecuteExport() {
  if (!canExecute.value) return;

  try {
    const taskIds = pendingTasks.value.map(t => t.id);
    
    // 初始化队列
    exportStore.initQueue(taskIds);
    
    // 调用主进程执行导出（传递完整任务数据）
    await window.motionSlice.executeExport({
      tasks: pendingTasks.value,  // 传递完整任务数组
      outputDir: exportConfig.value.outputDir,
      format: exportConfig.value.format,
      quality: exportConfig.value.quality,
    });
    
    console.log('[ExportTab] 导出任务已提交');
  } catch (error) {
    console.error('执行导出失败:', error);
  }
}
```

- [ ] **步骤 3：修改主进程 Handler 处理完整任务**

在 `src/main/handlers/export-handler.ts` 的 `export:execute` handler 中修改：

```typescript
  // 执行导出
  ipcMain.handle('export:execute', async (_, params: ExportExecuteParams) => {
    try {
      console.log('[ExportHandler] 收到导出请求:', params);
      const { tasks, outputDir, format, quality } = params;

      // 参数验证
      if (!tasks || tasks.length === 0) {
        throw new Error('任务列表为空');
      }
      if (!outputDir || !fs.existsSync(outputDir)) {
        throw new Error('输出目录无效');
      }

      // 逐个处理任务
      for (const task of tasks) {
        if (task.toolId === 'slicer') {
          await exportSlicerTask(task, outputDir, format, quality, mainWindow);
        } else {
          console.warn(`[ExportHandler] 未知工具类型: ${task.toolId}`);
        }
      }

      console.log('[ExportHandler] 所有任务导出完成');
      return { success: true };
    } catch (error) {
      console.error('[ExportHandler] 导出失败:', error);
      throw error;
    }
  });
```

- [ ] **步骤 4：验证完整流程**

运行：`npm start`
操作：生成切片 -> 选择输出目录 -> 执行导出
预期：控制台显示导出进度，文件成功生成

- [ ] **步骤 5：Commit**

```bash
git add src/types/export.ts src/components/ExportTab.vue src/main/handlers/export-handler.ts
git commit -m "feat(架构): 调整导出流程传递完整任务数据"
```

---

## 任务 14：安装 ffmpeg-static 依赖

**文件：**
- 修改：`package.json`
- 修改：`forge.config.ts`

- [ ] **步骤 1：安装 ffmpeg-static**

运行：`npm install ffmpeg-static`

- [ ] **步骤 2：配置 Forge asarUnpack**

在 `forge.config.ts` 中找到 `packagerConfig`，添加或修改 `asarUnpack`：

```typescript
packagerConfig: {
  asar: true,
  asarUnpack: [
    '**/*.node',
    'node_modules/ffprobe-static/**/*',
    'node_modules/ffmpeg-static/**/*',  // 添加 ffmpeg-static
  ],
},
```

- [ ] **步骤 3：验证依赖安装**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add package.json package-lock.json forge.config.ts
git commit -m "chore(依赖): 安装 ffmpeg-static 并配置 ASAR 解包"
```

---

## 任务 15：端到端测试与错误处理

**文件：**
- 修改：`src/components/ExportTab.vue`
- 修改：`src/main/handlers/export-handler.ts`

- [ ] **步骤 1：添加错误处理到 ExportTab**

在 `handleExecuteExport` 函数中添加错误处理：

```typescript
async function handleExecuteExport() {
  if (!canExecute.value) return;

  try {
    const taskIds = pendingTasks.value.map(t => t.id);
    
    // 初始化队列
    exportStore.initQueue(taskIds);
    
    // 调用主进程执行导出
    await window.motionSlice.executeExport({
      tasks: pendingTasks.value,
      outputDir: exportConfig.value.outputDir,
      format: exportConfig.value.format,
      quality: exportConfig.value.quality,
    });
    
    console.log('[ExportTab] 导出任务已提交');
  } catch (error) {
    console.error('执行导出失败:', error);
    
    // 将所有队列项标记为失败
    queueItems.value.forEach(item => {
      exportStore.setQueueStatus(item.taskId, 'failed');
    });
    
    // 可选：显示错误提示（需要添加 UI 组件）
    alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}
```

- [ ] **步骤 2：添加错误处理到主进程**

在 `exportSlicerTask` 函数中添加错误捕获：

```typescript
async function exportSlicerTask(
  task: ExportTask,
  outputDir: string,
  format: string,
  quality: number,
  mainWindow: BrowserWindow
): Promise<void> {
  const { sourceFilePath, segments } = task.payload;
  
  if (!segments || segments.length === 0) {
    throw new Error('切片数组为空');
  }

  // 确保输出目录存在
  ensureOutputDir(outputDir);

  // 获取源文件名（不含扩展名）
  const sourceBasename = path.basename(sourceFilePath, path.extname(sourceFilePath));

  // 逐个导出切片
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    try {
      // 生成输出文件名
      const outputFilename = sanitizeFilename(`${sourceBasename}_${segment.label}.${format}`);
      const outputPath = path.join(outputDir, outputFilename);

      console.log(`[ExportHandler] 开始导出切片 ${i + 1}/${segments.length}: ${segment.label}`);

      // 发送进度事件到渲染进程
      mainWindow.webContents.send('export-progress', {
        taskId: task.id,
        current: i + 1,
        total: segments.length,
        currentLabel: segment.label,
      });

      // 执行导出
      await exportSegment(
        sourceFilePath,
        outputPath,
        segment.startTime,
        segment.endTime,
        quality
      );
    } catch (error) {
      console.error(`[ExportHandler] 切片 ${segment.label} 导出失败:`, error);
      // 继续处理下一个切片，不中断整个流程
      // 或者选择抛出错误中断流程：throw error;
    }
  }

  console.log(`[ExportHandler] 任务导出完成: ${task.id}`);
}
```

- [ ] **步骤 3：端到端测试**

运行：`npm start`

测试流程：
1. 选择视频文件
2. 切换到工作台 Tab，生成切片预览
3. 切换到导出 Tab，验证任务列表显示
4. 选择输出目录
5. 点击"执行导出"
6. 观察队列进度更新
7. 验证输出目录中生成的文件

预期：
- 队列实时显示进度
- 所有切片成功导出
- 文件命名正确

- [ ] **步骤 4：Commit**

```bash
git add src/components/ExportTab.vue src/main/handlers/export-handler.ts
git commit -m "feat(导出): 添加错误处理与端到端测试验证"
```

---

## 任务 16：清理与文档更新

**文件：**
- 修改：`CLAUDE.md`

- [ ] **步骤 1：更新项目文档**

在 `CLAUDE.md` 的"已实现功能"部分添加：

```markdown
- ✅ 统一导出调度中心：解耦的多工具导出任务管理系统
- ✅ FFmpeg 物理切割：基于 fluent-ffmpeg 的视频切片导出
- ✅ 实时进度反馈：IPC 事件流驱动的导出队列状态同步
```

- [ ] **步骤 2：验证所有功能**

运行完整测试流程，确保：
- 切片生成正常
- 导出任务推送正常
- 导出执行正常
- 进度反馈正常
- 文件输出正常

- [ ] **步骤 3：最终 Commit**

```bash
git add CLAUDE.md
git commit -m "docs(文档): 更新已实现功能列表"
```

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-27-unified-export-system.md`。两种执行方式：

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**

---

## 实际实施记录 (2026-05-27 ~ 2026-05-28)

### ✅ 已完成任务

**阶段 1：类型系统与状态管理**
- ✅ 任务 1-2：创建 `src/types/export.ts` 和 `src/store/useExportStore.ts`
- ✅ 实现统一导出任务契约（ExportTask、ExportQueueItem、ExportProgressEvent）
- ✅ 实现 Pinia Store 的任务管理和队列状态跟踪

**阶段 2：工具集成与 UI 重构**
- ✅ 任务 3：修改 `ToolSlicer.vue`，添加导出任务推送逻辑
- ✅ 任务 4-5：创建独立的 `ExportTab.vue` 组件，实现动态任务列表和队列映射
- ✅ 添加默认下载路径功能（跨平台支持 Windows/macOS/Linux）
- ✅ 质量滑块默认值设为 100%

**阶段 3：主进程 FFmpeg 引擎**
- ✅ 任务 6-8：创建 `src/main/handlers/export-handler.ts`
- ✅ 实现 FFmpeg 路径动态解析（开发/生产环境兼容）
- ✅ 实现切片导出核心逻辑（使用 `-c copy` 流拷贝优化）
- ✅ 实现实时进度事件回传（`export-progress`）

**阶段 4：IPC 通信桥接**
- ✅ 任务 9-10：扩展 `preload.ts` 添加导出相关 API
- ✅ 注册 `dialog:get-default-download-path` 通道
- ✅ 注册 `dialog:select-output-dir` 通道
- ✅ 注册 `export:execute` 通道
- ✅ 实现进度事件监听和清理机制

**阶段 5：Bug 修复与优化**
- ✅ 修复 IPC 序列化问题（响应式对象转纯对象）
- ✅ 修复 FFmpeg 路径获取问题（延迟初始化，避免模块加载时错误）
- ✅ 修复路径解析错误（使用 `app.getAppPath()` 替代 `__dirname` 计算）
- ✅ 优化导出任务摘要，添加交叠缓冲信息显示

### 关键技术决策

**1. FFmpeg 路径解析策略**
```typescript
// 最终方案：使用 app.getAppPath() 获取项目根目录
// 开发环境：D:\projects\freelance\motion-slice
// 生产环境：app.asar 或 app.asar.unpacked
const projectRoot = app.getAppPath();
const ffmpegPath = path.join(projectRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
```

**2. 延迟初始化模式**
```typescript
// 避免模块加载时调用 getFfmpegPath()，改为首次使用时初始化
let ffmpegInitialized = false;
function ensureFfmpegPath() {
  if (!ffmpegInitialized) {
    const ffmpegPath = getFfmpegPath();
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpegInitialized = true;
  }
}
```

**3. IPC 数据序列化**
```typescript
// Pinia 响应式对象无法通过 IPC 传递，需转换为纯对象
await window.motionSlice.executeExport({
  tasks: JSON.parse(JSON.stringify(pendingTasks.value)),
  // ...
});
```

**4. 动态摘要生成**
```typescript
// 根据交叠缓冲开关动态生成任务摘要
summary: `按时长 60s 切分，共 3 个片段${useOverlapHandles.value ? ` | 交叠缓冲 ${overlapDuration.value.toFixed(1)}s` : ''}`
```

### 未完成任务

- ⏸️ 任务 15：错误处理增强（部分完成，基础错误捕获已实现）
- ⏸️ 任务 16：文档更新（待用户确认后统一提交）

### 测试验证状态

**已验证功能：**
- ✅ 文件导入正常
- ✅ 切片生成正常
- ✅ 导出任务推送到全局池
- ✅ 导出面板显示任务列表和摘要
- ✅ 默认下载路径自动填充
- ✅ FFmpeg 路径正确解析
- ✅ 导出进度实时更新

**待验证功能：**
- ⏳ 物理切片文件生成（需用户端到端测试）
- ⏳ 多任务并发导出
- ⏳ 错误场景处理（磁盘空间不足、权限问题等）

### 下一步建议

1. **端到端测试**：完整执行一次导出流程，验证切片文件是否正确生成
2. **错误处理增强**：添加磁盘空间检查、权限验证等边界情况处理
3. **性能优化**：考虑大文件切片的内存占用和进度更新频率
4. **用户体验**：添加导出完成通知、打开输出目录快捷操作

