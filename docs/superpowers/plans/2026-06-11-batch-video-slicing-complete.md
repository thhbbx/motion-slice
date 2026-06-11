# 批量视频智能切片管线 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现批量视频切片功能，支持多视频同时分析、非破坏性编辑、导出队列管理。

**架构：** 基于 Pinia 状态机隔离（selectedVideos/focusedVideo），Vue 组件采用容器/展示分离模式，主进程使用串行队列避免 FFmpeg 并发冲突。

**技术栈：** Electron 42.1.0、Vue 3 Composition API、Pinia、TypeScript、fluent-ffmpeg

---

## 文件结构

**新建文件：**
- `src/components/workspace/BatchSlicePreview.vue` - 批量模式下的主从表（Accordion List）
- `src/components/workspace/BatchPolicyCard.vue` - 批量模式下的全局策略汇总卡片
- `src/components/export/BatchExportQueue.vue` - 批量导出队列 UI
- `src/utils/taskQueue.ts` - 串行任务队列工具类
- `src/types/batch.ts` - 批量切片相关类型定义

**修改文件：**
- `src/store/useVideoStore.ts` - 重构状态管理（selectedVideos/focusedVideo/batchSliceGroups）
- `src/components/VideoWorkspace.vue` - 主列表交互逻辑（多选框 vs 整行点击）
- `src/components/tools/ToolSlicer.vue` - 工作台双模式切换逻辑
- `src/components/ExportPanel.vue` - 导出面板集成批量队列 UI
- `src/ipc/sliceHandlers.ts` - 主进程批量分析 IPC 处理器
- `src/main.ts` - 注册新的 IPC 通道

---

## 阶段一：状态管理重构（State Management）

### 任务 1：定义批量切片类型系统

**文件：**
- 创建：`src/types/batch.ts`

- [ ] **步骤 1：创建批量切片类型定义文件**

```typescript
// src/types/batch.ts

/**
 * 批量切片组（树形结构的根节点）
 */
export interface BatchSliceGroup {
  videoId: string;           // 关联的视频 ID
  videoPath: string;         // 视频文件路径
  videoName: string;         // 视频文件名
  slices: BatchSliceItem[];  // 该视频的所有切片
  createdAt: number;         // 创建时间戳
}

/**
 * 批量切片项（树形结构的子节点）
 */
export interface BatchSliceItem {
  id: string;                // 唯一标识
  videoId: string;           // 关联的视频 ID
  label: string;             // 切片标签（如 "片段 1"）
  startTime: number;         // 开始时间（秒）
  endTime: number;           // 结束时间（秒）
  isActive: boolean;         // 是否启用（非破坏性编辑标记）
  metadata?: {
    fileSize?: number;       // 预估文件大小
    duration?: number;       // 时长
  };
}

/**
 * 导出任务队列项（拍平后的一维结构）
 */
export interface ExportTask {
  id: string;                // 任务 ID
  videoPath: string;         // 源视频路径
  videoName: string;         // 视频文件名
  slice: BatchSliceItem;     // 关联的切片数据
  outputPath: string;        // 输出路径
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;          // 进度百分比（0-100）
  error?: string;            // 错误信息
}
```

- [ ] **步骤 2：Commit 类型定义**

```bash
git add src/types/batch.ts
git commit -m "feat(types): 添加批量切片类型定义"
```

---

### 任务 2：重构 Pinia Store 状态管理

**文件：**
- 修改：`src/store/useVideoStore.ts`

- [ ] **步骤 1：在 useVideoStore 中添加批量状态**

在 `useVideoStore.ts` 的状态定义部分（约第 15-30 行）添加：

```typescript
import type { BatchSliceGroup } from '../types/batch';

// 在现有 state 中添加
const selectedVideos = ref<VideoFile[]>([]);      // 多选框驱动的"受控数据集"
const focusedVideo = ref<VideoFile | null>(null); // 整行点击驱动的"当前上下文"
const batchSliceGroups = ref<BatchSliceGroup[]>([]);
```

- [ ] **步骤 2：添加 computed 判断批量模式**

在 `useVideoStore.ts` 的 computed 部分（约第 50-70 行）添加：

```typescript
const isBatchMode = computed(() => selectedVideos.value.length > 1);
```

- [ ] **步骤 3：添加批量状态管理 actions**

在 `useVideoStore.ts` 的 actions 部分（约第 100-200 行）添加：

```typescript
// 设置选中的视频（多选框驱动）
function setSelectedVideos(videos: VideoFile[]) {
  selectedVideos.value = videos;
  console.log('[VideoStore] 已选中视频:', videos.length);
}

// 设置聚焦的视频（整行点击驱动）
function setFocusedVideo(video: VideoFile | null) {
  focusedVideo.value = video;
  console.log('[VideoStore] 聚焦视频:', video?.name || 'null');
}

// 设置批量切片组
function setBatchSliceGroups(groups: BatchSliceGroup[]) {
  batchSliceGroups.value = groups;
  console.log('[VideoStore] 批量切片组更新:', groups.length);
}

// 切换切片启用状态（非破坏性编辑）
function toggleSliceActive(videoId: string, sliceId: string) {
  const group = batchSliceGroups.value.find(g => g.videoId === videoId);
  if (!group) return;

  const slice = group.slices.find(s => s.id === sliceId);
  if (!slice) return;

  slice.isActive = !slice.isActive;
  console.log(`[VideoStore] 切片 ${sliceId} 状态: ${slice.isActive ? '启用' : '禁用'}`);
}
```

- [ ] **步骤 4：在 return 中导出新状态和方法**

在 `useVideoStore.ts` 的 return 语句（约第 250-280 行）添加：

```typescript
return {
  // ... 现有导出
  selectedVideos: readonly(selectedVideos),
  focusedVideo: readonly(focusedVideo),
  batchSliceGroups: readonly(batchSliceGroups),
  isBatchMode,
  setSelectedVideos,
  setFocusedVideo,
  setBatchSliceGroups,
  toggleSliceActive,
};
```

- [ ] **步骤 5：Commit Store 重构**

```bash
git add src/store/useVideoStore.ts
git commit -m "refactor(store): 添加批量切片状态管理"
```

---

## 阶段二：UI 组件重构（Component Architecture）

### 任务 3：主列表交互逻辑重构

**文件：**
- 修改：`src/components/VideoWorkspace.vue:100-200`

- [ ] **步骤 1：添加多选框状态和事件处理**

在 `VideoWorkspace.vue` 的 `<script setup>` 部分（约第 10-50 行）添加：

```typescript
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';

const videoStore = useVideoStore();
const { selectedVideos, focusedVideo } = storeToRefs(videoStore);

// 多选框勾选/取消事件
function handleCheckboxChange(video: VideoFile, checked: boolean) {
  const current = [...selectedVideos.value];
  if (checked) {
    current.push(video);
  } else {
    const index = current.findIndex(v => v.id === video.id);
    if (index > -1) current.splice(index, 1);
  }
  videoStore.setSelectedVideos(current);
}

// 整行点击事件（聚焦视频，不影响多选状态）
function handleRowClick(video: VideoFile) {
  videoStore.setFocusedVideo(video);
}
```

- [ ] **步骤 2：修改模板添加多选框和点击事件**

在 `VideoWorkspace.vue` 的 `<template>` 部分（约第 100-150 行），将现有的视频列表项改为：

```vue
<div
  v-for="video in videos"
  :key="video.id"
  class="video-item"
  :class="{ focused: focusedVideo?.id === video.id }"
  @click="handleRowClick(video)"
>
  <!-- 多选框（阻止冒泡，避免触发整行点击） -->
  <input
    type="checkbox"
    :checked="selectedVideos.some(v => v.id === video.id)"
    @click.stop
    @change="(e) => handleCheckboxChange(video, (e.target as HTMLInputElement).checked)"
  />
  
  <!-- 视频元数据 -->
  <span class="video-name">{{ video.name }}</span>
  <span class="video-duration">{{ formatDuration(video.duration) }}</span>
</div>
```

- [ ] **步骤 3：添加聚焦样式**

在 `VideoWorkspace.vue` 的 `<style scoped>` 部分（约第 200-250 行）添加：

```css
.video-item.focused {
  background: rgba(139, 92, 246, 0.15);
  border-left: 2px solid var(--vt-primary);
}

.video-item input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
}
```

- [ ] **步骤 4：Commit 交互逻辑重构**

```bash
git add src/components/VideoWorkspace.vue
git commit -m "refactor(ui): 实现多选框与整行点击分离逻辑"
```

---

### 任务 4：批量切片预览组件（Accordion List）

**文件：**
- 创建：`src/components/workspace/BatchSlicePreview.vue`
- 修改：`src/components/VideoWorkspace.vue` - 挂载 BatchSlicePreview 组件

- [ ] **步骤 1：创建 BatchSlicePreview 组件（仅模板和脚本）**

在 `src/components/workspace/BatchSlicePreview.vue` 中编写：

```vue
<template>
  <div class="batch-slice-preview">
    <div v-for="group in batchSliceGroups" :key="group.videoId" class="video-group">
      <div class="group-header" @click="toggleExpand(group.videoId)">
        <span class="expand-icon">{{ isExpanded(group.videoId) ? '▼' : '▶' }}</span>
        <span class="video-name">{{ group.videoName }}</span>
        <span class="slice-count">(共 {{ group.slices.length }} 个片段)</span>
      </div>
      <div v-if="isExpanded(group.videoId)" class="slices-list">
        <div v-for="slice in group.slices" :key="slice.id" class="slice-item" :class="{ disabled: !slice.isActive }">
          <span class="slice-label">├─ {{ slice.label }}</span>
          <span class="slice-time">({{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }})</span>
          <button @click="handleToggleActive(group.videoId, slice.id)" class="btn-toggle">
            👁️ {{ slice.isActive ? '禁用' : '启用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import { formatTimecode } from '../../utils/timeFormat';

const videoStore = useVideoStore();
const { batchSliceGroups } = storeToRefs(videoStore);
const expandedGroups = ref<Set<string>>(new Set());

function toggleExpand(videoId: string) {
  if (expandedGroups.value.has(videoId)) {
    expandedGroups.value.delete(videoId);
  } else {
    expandedGroups.value.add(videoId);
  }
}

function isExpanded(videoId: string) {
  return expandedGroups.value.has(videoId);
}

function formatTime(seconds: number) {
  return formatTimecode(seconds);
}

function handleToggleActive(videoId: string, sliceId: string) {
  videoStore.toggleSliceActive(videoId, sliceId);
}
</script>
```

- [ ] **步骤 2：添加样式（分离步骤避免截断）**

继续在同一文件中添加样式：

```vue
<style scoped>
.batch-slice-preview { display: flex; flex-direction: column; gap: var(--vt-space-3); }
.video-group { border: 1px solid var(--vt-border); border-radius: var(--vt-radius-md); overflow: hidden; }
.group-header { display: flex; align-items: center; gap: var(--vt-space-2); padding: var(--vt-space-3); background: var(--vt-bg-soft); cursor: pointer; user-select: none; }
.group-header:hover { background: var(--vt-bg-elevated); }
.expand-icon { font-size: 12px; color: var(--vt-text-muted); }
.slice-count { margin-left: auto; font-size: 12px; color: var(--vt-text-muted); }
.slices-list { padding: var(--vt-space-2) var(--vt-space-3); background: var(--vt-bg); }
.slice-item { display: flex; align-items: center; gap: var(--vt-space-2); padding: var(--vt-space-2) 0; font-family: var(--vt-font-mono); font-size: 12px; }
.slice-item.disabled { opacity: 0.5; text-decoration: line-through; }
.slice-time { color: var(--vt-text-muted); }
.btn-toggle { margin-left: auto; padding: 2px 8px; font-size: 11px; background: var(--vt-bg-soft); border: 1px solid var(--vt-border); border-radius: var(--vt-radius-sm); cursor: pointer; }
.btn-toggle:hover { background: var(--vt-bg-elevated); }
</style>
```

- [ ] **步骤 3：在 VideoWorkspace 中挂载 BatchSlicePreview 组件**

在 `VideoWorkspace.vue` 的 `<script setup>` 部分添加：

```typescript
import BatchSlicePreview from './workspace/BatchSlicePreview.vue';
const { isBatchMode, batchSliceGroups } = storeToRefs(videoStore);
```

在模板中，视频列表区域后添加：

```vue
<!-- 批量模式：显示主从表 -->
<BatchSlicePreview v-if="isBatchMode && batchSliceGroups.length > 0" />
```

- [ ] **步骤 4：Commit 批量预览组件及挂载**

```bash
git add src/components/workspace/BatchSlicePreview.vue src/components/VideoWorkspace.vue
git commit -m "feat(ui): 添加批量切片预览组件并挂载到中心大盘"
```

---

### 任务 5：批量策略汇总卡片组件

**文件：**
- 创建：`src/components/workspace/BatchPolicyCard.vue`

- [ ] **步骤 1：创建 BatchPolicyCard 组件**

```vue
<template>
  <div class="batch-policy-card">
    <h3 class="card-title">批量切片策略汇总</h3>
    <div class="policy-item">
      <span class="label">应用视频数:</span>
      <span class="value">{{ selectedVideos.length }} 个</span>
    </div>
    <div class="policy-item">
      <span class="label">切片模式:</span>
      <span class="value">{{ sliceMode === 'time' ? '按时长' : '按文件大小' }}</span>
    </div>
    <div class="policy-item">
      <span class="label">切片参数:</span>
      <span class="value">{{ sliceParamText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import { useSliceStore } from '../../store/useSliceStore';

const videoStore = useVideoStore();
const sliceStore = useSliceStore();
const { selectedVideos } = storeToRefs(videoStore);
const { sliceMode, sliceDuration, sliceSize } = storeToRefs(sliceStore);

const sliceParamText = computed(() => {
  if (sliceMode.value === 'time') {
    return `每 ${sliceDuration.value} 秒`;
  } else {
    return `每 ${sliceSize.value} MB`;
  }
});
</script>

<style scoped>
.batch-policy-card {
  padding: var(--vt-space-4);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}
.card-title {
  margin-bottom: var(--vt-space-3);
  font-size: 14px;
  font-weight: 600;
  color: var(--vt-primary);
}
.policy-item {
  display: flex;
  justify-content: space-between;
  padding: var(--vt-space-2) 0;
  border-bottom: 1px solid var(--vt-border);
}
.policy-item:last-child {
  border-bottom: none;
}
.label {
  font-size: 12px;
  color: var(--vt-text-muted);
}
.value {
  font-size: 12px;
  font-weight: 500;
}
</style>
```

- [ ] **步骤 2：Commit 批量策略卡片**

```bash
git add src/components/workspace/BatchPolicyCard.vue
git commit -m "feat(ui): 添加批量策略汇总卡片组件"
```

---

### 任务 6：工作台双模式切换逻辑

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue:50-150`

- [ ] **步骤 1：在 ToolSlicer 中引入批量组件**

在 `ToolSlicer.vue` 的 `<script setup>` 部分添加：

```typescript
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';
import BatchPolicyCard from '../workspace/BatchPolicyCard.vue';

const videoStore = useVideoStore();
const { isBatchMode } = storeToRefs(videoStore);
```

- [ ] **步骤 2：修改模板实现双模式切换**

在 `ToolSlicer.vue` 的 `<template>` 部分（约第 50-100 行）修改：

```vue
<!-- 切片设置表单 -->
<div class="slice-settings">
  <!-- 现有的表单字段保持不变 -->
</div>

<!-- 单选模式：显示切片预览列表 -->
<div v-if="!isBatchMode" class="slice-preview-list">
  <!-- 现有的切片预览列表 -->
</div>

<!-- 批量模式：显示策略汇总卡片 -->
<BatchPolicyCard v-else />

<!-- 操作按钮 -->
<button @click="handleAnalyze" class="btn-primary">
  {{ isBatchMode ? '应用规则并批量扫描' : '分析切片' }}
</button>
```

- [ ] **步骤 3：Commit 双模式切换**

```bash
git add src/components/tools/ToolSlicer.vue
git commit -m "feat(ui): 实现工作台单选/批量双模式切换"
```

---

## 阶段三：主进程批量处理逻辑（IPC & FFmpeg Queue）

### 任务 7：串行任务队列工具类

**文件：**
- 创建：`src/utils/taskQueue.ts`

- [ ] **步骤 1：创建 TaskQueue 类**

```typescript
// src/utils/taskQueue.ts

export interface Task<T> {
  id: string;
  execute: () => Promise<T>;
}

export class TaskQueue<T> {
  private queue: Task<T>[] = [];
  private isProcessing = false;
  private maxRetries = 3;

  constructor(
    private onProgress?: (current: number, total: number) => void,
    private onTaskComplete?: (taskId: string, result: T) => void,
    private onTaskError?: (taskId: string, error: Error) => void
  ) {}

  enqueue(task: Task<T>) {
    this.queue.push(task);
    console.log(`[TaskQueue] 任务入队: ${task.id}, 队列长度: ${this.queue.length}`);
  }

  async start() {
    if (this.isProcessing) {
      console.warn('[TaskQueue] 队列已在运行中');
      return;
    }

    this.isProcessing = true;
    const total = this.queue.length;
    let current = 0;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      current++;

      console.log(`[TaskQueue] 执行任务 ${current}/${total}: ${task.id}`);
      this.onProgress?.(current, total);

      try {
        const result = await task.execute();
        this.onTaskComplete?.(task.id, result);
      } catch (error) {
        console.error(`[TaskQueue] 任务失败: ${task.id}`, error);
        this.onTaskError?.(task.id, error as Error);
      }
    }

    this.isProcessing = false;
    console.log('[TaskQueue] 队列执行完成');
  }

  clear() {
    this.queue = [];
    console.log('[TaskQueue] 队列已清空');
  }

  get length() {
    return this.queue.length;
  }
}
```

- [ ] **步骤 2：编写队列测试**

创建 `tests/utils/taskQueue.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TaskQueue } from '../../src/utils/taskQueue';

describe('TaskQueue', () => {
  it('should execute tasks sequentially', async () => {
    const executionOrder: number[] = [];
    const queue = new TaskQueue<number>();

    queue.enqueue({
      id: 'task1',
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push(1);
        return 1;
      }
    });

    queue.enqueue({
      id: 'task2',
      execute: async () => {
        executionOrder.push(2);
        return 2;
      }
    });

    await queue.start();

    expect(executionOrder).toEqual([1, 2]);
  });

  it('should call progress callback', async () => {
    const progressSpy = vi.fn();
    const queue = new TaskQueue<void>(progressSpy);

    queue.enqueue({ id: 't1', execute: async () =>  });
    queue.enqueue({ id: 't2', execute: async () => {} });

    await queue.start();

    expect(progressSpy).toHaveBeenCalledWith(1, 2);
    expect(progressSpy).toHaveBeenCalledWith(2, 2);
  });
});
```

- [ ] **步骤 3：运行测试验证**

```bash
npm test -- taskQueue.test.ts
```

预期：所有测试通过

- [ ] **步骤 4：Commit 队列工具类**

```bash
git add src/utils/taskQueue.ts tests/utils/taskQueue.test.ts
git commit -m "feat(utils): 添加串行任务队列工具类"
```

---

### 任务 8：主进程批量分析 IPC 处理器

**文件：**
- 修改：`src/ipc/sliceHandlers.ts:100-200`
- 修改：`src/main.ts:50-80`

- [ ] **步骤 1：在 sliceHandlers.ts 中添加批量分析处理器**

在 `sliceHandlers.ts` 中添加（约第 100 行后）：

```typescript
import { TaskQueue } from '../utils/taskQueue';
import type { BatchSliceGroup } from '../types/batch';

export async function handleBatchAnalyze(
  event: IpcMainInvokeEvent,
  videos: { path: string; id: string; name: string }[],
  params: SliceAnalyzeParams
): Promise<BatchSliceGroup[]> {
  console.log('[IPC] 批量分析请求:', videos.length, '个视频');

  const results: BatchSliceGroup[] = [];
  const queue = new TaskQueue<BatchSliceGroup>(
    (current, total) => {
      event.sender.send('batch-analyze-progress', { current, total });
    },
    (taskId, result) => {
      results.push(result);
    }
  );

  // 将所有视频分析任务入队
  for (const video of videos) {
    queue.enqueue({
      id: video.id,
      execute: async () => {
        const slices = await analyzeVideoSlices(video.path, params);
        return {
          videoId: video.id,
          videoPath: video.path,
          videoName: video.name,
          slices: slices.map((slice, index) => ({
            id: `${video.id}-slice-${index}`,
            videoId: video.id,
            label: slice.label,
            startTime: slice.startTime,
            endTime: slice.endTime,
            isActive: true
          })),
          createdAt: Date.now()
        };
      }
    });
  }

  // 串行执行所有任务
  await queue.start();

  console.log('[IPC] 批量分析完成:', results.length, '个结果');
  return results;
}
```

- [ ] **步骤 2：在 main.ts 中注册 IPC 通道**

在 `main.ts` 的 `app.whenReady()` 部分添加：

```typescript
import { handleBatchAnalyze } from './ipc/sliceHandlers';

ipcMain.handle('batch-analyze-slices', handleBatchAnalyze);
```

- [ ] **步骤 3：Commit IPC 处理器**

```bash
git add src/ipc/sliceHandlers.ts src/main.ts
git commit -m "feat(ipc): 添加批量视频分析 IPC 处理器"
```

---

## 阶段四：导出引擎与队列 UI（Export Pipeline）

### 任务 9：导出任务适配器（Getter）

**文件：**
- 修改：`src/store/useVideoStore.ts:150-200`

- [ ] **步骤 1：在 useVideoStore 中添加导出队列 Getter**

在 `useVideoStore.ts` 的 computed 部分添加：

```typescript
import type { ExportTask } from '../types/batch';

const exportTaskQueue = computed<ExportTask[]>(() => {
  const tasks: ExportTask[] = [];

  for (const group of batchSliceGroups.value) {
    for (const slice of group.slices) {
      // 只导出激活的切片
      if (!slice.isActive) continue;

      tasks.push({
        id: `export-${slice.id}`,
        videoPath: group.videoPath,
        videoName: group.videoName,
        slice: slice,
        outputPath: '', // 由导出流程动态生成
        status: 'pending',
        progress: 0
      });
    }
  }

  return tasks;
});
```

- [ ] **步骤 2：在 return 中导出 Getter**

```typescript
return {
  // ... 现有导出
  exportTaskQueue
};
```

- [ ] **步骤 3：Commit 导出适配器**

```bash
git add src/store/useVideoStore.ts
git commit -m "feat(store): 添加导出任务队列适配器"
```

---

### 任务 10：批量导出队列 UI

**文件：**
- 创建：`src/components/export/BatchExportQueue.vue`

- [ ] **步骤 1：创建 BatchExportQueue 组件（分块 1：模板和脚本）**

```vue
<template>
  <div class="batch-export-queue">
    <div class="queue-summary">
      <h3>批量切片导出任务</h3>
      <p>共 {{ totalVideos }} 个视频，拦截 {{ disabledCount }} 处废片，最终生成 {{ activeCount }} 个有效切片</p>
    </div>

    <div class="queue-progress">
      <h4>导出队列与进度</h4>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${overallProgress}%` }"></div>
      </div>
      <p class="progress-text">总进度: {{ completedCount }}/{{ totalTasks }}</p>
      <p v-if="currentTask" class="current-task">
        当前正在处理: {{ currentTask.videoName }}...{{ currentTask.slice.label }} ({{ currentTask.progress }}%)
      </p>
    </div>

    <div class="queue-list">
      <div v-for="task in exportTasks" :key="task.id" class="task-item" :class="task.status">
        <span class="task-name">{{ task.videoName }} - {{ task.slice.label }}</span>
        <span class="task-status">{{ statusText(task.status) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../../store/useVideoStore';

const videoStore = useVideoStore();
const { exportTaskQueue, batchSliceGroups } = storeToRefs(videoStore);

const exportTasks = computed(() => exportTaskQueue.value);

const totalVideos = computed(() => {
  return new Set(batchSliceGroups.value.map(g => g.videoId)).size;
});

const disabledCount = computed(() => {
  return batchSliceGroups.value.reduce((sum, group) => {
    return sum + group.slices.filter(s => !s.isActive).length;
  }, 0);
});

const activeCount = computed(() => exportTasks.value.length);

const totalTasks = computed(() => exportTasks.value.length);

const completedCount = computed(() => {
  return exportTasks.value.filter(t => t.status === 'completed').length;
});

const overallProgress = computed(() => {
  if (totalTasks.value === 0) return 0;
  return Math.round((completedCount.value / totalTasks.value) * 100);
});

const currentTask = computed(() => {
  return exportTasks.value.find(t => t.status === 'processing');
});

function statusText(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败'
  };
  return map[status] || status;
}
</script>
```

- [ ] **步骤 2：添加样式（分块 2）**

继续在同一文件中添加：

```vue
<style scoped>
.batch-export-queue { padding: var(--vt-space-4); }
.queue-summary { margin-bottom: var(--vt-space-4); }
.queue-summary h3 { font-size: 16px; margin-bottom: var(--vt-space-2); }
.queue-summary p { font-size: 12px; color: var(--vt-text-muted); }
.queue-progress { margin-bottom: var(--vt-space-4); }
.queue-progress h4 { font-size: 14px; margin-bottom: var(--vt-space-2); }
.progress-bar { height: 8px; background: var(--vt-bg-soft); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--vt-primary); transition: width 0.3s; }
.progress-text, .current-task { font-size: 12px; margin-top: var(--vt-space-2); }
.current-task { color: var(--vt-primary); font-family: var(--vt-font-mono); }
.queue-list { max-height: 300px; overflow-y: auto; }
.task-item { display: flex; justify-content: space-between; padding: var(--vt-space-2); border-bottom: 1px solid var(--vt-border); }
.task-item.completed { opacity: 0.6; }
.task-item.failed { color: var(--vt-danger); }
.task-name { font-size: 12px; font-family: var(--vt-font-mono); }
.task-status { font-size: 11px; color: var(--vt-text-muted); }
</style>
```

- [ ] **步骤 3：Commit 批量导出队列 UI**

```bash
git add src/components/export/BatchExportQueue.vue
git commit -m "feat(ui): 添加批量导出队列 UI 组件"
```

---

### 任务 11：导出面板集成批量队列

**文件：**
- 修改：`src/components/ExportPanel.vue:50-100`

- [ ] **步骤 1：在 ExportPanel 中引入批量队列组件**

在 `ExportPanel.vue` 的 `<script setup>` 部分添加：

```typescript
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';
import BatchExportQueue from './export/BatchExportQueue.vue';

const videoStore = useVideoStore();
const { isBatchMode } = storeToRefs(videoStore);
```

- [ ] **步骤 2：修改模板集成批量队列**

在 `ExportPanel.vue` 的 `<template>` 部分添加：

```vue
<!-- 单选模式：显示单个视频导出设置 -->
<div v-if="!isBatchMode" class="single-export">
  <!-- 现有的单视频导出 UI -->
</div>

<!-- 批量模式：显示批量导出队列 -->
<BatchExportQueue v-else />
```

- [ ] **步骤 3：Commit 导出面板集成**

```bash
git add src/components/ExportPanel.vue
git commit -m "feat(ui): 导出面板集成批量队列显示"
```

---

## 阶段五：端到端集成与验证（Integration & Testing）

### 任务 12：Preload API 扩展

**文件：**
- 修改：`src/preload.ts:20-50`

- [ ] **步骤 1：在 preload.ts 中添加批量分析 API**

```typescript
contextBridge.exposeInMainWorld('motionSlice', {
  // ... 现有 API
  batchAnalyzeSlices: (videos: any[], params: any) => 
    ipcRenderer.invoke('batch-analyze-slices', videos, params),
  onBatchAnalyzeProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('batch-analyze-progress', (_event, data) => callback(data));
  }
});
```

- [ ] **步骤 2：更新类型声明**

在 `src/types/preload.d.ts` 中添加：

```typescript
interface MotionSliceAPI {
  // ... 现有方法
  batchAnalyzeSlices: (videos: VideoFile[], params: SliceAnalyzeParams) => Promise<BatchSliceGroup[]>;
  onBatchAnalyzeProgress: (callback: (data: { current: number; total: number }) => void) => void;
}
```

- [ ] **步骤 3：Commit Preload API**

```bash
git add src/preload.ts src/types/preload.d.ts
git commit -m "feat(preload): 扩展批量分析 API"
```

---

### 任务 13：端到端流程验证

**文件：**
- 测试流程，无需新建文件

- [ ] **步骤 1：启动开发服务器**

```bash
npm start
```

- [ ] **步骤 2：手动测试批量选择**

验证点：
1. 多选 3 个视频文件
2. 确认 `selectedVideos` 状态更新
3. 确认中心区域切换为 Accordion List

- [ ] **步骤 3：手动测试批量分析**

验证点：
1. 点击"应用规则并批量扫描"按钮
2. 确认主进程串行执行（通过控制台日志）
3. 确认进度事件实时更新

- [ ] **步骤 4：手动测试切片禁用**

验证点：
1. 展开某个视频的切片列表
2. 点击"👁️ 禁用"按钮
3. 确认文字置灰并出现删除线
4. 切换到导出面板，确认该切片不在导出队列中

- [ ] **步骤 5：记录测试结果**

在 `docs/testing/batch-slicing-manual-test.md` 中记录测试结果：

```markdown
# 批量切片功能手动测试报告

**测试日期：** 2026-06-11
**测试环境：** Windows 11, Electron 42.1.0

## 测试用例 1：批量选择
- [ ] 多选 3 个视频 ✓
- [ ] 状态更新正确 ✓
- [ ] UI 切换正确 ✓

## 测试用例 2：批量分析
- [ ] 串行执行验证 ✓
- [ ] 进度实时更新 ✓
- [ ] 结果正确存储 ✓

## 测试用例 3：非破坏性编辑
- [ ] 禁用切片 UI 反馈 ✓
- [ ] 导出队列过滤正确 ✓
```

- [ ] **步骤 6：Commit 测试报告**

```bash
git add docs/testing/batch-slicing-manual-test.md
git commit -m "docs(test): 添加批量切片手动测试报告"
```

---

## 完成清单

**所有任务完成后，执行以下检查：**

- [ ] 所有 TypeScript 编译通过（`npm run type-check`）
- [ ] 所有单元测试通过（`npm test`）
- [ ] 代码风格检查通过（`npm run lint`）
- [ ] 手动测试所有关键流程无异常
- [ ] 内存占用正常（批量处理 10 个视频不超过 1GB）

**完成后使用：**
- **必需子技能：** superpowers:finishing-a-development-branch
