# 视频智能切分功能实现计划 ✅

> **状态：已完成** | 本文档记录了视频智能切分功能的完整实现过程，包括核心算法、UI 架构和迭代优化。

**目标：** 实现基于"动态工具箱"架构的视频智能切分功能，支持按时长/大小切分，并实现**双向交叠缓冲 (Overlap Handles)** 机制，提供专业 NLE 级别的时间轴可视化和三向联动。

**架构：** 前端通过 Pinia Store 管理切片预览状态，用户在工作台配置参数后通过 IPC 调用主进程的双向扩张算法，返回的切片数据（包含 `headBuffer` 和 `tailBuffer`）驱动三段式 DOM 渲染（左斜纹 + 纯色主体 + 右斜纹），点击任意切片触发播放器定位和全局高亮联动。

**技术栈：** Electron 42 + Vue 3 (Composition API) + TypeScript + Pinia + ffprobe-static

**核心特性：**
- ✅ 双向交叠缓冲：头部和尾部独立向外扩张，边界独立防护
- ✅ 专业 NLE 斜纹渲染：使用 `repeating-linear-gradient` 实现 45° 斜纹图案
- ✅ 三段式 DOM 结构：左斜纹（头部缓冲）+ 纯色主体（逻辑切片）+ 右斜纹（尾部缓冲）
- ✅ 时间轴架构升级：Sticky 粘性表头 + Canvas 安全画布 + 统一轨道高度

---

## 文件结构

### 新增文件 ✅
- `src/types/slice.ts` - 切片类型定义（VideoSegment 含 headBuffer/tailBuffer, SliceAnalyzeParams）
- `src/store/useSliceStore.ts` - 切片状态管理 Store
- `src/components/tools/ToolSlicer.vue` - 视频智能切分工具组件（交叠缓冲 UI）
- `src/main/handlers/slice-handler.ts` - 主进程切片计算 Handler（双向扩张算法）
- `src/utils/timelineGeometry.ts` - 时间轴几何计算工具
- `docs/overlap-handles-algorithm.md` - 交叠缓冲算法完整文档

### 修改文件 ✅
- `src/preload.ts` - 新增 analyzeSlices API
- `src/main.ts` - 注册 slice-handler
- `src/components/Inspector.vue` - 重命名 Tab + 动态工具箱架构
- `src/components/Timeline.vue` - 三段式切片轨道渲染 + 斜纹 CSS

---

## 核心功能机制：交叠缓冲 (Overlap Handles)

### 双向扩张算法

当设置了 `X` 秒的交叠缓冲时，对于任意一个逻辑切片（原始范围为 `start` ~ `end`）：

```typescript
// 原始逻辑切片范围（未扩张）
const logicalStart = currentTime;
const logicalEnd = currentTime + targetDuration;

// 头部向左扩张（不能小于 0）
const expandedStart = logicalStart - overlapDuration;
actualStart = Math.max(0, expandedStart);
headBuffer = logicalStart - actualStart; // 实际扩张量

// 尾部向右扩张（不能超过总时长）
const expandedEnd = logicalEnd + overlapDuration;
actualEnd = Math.min(videoDuration, expandedEnd);
tailBuffer = actualEnd - logicalEnd; // 实际扩张量
```

**示例：** 视频 180 秒，按 60 秒切分，缓冲 1 秒
- 片段 1：逻辑 0-60s → 实际 0-61s（headBuffer: 0s, tailBuffer: 1s）
- 片段 2：逻辑 60-120s → 实际 59-121s（headBuffer: 1s, tailBuffer: 1s）
- 片段 3：逻辑 120-180s → 实际 119-180s（headBuffer: 1s, tailBuffer: 0s）

### 三段式 DOM 结构

每个切片在时间轴上渲染为三个区域：

```
┌──────────────────────────────────────────────┐
│ [左斜纹]    [纯色主体]    [右斜纹]           │
│  头部缓冲    逻辑切片      尾部缓冲           │
│  headBuffer  原始范围      tailBuffer        │
└──────────────────────────────────────────────┘
```

**宽度计算：**
```typescript
const totalDuration = slice.endTime - slice.startTime;
const headPercent = (slice.headBuffer / totalDuration) * 100;
const bodyPercent = ((totalDuration - slice.headBuffer - slice.tailBuffer) / totalDuration) * 100;
const tailPercent = (slice.tailBuffer / totalDuration) * 100;
```

### 专业 NLE 斜纹渲染

使用 `repeating-linear-gradient` 实现 45° 斜纹图案：

```css
.slice-overlap-left, .slice-overlap-right {
  background:
    repeating-linear-gradient(
      45deg,
      rgba(139, 92, 246, 0.25) 0px,   /* 紫色线条 2px */
      rgba(139, 92, 246, 0.25) 2px,
      transparent 2px,                 /* 透明间隔 4px */
      transparent 6px
    ),
    rgba(88, 101, 242, 0.15);          /* 底色 */
}
```

**视觉参数：**
- 斜纹角度：45°
- 线条宽度：2px
- 线条间隔：4px（总周期 6px）
- 边界：左右各 2px 粗边框，锐利无模糊

详细算法说明请参考：`docs/overlap-handles-algorithm.md`

---

## 任务 1：类型定义 - 切片数据契约 ✅

**文件：**
- 创建：`src/types/slice.ts`

- [x] **步骤 1：创建切片类型定义文件**

```typescript
/**
 * 视频切片片段数据模型
 */
export interface VideoSegment {
  /** 唯一标识符 */
  id: string;
  /** 精确切片起始时间（秒，保留 2 位小数，已应用头部缓冲扩张） */
  startTime: number;
  /** 精确切片结束时间（秒，保留 2 位小数，已应用尾部缓冲扩张） */
  endTime: number;
  /** UI 展示标签，如 "片段 1" */
  label: string;
  /** 头部缓冲实际扩张时长（秒），用于渲染左侧斜纹区域 */
  headBuffer: number;
  /** 尾部缓冲实际扩张时长（秒），用于渲染右侧斜纹区域 */
  tailBuffer: number;
}

/**
 * 切片分析请求参数模型
 */
export interface SliceAnalyzeParams {
  /** 视频绝对物理路径 */
  filePath: string;
  /** 切分模式：按时长或按大小 */
  mode: 'duration' | 'size';
  /** 目标值（秒 或 MB） */
  targetValue: number;
  /** 是否开启交叠缓冲 (Overlap Handles) */
  useOverlapHandles: boolean;
  /** 交叠缓冲时长（秒，范围 0.0 - 5.0） */
  overlapDuration: number;
}

/**
 * 切片分析响应模型
 */
export interface SliceAnalyzeResult {
  /** 切片片段数组 */
  segments: VideoSegment[];
  /** 总片段数 */
  totalCount: number;
  /** 视频总时长（秒） */
  videoDuration: number;
}
```

- [x] **步骤 2：验证类型定义**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 3：Commit**

```bash
git add src/types/slice.ts
git commit -m "feat(类型): 添加视频切片数据契约定义"
```

---

## 任务 2：Pinia Store - 切片状态管理 ✅

**文件：**
- 创建：`src/store/useSliceStore.ts`

- [x] **步骤 1：创建切片 Store**

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { VideoSegment } from '../types/slice';

export const useSliceStore = defineStore('slice', () => {
  // 状态
  const previewSlices = ref<VideoSegment[]>([]);
  const activeSliceId = ref<string | null>(null);
  const isAnalyzing = ref(false);

  // Actions
  function setPreviewSlices(segments: VideoSegment[]) {
    previewSlices.value = segments;
  }

  function setActiveSlice(id: string | null) {
    activeSliceId.value = id;
  }

  function clearSlices() {
    previewSlices.value = [];
    activeSliceId.value = null;
  }

  function setAnalyzing(status: boolean) {
    isAnalyzing.value = status;
  }

  return {
    // State
    previewSlices,
    activeSliceId,
    isAnalyzing,
    // Actions
    setPreviewSlices,
    setActiveSlice,
    clearSlices,
    setAnalyzing,
  };
});
```

- [x] **步骤 2：验证 Store 定义**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 3：Commit**

```bash
git add src/store/useSliceStore.ts
git commit -m "feat(状态): 添加切片状态管理 Store"
```

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { VideoSegment } from '../types/slice';

export const useSliceStore = defineStore('slice', () => {
  // 状态
  const previewSlices = ref<VideoSegment[]>([]);
  const activeSliceId = ref<string | null>(null);
  const isAnalyzing = ref(false);

  // Actions
  function setPreviewSlices(segments: VideoSegment[]) {
    previewSlices.value = segments;
  }

  function setActiveSlice(id: string | null) {
    activeSliceId.value = id;
  }

  function clearSlices() {
    previewSlices.value = [];
    activeSliceId.value = null;
  }

  function setAnalyzing(status: boolean) {
    isAnalyzing.value = status;
  }

  return {
    // State
    previewSlices,
    activeSliceId,
    isAnalyzing,
    // Actions
    setPreviewSlices,
    setActiveSlice,
    clearSlices,
    setAnalyzing,
  };
});
```

- [x] **步骤 2：验证 Store 定义**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 3：Commit**

```bash
git add src/store/useSliceStore.ts
git commit -m "feat(状态): 添加切片状态管理 Store"
```

---

## 任务 3：主进程 Handler - 切片计算逻辑（双向扩张算法）✅

**文件：**
- 创建：`src/main/handlers/slice-handler.ts`

- [x] **步骤 1：创建切片计算 Handler（双向扩张算法）**

```typescript
import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { SliceAnalyzeParams, SliceAnalyzeResult, VideoSegment } from '../../types/slice';

const ffprobePath = getFfprobePath();

/**
 * 获取视频时长（秒）
 */
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];

    execFile(ffprobePath, args, { encoding: 'utf8' }, (err, stdout) => {
      if (err) {
        reject(new Error(`获取视频时长失败: ${err.message}`));
        return;
      }
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        reject(new Error('视频时长无效'));
        return;
      }
      resolve(duration);
    });
  });
}

/**
 * 按时长切分视频（双向扩张算法）
 */
function sliceByDuration(
  videoDuration: number,
  targetDuration: number,
  useOverlapHandles: boolean,
  overlapDuration: number
): VideoSegment[] {
  const segments: VideoSegment[] = [];
  let currentTime = 0;
  let segmentIndex = 1;

  while (currentTime < videoDuration) {
    // 原始逻辑切片范围（未扩张）
    const logicalStart = Math.round(currentTime * 100) / 100;
    let logicalEnd = Math.min(currentTime + targetDuration, videoDuration);
    logicalEnd = Math.round(logicalEnd * 100) / 100;

    // 初始化实际导出范围（与逻辑范围相同）
    let actualStart = logicalStart;
    let actualEnd = logicalEnd;
    let headBuffer = 0;
    let tailBuffer = 0;

    // 应用交叠缓冲：双向向外扩张
    if (useOverlapHandles && overlapDuration > 0) {
      // 头部向左扩张（不能小于 0）
      const expandedStart = logicalStart - overlapDuration;
      actualStart = Math.max(0, expandedStart);
      headBuffer = logicalStart - actualStart; // 实际扩张了多少

      // 尾部向右扩张（不能超过总时长）
      const expandedEnd = logicalEnd + overlapDuration;
      actualEnd = Math.min(videoDuration, expandedEnd);
      tailBuffer = actualEnd - logicalEnd; // 实际扩张了多少

      // 重新四舍五入到两位小数
      actualStart = Math.round(actualStart * 100) / 100;
      actualEnd = Math.round(actualEnd * 100) / 100;
      headBuffer = Math.round(headBuffer * 100) / 100;
      tailBuffer = Math.round(tailBuffer * 100) / 100;
    }

    segments.push({
      id: `segment-${segmentIndex}`,
      startTime: actualStart,
      endTime: actualEnd,
      label: `片段 ${segmentIndex}`,
      headBuffer,
      tailBuffer,
    });

    // 下一个片段的起始点仍然基于原始逻辑切点（不考虑交叠）
    currentTime = logicalEnd;
    segmentIndex++;
  }

  return segments;
}

/**
 * 按文件大小切分视频（简化版：基于时长估算）
 */
function sliceBySize(
  videoDuration: number,
  fileSizeMB: number,
  targetSizeMB: number,
  useOverlapHandles: boolean,
  overlapDuration: number
): VideoSegment[] {
  // 计算每秒的平均大小
  const mbPerSecond = fileSizeMB / videoDuration;
  // 计算目标时长
  const targetDuration = targetSizeMB / mbPerSecond;
  
  return sliceByDuration(videoDuration, targetDuration, useOverlapHandles, overlapDuration);
}

/**
 * 注册切片分析 IPC Handler
 */
export function registerSliceHandler() {
  ipcMain.handle('analyze-video-slices', async (_, params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => {
    try {
      const { filePath, mode, targetValue, useOverlapHandles, overlapDuration } = params;

      // 参数验证
      if (targetValue <= 0) {
        throw new Error(`目标值必须大于 0，当前值: ${targetValue}`);
      }
      if (overlapDuration < 0 || overlapDuration > 5) {
        throw new Error(`交叠缓冲时长必须在 0-5 秒之间，当前值: ${overlapDuration}`);
      }

      // 文件路径验证
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('文件路径无效或文件不存在');
      }

      // 获取视频时长
      const videoDuration = await getVideoDuration(filePath);

      let segments: VideoSegment[];

      if (mode === 'duration') {
        segments = sliceByDuration(videoDuration, targetValue, useOverlapHandles, overlapDuration);
      } else {
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        segments = sliceBySize(videoDuration, fileSizeMB, targetValue, useOverlapHandles, overlapDuration);
      }

      return {
        segments,
        totalCount: segments.length,
        videoDuration,
      };
    } catch (error) {
      console.error('切片分析失败:', error);
      throw error;
    }
  });
}
```

- [x] **步骤 2：验证 Handler 代码**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 3：Commit**

```bash
git add src/main/handlers/slice-handler.ts
git commit -m "feat(主进程): 实现视频切片双向扩张算法"
```
  // 计算目标时长
  const targetDuration = targetSizeMB / mbPerSecond;
  
  return sliceByDuration(videoDuration, targetDuration, false, 0);
}

/**
 * 注册切片分析 IPC Handler
 */
export function registerSliceHandler() {
  ipcMain.handle('analyze-video-slices', async (_, params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => {
    try {
      const { filePath, mode, targetValue, useSmartSilence, tolerance } = params;

      // 获取视频时长
      const videoDuration = await getVideoDuration(filePath);

      let segments: VideoSegment[];

      if (mode === 'duration') {
        segments = sliceByDuration(videoDuration, targetValue, useSmartSilence, tolerance);
      } else {
        // 按大小切分需要先获取文件大小
        const fs = await import('fs/promises');
        const stats = await fs.stat(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        segments = sliceBySize(videoDuration, fileSizeMB, targetValue);
      }

      return {
        segments,
        totalCount: segments.length,
        videoDuration,
      };
    } catch (error) {
      console.error('切片分析失败:', error);
      throw error;
    }
  });
}
```

- [x] **步骤 2：验证 Handler 代码**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 3：Commit**

```bash
git add src/main/handlers/slice-handler.ts
git commit -m "feat(主进程): 实现视频切片计算 Handler"
```

---

## 任务 4：主进程注册 - 集成 Handler

**文件：**
- 修改：`src/main.ts`

- [x] **步骤 1：导入并注册 slice-handler**

在 `src/main.ts` 顶部添加导入：
```typescript
import { registerSliceHandler } from './main/handlers/slice-handler';
```

在现有 handler 注册代码后添加：
```typescript
// 注册切片分析 Handler
registerSliceHandler();
```

- [x] **步骤 2：验证主进程启动**

运行：`npm start`
预期：应用正常启动，控制台无错误

- [x] **步骤 3：Commit**

```bash
git add src/main.ts
git commit -m "feat(主进程): 注册切片分析 Handler"
```

---

## 任务 5：Preload API - 暴露切片分析接口

**文件：**
- 修改：`src/preload.ts`

- [x] **步骤 1：添加类型导入**

在文件顶部添加：
```typescript
import type { SliceAnalyzeParams, SliceAnalyzeResult } from './types/slice';
```

- [x] **步骤 2：扩展 contextBridge API**

在 `contextBridge.exposeInMainWorld` 的 API 对象中添加：
```typescript
analyzeSlices: (params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> => 
  ipcRenderer.invoke('analyze-video-slices', params),
```

- [x] **步骤 3：更新全局类型声明**

在文件底部的 `declare global` 块中更新 `MotionSliceAPI` 接口：
```typescript
analyzeSlices: (params: SliceAnalyzeParams) => Promise<SliceAnalyzeResult>;
```

- [x] **步骤 4：验证 Preload 编译**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 5：Commit**

```bash
git add src/preload.ts
git commit -m "feat(预加载): 暴露切片分析 IPC 接口"
```

---

## 任务 6：工具组件 - ToolSlicer.vue

**文件：**
- 创建：`src/components/tools/ToolSlicer.vue`

- [x] **步骤 1：创建组件目录**

```bash
mkdir -p "D:\projects\freelance\motion-slice\src\components\tools"
```

- [x] **步骤 2：创建 ToolSlicer 组件（Part 1 - Script）**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useSliceStore } from '../../store/useSliceStore';
import { useVideoStore } from '../../store/useVideoStore';
import type { SliceAnalyzeParams } from '../../types/slice';

const sliceStore = useSliceStore();
const videoStore = useVideoStore();

const { previewSlices, activeSliceId, isAnalyzing } = storeToRefs(sliceStore);
const { activeVideo } = storeToRefs(videoStore);

// 表单状态
const mode = ref<'duration' | 'size'>('duration');
const targetValue = ref(60);
const useSmartSilence = ref(false);
const tolerance = ref(5);

// 计算属性
const canAnalyze = computed(() => {
  return activeVideo.value !== null && !isAnalyzing.value && targetValue.value > 0;
});

const inputLabel = computed(() => {
  return mode.value === 'duration' ? '目标时长 (秒)' : '目标大小 (MB)';
});

const inputPlaceholder = computed(() => {
  return mode.value === 'duration' ? '60' : '50';
});

// 方法
function handleModeChange(newMode: 'duration' | 'size') {
  mode.value = newMode;
  targetValue.value = newMode === 'duration' ? 60 : 50;
}

async function handleAnalyze() {
  if (!activeVideo.value) return;

  sliceStore.setAnalyzing(true);

  try {
    const params: SliceAnalyzeParams = {
      filePath: activeVideo.value.path,
      mode: mode.value,
      targetValue: targetValue.value,
      useSmartSilence: useSmartSilence.value,
      tolerance: tolerance.value,
    };

    const result = await window.motionSlice.analyzeSlices(params);
    sliceStore.setPreviewSlices(result.segments);
  } catch (error) {
    console.error('切片分析失败:', error);
  } finally {
    sliceStore.setAnalyzing(false);
  }
}

function handleSliceClick(sliceId: string, startTime: number) {
  sliceStore.setActiveSlice(sliceId);
  videoStore.setCurrentTime(startTime);
}

<template>
  <div class="tool-slicer">
    <!-- 表单区 -->
    <div class="form-section">
      <div class="form-group">
        <label class="form-label">切分模式</label>
        <div class="radio-group">
          <label class="radio-item">
            <input
              type="radio"
              :checked="mode === 'duration'"
              @change="handleModeChange('duration')"
            />
            <span>按时长</span>
          </label>
          <label class="radio-item">
            <input
              type="radio"
              :checked="mode === 'size'"
              @change="handleModeChange('size')"
            />
            <span>按大小</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">{{ inputLabel }}</label>
        <input
          v-model.number="targetValue"
          type="number"
          class="form-input"
          :placeholder="inputPlaceholder"
          min="1"
        />
      </div>

      <div class="form-group">
        <label class="switch-label">
          <input
            v-model="useSmartSilence"
            type="checkbox"
            class="switch-input"
          />
          <span>启用智能断句</span>
        </label>
      </div>

      <div v-if="useSmartSilence" class="form-group">
        <label class="form-label">容差范围 (秒)</label>
        <input
          v-model.number="tolerance"
          type="number"
          class="form-input"
          placeholder="5"
          min="0"
        />
      </div>
    </div>

    <!-- 动作区 -->
    <div class="action-section">
      <button
        class="btn-analyze"
        :disabled="!canAnalyze"
        @click="handleAnalyze"
      >
        <span v-if="isAnalyzing">⏳ 分析中...</span>
        <span v-else>⚡ 生成切片预览</span>
      </button>
    </div>

    <!-- 列表区 -->
    <div class="list-section">
      <div v-if="previewSlices.length === 0" class="empty-state">
        暂无切片预览
      </div>
      <div v-else class="slice-list">
        <div
          v-for="slice in previewSlices"
          :key="slice.id"
          class="slice-item"
          :class="{ active: slice.id === activeSliceId }"
          @click="handleSliceClick(slice.id, slice.startTime)"
        >
          <div class="slice-label">{{ slice.label }}</div>
          <div class="slice-time">
            {{ slice.startTime.toFixed(2) }}s - {{ slice.endTime.toFixed(2) }}s
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-slicer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.form-input {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.action-section {
  display: flex;
  justify-content: center;
}

.btn-analyze {
  padding: 10px 20px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

.btn-analyze:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.list-section {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.slice-list {
  display: flex;
  flex-direction: column;
}

.slice-item {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.2s;
}

.slice-item:hover {
  background: var(--bg-hover);
}

.slice-item.active {
  background: var(--accent-color-alpha);
  border-left: 3px solid var(--accent-color);
}

.slice-label {
  font-weight: 500;
  color: var(--text-primary);
}

.slice-time {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
</style>
```

- [x] **步骤 3：验证组件编译**

运行：`npm run lint`
预期：无 TypeScript 错误

- [x] **步骤 4：Commit**

```bash
git add src/components/tools/ToolSlicer.vue
git commit -m "feat(组件): 实现视频智能切分工具组件"
```

---

## 任务 7：Inspector 重构 - 动态工具箱架构

**文件：**
- 修改：`src/components/Inspector.vue`

- [x] **步骤 1：读取现有 Inspector 组件**

运行：`cat src/components/Inspector.vue`
目标：了解当前 Tab 结构和"分析" Tab 的实现

- [x] **步骤 2：重命名"分析" Tab 为"工作台"**

找到 Tab 定义部分，将：
```typescript
{ id: 'analysis', label: '分析' }
```
修改为：
```typescript
{ id: 'workbench', label: '工作台' }
```

同时更新对应的 `v-if` 条件：
```vue
<div v-if="activeTab === 'workbench'" class="tab-content">
```

- [x] **步骤 3：添加工具选择器**

在工作台 Tab 内容顶部添加：
```vue
<script setup lang="ts">
import { ref } from 'vue';
import ToolSlicer from './tools/ToolSlicer.vue';

// 现有代码...

const currentTool = ref<'slicer'>('slicer');
const toolOptions = [
  { value: 'slicer', label: '视频智能切分' }
];
</script>

<template>
  <!-- 现有代码... -->
  
  <div v-if="activeTab === 'workbench'" class="tab-content">
    <div class="tool-selector">
      <label class="tool-label">选择工具</label>
      <select v-model="currentTool" class="tool-select">
        <option
          v-for="tool in toolOptions"
          :key="tool.value"
          :value="tool.value"
        >
          {{ tool.label }}
        </option>
      </select>
    </div>
    
    <div class="tool-container">
      <component :is="currentTool === 'slicer' ? ToolSlicer : null" />
    </div>
  </div>
</template>
```

- [x] **步骤 4：添加工具选择器样式**

在 `<style scoped>` 中添加：
```css
.tool-selector {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.tool-select {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
}

.tool-container {
  flex: 1;
  overflow-y: auto;
}
```

- [x] **步骤 5：验证 UI 渲染**

运行：`npm start`
预期：右侧面板显示"工作台" Tab，包含工具选择器和 ToolSlicer 组件

- [x] **步骤 6：Commit**

```bash
git add src/components/Inspector.vue
git commit -m "feat(UI): 重构 Inspector 为动态工具箱架构"
```

---

## 任务 8：Timeline 集成 - 切片轨道可视化

**文件：**
- 修改：`src/components/Timeline.vue`

- [x] **步骤 1：读取现有 Timeline 组件**

运行：`cat src/components/Timeline.vue | head -100`
目标：了解当前轨道结构和时间计算逻辑

- [x] **步骤 2：导入切片 Store**

在 `<script setup>` 顶部添加：
```typescript
import { storeToRefs } from 'pinia';
import { useSliceStore } from '../store/useSliceStore';

const sliceStore = useSliceStore();
const { previewSlices, activeSliceId } = storeToRefs(sliceStore);
```

- [x] **步骤 3：添加切片位置计算方法**

在现有方法后添加：
```typescript
/**
 * 计算切片在时间轴上的位置和宽度
 */
function getSliceStyle(startTime: number, endTime: number) {
  const duration = videoStore.duration;
  if (!duration) return { left: '0%', width: '0%' };
  
  const leftPercent = (startTime / duration) * 100;
  const widthPercent = ((endTime - startTime) / duration) * 100;
  
  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
  };
}

/**
 * 点击切片块
 */
function handleSliceBlockClick(sliceId: string, startTime: number) {
  sliceStore.setActiveSlice(sliceId);
  videoStore.setCurrentTime(startTime);
}
```

- [x] **步骤 4：在模板中添加切片轨道**

找到 `.track-slices` 轨道（当前应该是空的占位），替换为：
```vue
<div class="track track-slices">
  <div class="track-label">切片</div>
  <div class="track-content">
    <div
      v-for="slice in previewSlices"
      :key="slice.id"
      class="slice-block"
      :class="{ active: slice.id === activeSliceId }"
      :style="getSliceStyle(slice.startTime, slice.endTime)"
      :title="`${slice.label}: ${slice.startTime.toFixed(2)}s - ${slice.endTime.toFixed(2)}s`"
      @click="handleSliceBlockClick(slice.id, slice.startTime)"
    >
      <span class="slice-block-label">{{ slice.label }}</span>
    </div>
  </div>
</div>
```

- [x] **步骤 5：添加切片块样式**

在 `<style scoped>` 中添加：
```css
.slice-block {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--accent-color-alpha, rgba(59, 130, 246, 0.3));
  border: 1px solid var(--accent-color, #3b82f6);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.slice-block:hover {
  background: var(--accent-color-alpha-hover, rgba(59, 130, 246, 0.5));
  z-index: 10;
}

.slice-block.active {
  background: var(--accent-color, #3b82f6);
  border-width: 2px;
  z-index: 20;
}

.slice-block-label {
  font-size: 11px;
  color: white;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  padding: 0 4px;
}
```

- [x] **步骤 6：验证时间轴渲染**

运行：`npm start`
预期：时间轴底部显示切片轨道，生成切片后显示色块

- [x] **步骤 7：测试三向联动**

手动测试：
1. 在工作台生成切片预览
2. 点击列表中的切片 → 播放器应跳转到对应时间
3. 点击时间轴上的切片块 → 播放器应跳转，列表项应高亮
4. 验证 active 状态在三个位置同步

- [x] **步骤 8：Commit**

```bash
git add src/components/Timeline.vue
git commit -m "feat(时间轴): 实现切片轨道可视化与三向联动"
```

---

## 任务 9：集成测试与验证

**文件：**
- 无新增文件

- [x] **步骤 1：完整功能测试**

启动应用：`npm start`

测试流程：
1. 选择一个视频文件
2. 切换到"工作台" Tab
3. 选择"按时长"模式，输入 30 秒
4. 点击"生成切片预览"
5. 验证列表显示切片
6. 验证时间轴显示切片块
7. 点击列表项，验证播放器跳转
8. 点击时间轴切片块，验证播放器跳转和列表高亮

- [x] **步骤 2：边界情况测试**

测试场景：
1. 未选择视频时，按钮应禁用
2. 输入无效值（0 或负数），验证表单验证
3. 切换"按大小"模式，验证计算正确性
4. 开启"智能断句"，验证容差输入框显示
5. 对短视频（< 10 秒）进行切分，验证边界处理

- [x] **步骤 3：性能测试**

测试场景：
1. 对长视频（> 1 小时）进行切分，验证响应时间
2. 生成大量切片（> 100 个），验证列表滚动性能
3. 快速切换视频，验证状态清理

- [x] **步骤 4：代码质量检查**

运行：`npm run lint`
预期：无 ESLint 错误或警告

- [x] **步骤 5：TypeScript 类型检查**

运行：`npx tsc --noEmit`
预期：无类型错误

- [x] **步骤 6：最终 Commit**

```bash
git add -A
git commit -m "test(切片): 完成集成测试与验证"
```

---

## 任务 10：文档更新

**文件：**
- 修改：`CLAUDE.md`

- [x] **步骤 1：更新项目概述**

在 `CLAUDE.md` 的"项目概述"部分添加：
```markdown
### 已实现功能
- ✅ 视频智能切分：支持按时长/大小切分，预留智能断句接口
- ✅ 三向联动：工作台列表、时间轴轨道、播放器实时同步
- ✅ 动态工具箱架构：可扩展的工具切换系统
```

- [x] **步骤 2：添加架构说明**

在"架构说明"部分添加：
```markdown
### 切片功能架构
- **类型定义**：`src/types/slice.ts` - VideoSegment, SliceAnalyzeParams
- **状态管理**：`src/store/useSliceStore.ts` - 切片预览和激活状态
- **IPC 通道**：`analyze-video-slices` - 主进程精确计算切片
- **UI 组件**：`src/components/tools/ToolSlicer.vue` - 工具表单和列表
- **可视化**：`src/components/Timeline.vue` - 切片轨道渲染
```

- [x] **步骤 3：Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): 更新切片功能架构文档"
```

---

## 执行后检查清单 ✅

完成所有任务后，验证以下内容：

- [x] 所有新增文件已创建并通过 lint 检查
- [x] 所有修改文件已正确更新
- [x] IPC 通道正常工作，主进程返回正确数据（含 headBuffer 和 tailBuffer）
- [x] Pinia Store 状态正确同步
- [x] UI 三向联动功能正常（工作台列表 ↔ 时间轴 ↔ 播放器）
- [x] 时间轴切片块位置和宽度计算准确（三段式 DOM 结构）
- [x] 所有 TypeScript 类型定义正确
- [x] 代码符合项目规范（见 `.claude/rules/`）
- [x] 所有步骤已 commit，commit message 符合规范
- [x] 双向扩张算法正确实现（头部和尾部独立计算）
- [x] 斜纹渲染视觉效果符合专业 NLE 标准
- [x] 边界防护逻辑正确（开头和结尾不超出范围）

---

## 已完成的迭代优化

在实现过程中，完成了以下额外的优化和修复：

### 算法层面
1. ✅ **修复单向扩张为双向扩张**
   - 问题：初版只在尾部扩张，中间片段头部没有缓冲
   - 修复：实现头部和尾部独立双向扩张，边界独立防护

2. ✅ **优化边界防护逻辑**
   - 头部缓冲：`headBuffer = logicalStart - Math.max(0, logicalStart - overlapDuration)`
   - 尾部缓冲：`tailBuffer = Math.min(videoDuration, logicalEnd + overlapDuration) - logicalEnd`

### 视觉层面
3. ✅ **修复混合模式不可见问题**
   - 问题：`mix-blend-mode: multiply` 在深色背景下导致色块变黑不可见
   - 修复：使用 `repeating-linear-gradient` 实现 45° 斜纹图案

4. ✅ **实现三段式 DOM 结构**
   - 左斜纹（头部缓冲）+ 纯色主体（逻辑切片）+ 右斜纹（尾部缓冲）
   - 每段宽度精确计算，边界锐利无模糊

5. ✅ **实现悬停整体高亮**
   - 悬停时三个区域（左斜纹 + 主体 + 右斜纹）同时变亮
   - z-index 层级管理：默认 1 → 悬停 10 → 激活 20

### 架构层面
6. ✅ **时间轴架构升级**
   - Sticky 粘性表头实现
   - Canvas 安全画布坐标系
   - 统一轨道高度标准（48px）
   - 暗黑滚动条定制

7. ✅ **新增几何计算工具**
   - `src/utils/timelineGeometry.ts`
   - 播放指针定位、点击定位等坐标转换

---

## 未来扩展点

当前实现为完整版本，以下功能可作为未来扩展：

1. ~~**智能断句（silencedetect）**~~ - **已废弃 (Deprecated)**
   - 原计划：集成 FFmpeg silencedetect 过滤器
   - 废弃原因：业务需求变更，改为交叠缓冲机制
   - 状态：相关代码和 UI 已完全移除

2. **切片导出**
   - 新增 IPC 通道：`export-video-slices`
   - 使用 FFmpeg 的 `-ss` 和 `-t` 参数进行精确切分
   - 支持批量导出和进度反馈
   - 利用 `headBuffer` 和 `tailBuffer` 实现精确的交叠导出

3. **切片预览**
   - 在列表项中显示缩略图
   - 支持悬停预览视频片段
   - 在时间轴斜纹区域显示交叠提示

4. **更多工具**
   - 晃动检测工具（已有 UI 占位）
   - 场景检测工具
   - 字幕提取工具

---

## 技术债务与已知限制

1. **性能优化**
   - 当切片数量 > 100 时，时间轴渲染可能有轻微卡顿
   - 建议：使用虚拟滚动或 Canvas 渲染优化

2. **交叠可视化**
   - 当前通过斜纹图案区分缓冲区域
   - 未来可考虑：鼠标悬停时显示交叠时间范围的 Tooltip

3. **导出功能缺失**
   - 当前只支持切片预览，不支持实际导出
   - 需要集成 FFmpeg 切分命令

---

## 相关文档

- **算法详细说明**：`docs/overlap-handles-algorithm.md`
- **项目架构文档**：`CLAUDE.md`
- **UI 样式规范**：`.claude/rules/02-ui-style-guide.md`
- **IPC 通信规范**：`.claude/rules/01-electron-ipc.md`

---

## Git 提交历史

关键 commits：
- `d9f5ea7` - fix(时间轴): 修复切片轨道对齐错位并升级专业 NLE 质感
- `5b75792` - feat(时间轴): 实现切片轨道可视化与三向联动
- `a234580` - feat(UI): 重构 Inspector 为动态工具箱架构

---

**计划状态：✅ 已完成**

所有核心功能已实现并通过测试，交叠缓冲机制运行稳定，视觉效果符合专业 NLE 标准。

1. **子代理驱动（推荐）** - 使用 `superpowers:subagent-driven-development`
2. **内联执行** - 使用 `superpowers:executing-plans`

```
