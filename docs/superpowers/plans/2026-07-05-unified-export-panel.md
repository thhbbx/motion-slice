# 统一导出面板重构计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 `ExportTab.vue` 和 `BatchExportQueue.vue` 合并为一个统一的导出面板组件，通过 `isBatchMode` 动态切换单选/多选模式的 UI 细节。

**架构：** 基于现有 `ExportTab.vue` 进行原地重构，采用 `BatchExportQueue.vue` 的黑色卡片背景样式和队列列表设计。组件通过 `isBatchMode` computed 属性自动识别当前模式，动态调整摘要文案、任务列表显示格式和按钮文案。

**技术栈：** Vue 3 (Setup Script)、TypeScript、Pinia (useVideoStore, useExportStore)、Electron IPC

---

## 文件结构

**修改文件：**
- `src/components/ExportTab.vue` - 统一导出面板（重构主体）

**废弃文件（待用户确认后删除）：**
- `src/components/export/BatchExportQueue.vue` - 重构完成后可删除

**依赖的 Store：**
- `src/store/useVideoStore.ts` - 提供 `isBatchMode`、`batchSliceGroups`、`selectedVideos`
- `src/store/useExportStore.ts` - 提供 `pendingTasks`、`queueItems`、导出执行逻辑

---

## 任务 1：分析现有代码差异并提取可复用逻辑

**目标：** 理解两个组件的核心差异，识别可复用的样式和逻辑模块。

- [ ] **步骤 1：对比两个组件的数据源**

**ExportTab.vue 数据源：**
- 单选模式：`pendingTasks` (来自 exportStore)
- 队列状态：`queueItems` (来自 exportStore)
- 执行参数：本地 `exportConfig` (format, quality, outputDir)

**BatchExportQueue.vue 数据源：**
- 多选模式：`batchSliceGroups` (来自 videoStore)
- 队列状态：`queueItems` (来自 exportStore)
- 执行参数：本地 `outputDir`，硬编码 `format: 'mp4'`, `quality: 100`

**差异总结：**
- 多选模式缺失导出设置区（format/quality），需要补充
- 两个组件都使用 `queueItems` 追踪进度，可以统一
- 需要统一任务列表的数据结构：单选用 `pendingTasks`，多选用动态计算的 `exportTasks`

- [ ] **步骤 2：提取样式差异**

**BatchExportQueue.vue 特有样式：**
- `.queue-summary` - 黑色卡片背景 (`var(--vt-bg-soft)`)
- `.task-parent-path` - 显示文件夹归属路径
- `.btn-completed` - 绿色成功按钮
- 全局进度条样式更突出

**ExportTab.vue 特有样式：**
- `.export-settings` - 导出设置表单区域
- `.vt-select` / `.vt-slider` - 表单控件样式

**统一方案：**
- 保留 BatchExportQueue 的卡片背景样式作为全局风格
- 导出设置区采用与摘要卡片相同的背景和边框
- 队列列表统一使用 BatchExportQueue 的布局

- [ ] **步骤 3：识别执行逻辑差异**

**ExportTab.vue 执行流程：**
```typescript
// 1. 初始化队列
exportStore.initQueue(taskIds);
// 2. 设置状态为 processing
taskIds.forEach(taskId => exportStore.setQueueStatus(taskId, 'processing'));
// 3. 调用 IPC
await window.motionSlice.executeExport({
  tasks: pendingTasks.value,
  outputDir, format, quality
});
```

**BatchExportQueue.vue 执行流程：**
```typescript
// 1. 手动构建 queueItems（绕过 initQueue）
exportStore.$patch({ queueItems: [...] });
// 2. 从 batchSliceGroups 构建 tasks
const tasks = batchSliceGroups.value.flatMap(group => ({
  id, toolId: 'slicer', payload: { sourceFilePath, segments, rootDir }
}));
// 3. 调用 IPC（硬编码 format/quality）
await window.motionSlice.executeExport({ tasks, outputDir, format: 'mp4', quality: 100 });
```

**统一方案：**
- 单选模式：沿用 ExportTab 的 `initQueue` + `pendingTasks`
- 多选模式：沿用 BatchExportQueue 的手动 `$patch` + 动态构建 tasks
- 统一传递用户配置的 `format` 和 `quality` 参数

---

## 任务 2：重构 `<template>` 结构 - 摘要区

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：移除现有的批量模式条件渲染**

当前代码：
```vue
<BatchExportQueue v-if="isBatchMode" />
<template v-else>
  <!-- 单选模式 UI -->
</template>
```

修改为统一结构：
```vue
<div class="export-tab">
  <!-- 1. 摘要区 -->
  <div class="summary-card">
    <!-- 动态内容 -->
  </div>
  
  <!-- 2. 导出设置区 -->
  <div class="export-settings">
    <!-- 统一表单 -->
  </div>
  
  <!-- 3. 队列与进度区 -->
  <div class="export-queue">
    <!-- 统一队列列表 -->
  </div>
  
  <!-- 4. 底部操作区 -->
  <div class="export-actions">
    <!-- 统一按钮和错误面板 -->
  </div>
</div>
```

- [ ] **步骤 2：实现动态摘要卡片**

```vue
<!-- 任务摘要区 (Summary Card) -->
<div class="summary-card">
  <h3 class="summary-title">
    {{ isBatchMode ? '批量切片导出任务' : '视频切片导出' }}
  </h3>
  <p class="summary-text">
    <template v-if="isBatchMode">
      共 {{ totalVideos }} 个视频，拦截 {{ disabledCount }} 处废片，最终生成 {{ activeCount }} 个有效切片
    </template>
    <template v-else>
      共 {{ pendingTasks.length }} 个片段
    </template>
  </p>
</div>
```

- [ ] **步骤 3：添加摘要区样式**

```css
.summary-card {
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  flex-shrink: 0;
}

.summary-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--vt-space-2) 0;
  color: var(--vt-text-regular);
}

.summary-text {
  font-size: 12px;
  color: var(--vt-text-muted);
  margin: 0;
  line-height: 1.5;
}
```

---

## 任务 3：重构 `<template>` 结构 - 导出设置区

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：保留现有导出设置表单**

保持 `exportConfig` 的三个字段：
- `format` (下拉选择)
- `quality` (滑块)
- `outputDir` (路径输入 + 浏览按钮)

确认在单选和多选模式下都显示此区域。

- [ ] **步骤 2：调整导出设置区样式**

统一使用黑色卡片背景：
```css
.export-settings {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  flex-shrink: 0;
}
```

- [ ] **步骤 3：验证表单控件样式一致性**

确保 `.vt-select`、`.vt-slider`、`.vt-input` 样式与项目规范一致（使用 CSS 变量，无硬编码颜色）。

---

## 任务 4：重构 `<template>` 结构 - 队列与进度区

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：添加全局进度条（从 BatchExportQueue 迁移）**

```vue
<div class="export-queue">
  <h3 class="section-title vt-title">导出队列与进度</h3>
  
  <!-- 全局进度条 -->
  <div v-if="totalTasks > 0" class="global-progress">
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: `${overallProgress}%` }"></div>
    </div>
    <p class="progress-text">总进度: {{ completedCount }}/{{ totalTasks }}</p>
    <p v-if="currentTask" class="current-task">
      当前正在处理: {{ currentTaskLabel }} ({{ currentTask.progress }}%)
    </p>
  </div>
  
  <!-- 队列列表 -->
  <div v-if="exportTasks.length === 0" class="empty-state-inline">
    <span class="vt-muted">暂无正在执行的任务</span>
  </div>
  <div v-else class="queue-list">
    <!-- 任务项 -->
  </div>
</div>
```

- [ ] **步骤 2：统一任务列表项结构**

```vue
<div
  v-for="task in exportTasks"
  :key="task.id"
  class="task-item"
  :class="task.status"
>
  <div class="task-info">
    <div class="task-name-line">
      <span class="task-name" :title="task.fullPath">
        {{ task.displayName }}
      </span>
      <span class="task-status">{{ statusText(task.status) }}</span>
    </div>
    <div v-if="task.parentPath" class="task-path-line">
      <span class="task-parent-path">
        📁 {{ task.parentPath }}
      </span>
    </div>
  </div>
</div>
```

- [ ] **步骤 3：添加队列列表样式（从 BatchExportQueue 迁移）**

```css
.export-queue {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  padding: var(--vt-space-4);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  flex: 1;
  overflow: hidden;
}

.global-progress {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.queue-list {
  height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  background: var(--vt-bg-elevated);
}

.task-item {
  padding: var(--vt-space-3) var(--vt-space-4);
  border-bottom: 1px solid var(--vt-border);
  transition: background 180ms ease;
}

.task-item:last-child {
  border-bottom: none;
}

.task-item:hover {
  background: var(--vt-bg-soft);
}

.task-item.success .task-status {
  color: rgba(16, 185, 129, 0.9);
  font-weight: 600;
}

.task-item.failed {
  background: var(--vt-danger-soft);
  color: var(--vt-danger);
}

.task-name-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--vt-space-2);
}

.task-name {
  flex: 1;
  font-size: 13px;
  font-family: var(--vt-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.task-path-line {
  margin-top: var(--vt-space-1);
  font-size: 11px;
}

.task-parent-path {
  font-family: var(--vt-font-mono);
  font-size: 11px;
  color: var(--vt-text-muted);
  opacity: 0.8;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

.task-status {
  font-size: 11px;
  color: var(--vt-text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.current-task {
  font-size: 12px;
  color: var(--vt-primary);
  font-family: var(--vt-font-mono);
  margin: 0;
  padding: var(--vt-space-2) var(--vt-space-3);
  background: var(--vt-primary-soft);
  border-radius: var(--vt-radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

## 任务 5：重构 `<template>` 结构 - 底部操作区

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：保留现有错误面板**

```vue
<!-- 错误提示面板 -->
<div v-if="exportError" class="error-panel">
  <div class="error-header">
    <span class="error-icon">⚠️</span>
    <span class="error-title">导出失败</span>
    <button class="btn-close-error" @click="exportError = ''" title="关闭">✕</button>
  </div>
  <div class="error-message">{{ exportError }}</div>
</div>
```

样式已存在，无需修改。

- [ ] **步骤 2：统一执行按钮文案**

```vue
<button
  v-if="!isAllCompleted"
  class="vt-button-primary"
  :disabled="!canExecute || isExporting"
  @click="handleExecuteExport"
>
  <span v-if="!isExporting">
    {{ isBatchMode ? '执行批量导出' : '执行导出' }}
  </span>
  <span v-else class="loading-text">
    <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
    </svg>
    导出中...
  </span>
</button>
<button
  v-else
  class="btn-completed"
  @click="handleOpenOutputDir"
>
  📂 打开输出目录
</button>
```

- [ ] **步骤 3：添加完成按钮样式（从 BatchExportQueue 迁移）**

```css
.btn-completed {
  padding: var(--vt-space-3) var(--vt-space-6);
  font-size: 14px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: var(--vt-radius-md);
  color: rgba(16, 185, 129, 0.95);
  cursor: pointer;
  transition: all 180ms ease;
  width: 100%;
}

.btn-completed:hover {
  background: rgba(16, 185, 129, 0.25);
  border-color: rgba(16, 185, 129, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}
```

---


## 任务 6：重构 <script setup> - 数据计算与统一

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：添加多选模式的统计 computed 属性**

```typescript
// 多选模式统计
const totalVideos = computed(() => {
  if (!isBatchMode.value) return 0;
  return new Set(batchSliceGroups.value.map(g => g.videoId)).size;
});

const disabledCount = computed(() => {
  if (!isBatchMode.value) return 0;
  return batchSliceGroups.value.reduce((sum, group) => {
    return sum + group.slices.filter(s => !s.isActive).length;
  }, 0);
});

const activeCount = computed(() => {
  if (!isBatchMode.value) return pendingTasks.value.length;
  return batchSliceGroups.value.reduce((sum, group) => {
    return sum + group.slices.filter(s => s.isActive).length;
  }, 0);
});
```

- [ ] **步骤 2：统一 exportTasks 计算属性**

创建统一的任务列表数据结构，兼容单选和多选模式。

- [ ] **步骤 3：添加进度统计 computed 属性**

包括 totalTasks, completedCount, overallProgress, currentTask, isAllCompleted。

- [ ] **步骤 4：更新 canExecute 计算属性**

确保单选和多选模式都能正确判断是否可执行导出。

- [ ] **步骤 5：添加工具函数**

getParentPath, statusText, handleOpenOutputDir。

---

## 任务 7：重构 <script setup> - 统一执行逻辑

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：重构 handleExecuteExport 方法**

合并单选和多选的执行逻辑，通过 isBatchMode 分支处理：
- 单选模式：使用 initQueue + pendingTasks
- 多选模式：使用 $patch + 动态构建 tasks
- **关键变更**：多选模式传递用户配置的 format 和 quality 参数

---

## 任务 8：更新 imports 和清理代码

**文件：** `src/components/ExportTab.vue`

- [ ] **步骤 1：移除 BatchExportQueue 组件引用**

删除 import BatchExportQueue。

- [ ] **步骤 2：添加必要的 imports**

确保引入 formatPathFromRoot。

- [ ] **步骤 3：更新 storeToRefs**

添加 batchSliceGroups。

---

## 任务 9：测试单选模式功能

- [ ] **步骤 1：启动开发服务器** - `npm start`
- [ ] **步骤 2：测试单选模式 UI 渲染**
- [ ] **步骤 3：测试单选模式导出执行**
- [ ] **步骤 4：测试单选模式错误处理**

---

## 任务 10：测试多选模式功能

- [ ] **步骤 1：测试多选模式 UI 渲染**
- [ ] **步骤 2：测试多选模式导出执行**（验证 format/quality 参数生效）
- [ ] **步骤 3：测试多选模式切片激活/禁用**
- [ ] **步骤 4：测试多选模式错误处理**

---

## 任务 11：测试模式切换边界场景

- [ ] **步骤 1：测试单选 → 多选切换**
- [ ] **步骤 2：测试多选 → 单选切换**
- [ ] **步骤 3：测试导出中切换视频**

---

## 任务 12：代码清理与文档更新

- [ ] **步骤 1：删除 BatchExportQueue.vue 文件**（需用户确认）
- [ ] **步骤 2：检查是否有其他地方引用 BatchExportQueue**
- [ ] **步骤 3：更新 CLAUDE.md（如需要）**
- [ ] **步骤 4：运行 ESLint 检查** - `npm run lint`

---

## 自检清单

**功能完整性：**
- [ ] 单选模式所有功能正常
- [ ] 多选模式所有功能正常
- [ ] 导出设置（format/quality）在两种模式下都生效
- [ ] 模式切换时状态清理正确
- [ ] 错误面板和完成状态正确显示

**UI 一致性：**
- [ ] 所有样式使用 CSS 变量，无硬编码颜色
- [ ] 间距遵循 4px/8px 网格系统
- [ ] 黑色卡片背景风格统一应用

**代码质量：**
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 警告
- [ ] 逻辑清晰，易于维护

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-07-05-unified-export-panel.md`。

**两种执行方式：**

1. **子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查
2. **内联执行** - 在当前会话中使用 executing-plans 执行任务

**选哪种方式？**
