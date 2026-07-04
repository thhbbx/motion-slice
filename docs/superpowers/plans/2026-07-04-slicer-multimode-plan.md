# 视频切片多选模式 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将视频切片工具从单选模式（按时长 OR 按大小）升级为多选模式（按时长 AND/OR 按大小），支持智能优先级判断和扩展性架构

**架构：** 数据结构扩展为多模式配置数组，主进程实现先到先切算法，UI 从 Radio 改为 Checkbox，新增切片大小预估功能

**技术栈：** Vue 3 Composition API, TypeScript, Electron IPC, Pinia

---

## 文件结构

**类型定义文件：**
- `src/types/slice.ts` - 新增 `SliceMode` 和 `SliceModeConfig`，修改现有接口
- `src/types/batch.ts` - 扩展 `BatchSliceGroup` 接口

**主进程文件：**
- `src/main/handlers/slice-handler.ts` - 核心切分逻辑和算法函数

**UI 组件文件：**
- `src/components/tools/ToolSlicer.vue` - Radio → Checkbox，动态配置区
- `src/components/tools/SlicerSingleMode.vue` - 切片大小显示
- `src/components/tools/SlicerBatchMode.vue` - 批量策略汇总修复
- `src/components/Timeline.vue` - 时间轴 tooltip 大小显示
- `src/components/common/ToolSelector.vue` - 新建 Apple Design 下拉框
- `src/components/Inspector.vue` - 替换原生 select

**Preload 文件：**
- `src/preload.ts` - 更新类型签名

---

## 任务 1：扩展类型定义

**文件：**
- 修改：`src/types/slice.ts`
- 修改：`src/types/batch.ts`

- [ ] **步骤 1：备份当前类型定义**

```bash
git diff src/types/slice.ts > /tmp/slice-types-backup.patch
git diff src/types/batch.ts > /tmp/batch-types-backup.patch
```

- [ ] **步骤 2：在 slice.ts 中新增 SliceMode 类型**

在 `src/types/slice.ts` 文件顶部添加：

```typescript
/**
 * 切分模式枚举（可扩展）
 */
export type SliceMode = 'duration' | 'size' | 'scene' | 'silence';

/**
 * 单个切分模式的配置
 */
export interface SliceModeConfig {
  mode: SliceMode;
  targetValue: number;
  enabled: boolean;
}
```

- [ ] **步骤 3：修改 SliceAnalyzeParams 接口**

在 `src/types/slice.ts` 中，将现有的 `SliceAnalyzeParams` 接口修改为：

```typescript
/**
 * 切片分析请求参数模型（支持多选）
 */
export interface SliceAnalyzeParams {
  filePath: string;
  modes: SliceModeConfig[]; // 改为数组
  useOverlapHandles: boolean;
  overlapDuration: number;
}
```

- [ ] **步骤 4：修改 SliceAnalyzeResult 接口**

在 `src/types/slice.ts` 中，为 `SliceAnalyzeResult` 接口新增字段：

```typescript
/**
 * 切片分析响应模型（新增字段）
 */
export interface SliceAnalyzeResult {
  segments: VideoSegment[];
  totalCount: number;
  videoDuration: number;
  appliedMode: SliceMode; // 新增
  estimatedSizes?: number[]; // 新增
  needsSlicing: boolean; // 新增
}
```

- [ ] **步骤 5：修改 VideoSegment 接口**

在 `src/types/slice.ts` 中，为 `VideoSegment` 接口新增字段：

```typescript
export interface VideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  label: string;
  headBuffer: number;
  tailBuffer: number;
  estimatedSize?: number; // 新增
}
```

- [ ] **步骤 6：修改 BatchSliceGroup 接口**

在 `src/types/batch.ts` 中，为 `BatchSliceGroup` 接口新增字段：

```typescript
export interface BatchSliceGroup {
  videoId: string;
  videoPath: string;
  videoName: string;
  slices: BatchSliceItem[];
  createdAt: number;
  appliedMode: SliceMode; // 新增
  needsSlicing: boolean; // 新增
}
```

注意：需要在文件顶部导入 `SliceMode`：

```typescript
import type { SliceMode } from './slice';
```

- [ ] **步骤 7：验证类型定义**

运行 TypeScript 编译检查：

```bash
npm run type-check
```

预期：编译错误（因为主进程和 UI 组件尚未更新），记录错误信息供后续修复。

- [ ] **步骤 8：Commit 类型定义**

```bash
git add src/types/slice.ts src/types/batch.ts
git commit -m "feat(类型): 扩展切片类型定义支持多选模式

- 新增 SliceMode 枚举和 SliceModeConfig 接口
- SliceAnalyzeParams 改为多模式数组
- SliceAnalyzeResult 新增 appliedMode/estimatedSizes/needsSlicing
- VideoSegment 新增 estimatedSize 字段
- BatchSliceGroup 新增 appliedMode/needsSlicing 字段"
```

---

## 任务 2：实现主进程核心算法

**文件：**
- 修改：`src/main/handlers/slice-handler.ts`

- [ ] **步骤 1：新增 determineFirstReachedMode 函数**

在 `slice-handler.ts` 中，在 `sliceBySize` 函数之后添加：

```typescript
/**
 * 判断哪个模式先到（第一个切点）
 */
function determineFirstReachedMode(
  videoDuration: number,
  fileSizeMB: number,
  modes: SliceModeConfig[]
): { mode: SliceMode; targetDuration: number } {
  let minCutPoint = Infinity;
  let selectedMode: SliceMode = 'duration';
  let targetDuration = 0;

  for (const config of modes) {
    if (!config.enabled) continue;

    if (config.mode === 'duration') {
      const cutPoint = config.targetValue;
      if (cutPoint < minCutPoint) {
        minCutPoint = cutPoint;
        selectedMode = 'duration';
        targetDuration = config.targetValue;
      }
    } else if (config.mode === 'size') {
      const mbPerSecond = fileSizeMB / videoDuration;
      const cutPoint = config.targetValue / mbPerSecond;
      if (cutPoint < minCutPoint) {
        minCutPoint = cutPoint;
        selectedMode = 'size';
        targetDuration = cutPoint;
      }
    }
  }

  return { mode: selectedMode, targetDuration };
}
```

需要在文件顶部导入新类型：

```typescript
import type { SliceAnalyzeParams, SliceAnalyzeResult, VideoSegment, SliceMode, SliceModeConfig } from '../../types/slice';
```

- [ ] **步骤 2：新增 needsSlicing 函数**

在 `determineFirstReachedMode` 之后添加：

```typescript
/**
 * 检查是否需要切分
 */
function needsSlicing(
  videoDuration: number,
  fileSizeMB: number,
  modes: SliceModeConfig[]
): boolean {
  for (const config of modes) {
    if (!config.enabled) continue;

    if (config.mode === 'duration' && videoDuration > config.targetValue) {
      return true;
    }
    if (config.mode === 'size' && fileSizeMB > config.targetValue) {
      return true;
    }
  }
  return false;
}
```

- [ ] **步骤 3：新增 estimateSegmentSizes 函数**

在 `needsSlicing` 之后添加：

```typescript
/**
 * 预估切片大小
 */
function estimateSegmentSizes(
  segments: VideoSegment[],
  videoDuration: number,
  fileSizeMB: number
): number[] {
  return segments.map(seg => {
    const segmentDuration = seg.endTime - seg.startTime;
    const ratio = segmentDuration / videoDuration;
    return Math.round(fileSizeMB * ratio * 100) / 100;
  });
}
```

- [ ] **步骤 4：新增 normalizeParams 函数（向后兼容）**

在 `estimateSegmentSizes` 之后添加：

```typescript
/**
 * 参数格式标准化（向后兼容）
 */
function normalizeParams(params: any): SliceAnalyzeParams {
  if (params.modes && Array.isArray(params.modes)) {
    return params as SliceAnalyzeParams;
  }
  
  return {
    filePath: params.filePath,
    modes: [
      {
        mode: params.mode,
        targetValue: params.targetValue,
        enabled: true
      }
    ],
    useOverlapHandles: params.useOverlapHandles,
    overlapDuration: params.overlapDuration
  };
}
```

- [ ] **步骤 5：重写 analyzeVideoSlices 函数**

替换现有的 `analyzeVideoSlices` 函数为：

```typescript
async function analyzeVideoSlices(params: SliceAnalyzeParams): Promise<SliceAnalyzeResult> {
  const normalizedParams = normalizeParams(params);
  const { filePath, modes, useOverlapHandles, overlapDuration } = normalizedParams;

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('文件路径无效或文件不存在');
  }

  const videoDuration = await getVideoDuration(filePath);
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);

  const needsSlice = needsSlicing(videoDuration, fileSizeMB, modes);

  if (!needsSlice) {
    const segment: VideoSegment = {
      id: 'segment-1',
      startTime: 0,
      endTime: videoDuration,
      label: '切片 1',
      headBuffer: 0,
      tailBuffer: 0,
      estimatedSize: Math.round(fileSizeMB * 100) / 100
    };

    return {
      segments: [segment],
      totalCount: 1,
      videoDuration,
      appliedMode: modes.find(m => m.enabled)?.mode || 'duration',
      needsSlicing: false
    };
  }

  const { mode: appliedMode, targetDuration } = determineFirstReachedMode(videoDuration, fileSizeMB, modes);
  const shouldApplyBuffer = useOverlapHandles && appliedMode !== 'size';

  const segments = sliceByDuration(
    videoDuration,
    targetDuration,
    shouldApplyBuffer,
    shouldApplyBuffer ? overlapDuration : 0
  );

  const estimatedSizes = estimateSegmentSizes(segments, videoDuration, fileSizeMB);
  segments.forEach((seg, i) => {
    seg.estimatedSize = estimatedSizes[i];
  });

  return {
    segments,
    totalCount: segments.length,
    videoDuration,
    appliedMode,
    estimatedSizes,
    needsSlicing: true
  };
}
```

- [ ] **步骤 6：修改 handleBatchAnalyze 函数**

在 `handleBatchAnalyze` 函数中，修改返回对象构建部分（大约第 161-180 行）：

```typescript
return {
  videoId: video.id,
  videoPath: video.path,
  videoName: video.name,
  slices: result.segments.map((slice, index) => ({
    id: `${video.id}-slice-${index}`,
    videoId: video.id,
    label: slice.label,
    startTime: slice.startTime,
    endTime: slice.endTime,
    isActive: true,
    metadata: {
      duration: slice.endTime - slice.startTime,
      estimatedSize: slice.estimatedSize // 新增
    }
  })),
  createdAt: Date.now(),
  appliedMode: result.appliedMode, // 新增
  needsSlicing: result.needsSlicing // 新增
};
```

- [ ] **步骤 7：验证主进程代码**

运行 TypeScript 编译：

```bash
npm run type-check
```

预期：主进程类型错误已解决，但 UI 组件仍有错误。

- [ ] **步骤 8：Commit 主进程算法**

```bash
git add src/main/handlers/slice-handler.ts
git commit -m "feat(主进程): 实现多选模式切分算法

- 新增 determineFirstReachedMode 先到先切算法
- 新增 needsSlicing 判断函数
- 新增 estimateSegmentSizes 大小预估函数
- 新增 normalizeParams 向后兼容函数
- 重写 analyzeVideoSlices 支持多模式
- 修改 handleBatchAnalyze 传递新增字段"
```

---

## 任务 3：改造 ToolSlicer.vue 组件

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue`

- [ ] **步骤 1：修改状态定义**

在 `<script setup>` 中，替换现有的状态定义：

```typescript
// 切分模式启用状态
const enabledModes = ref({
  duration: true,
  size: true
});

// 按时长配置
const durationUnit = ref<'minutes' | 'seconds'>('minutes');
const durationDisplay = ref(20);

// 按大小配置
const sizeValue = ref(1024);

// 缓冲配置
const useOverlapHandles = ref<boolean>(false);
const overlapDuration = ref<number>(10.0);
```

- [ ] **步骤 2：新增计算属性**

在状态定义之后添加：

```typescript
const bufferDisabled = computed(() => {
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  return enabledCount === 1 && enabledModes.value.size;
});

const showBufferWarning = computed(() => {
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  return enabledCount > 1 && enabledModes.value.size && useOverlapHandles.value;
});

const bufferHintText = computed(() => {
  if (bufferDisabled.value) {
    return '按大小模式不支持交叠缓冲（会导致切片大小不准确）';
  }
  return '在切口两端延伸冗余时间，便于后期转场';
});
```

- [ ] **步骤 3：修改 handleAnalyze 函数**

找到 `handleAnalyze` 函数，修改参数构建部分：

```typescript
const params: SliceAnalyzeParams = {
  filePath: videos[0].path,
  modes: [
    ...(enabledModes.value.duration ? [{
      mode: 'duration' as const,
      targetValue: durationUnit.value === 'minutes' ? durationDisplay.value * 60 : durationDisplay.value,
      enabled: true
    }] : []),
    ...(enabledModes.value.size ? [{
      mode: 'size' as const,
      targetValue: sizeValue.value,
      enabled: true
    }] : [])
  ],
  useOverlapHandles: useOverlapHandles.value,
  overlapDuration: overlapDuration.value,
};
```

- [ ] **步骤 4：修改模板 - Radio 改为 Checkbox**

在 `<template>` 中，找到切分模式选择区域，替换为：

```vue
<div class="form-row">
  <label class="form-label">
    <span class="label-text">切分模式</span>
  </label>
  <div class="checkbox-group">
    <label class="checkbox-option">
      <input
        type="checkbox"
        v-model="enabledModes.duration"
        class="vt-checkbox"
        :disabled="disabled"
      />
      <span class="checkbox-label">按时长</span>
    </label>
    <label class="checkbox-option">
      <input
        type="checkbox"
        v-model="enabledModes.size"
        class="vt-checkbox"
        :disabled="disabled"
      />
      <span class="checkbox-label">按大小</span>
    </label>
  </div>
</div>
```

- [ ] **步骤 5：添加动态配置区**

在 Checkbox 组之后添加动态配置区：

```vue
<!-- 按时长配置 -->
<div v-if="enabledModes.duration" class="form-row mode-config">
  <label class="form-label">
    <span class="label-text">目标时长</span>
  </label>
  <div class="input-with-unit">
    <input
      type="number"
      v-model.number="durationDisplay"
      min="1"
      step="1"
      class="vt-input"
      :disabled="disabled"
    />
    <div class="unit-toggle">
      <button type="button" class="unit-option" :class="{ active: durationUnit === 'minutes' }" @click="durationUnit = 'minutes'" :disabled="disabled">分钟</button>
      <button type="button" class="unit-option" :class="{ active: durationUnit === 'seconds' }" @click="durationUnit = 'seconds'" :disabled="disabled">秒</button>
    </div>
  </div>
</div>

<!-- 按大小配置 -->
<div v-if="enabledModes.size" class="form-row mode-config">
  <label class="form-label">
    <span class="label-text">目标大小</span>
  </label>
  <div class="input-with-unit">
    <input
      type="number"
      v-model.number="sizeValue"
      min="1"
      step="10"
      class="vt-input"
      :disabled="disabled"
    />
    <div class="unit-label">MB</div>
  </div>
</div>
```

- [ ] **步骤 6：添加缓冲警告横幅**

在交叠缓冲开关之前添加：

```vue
<div v-if="showBufferWarning" class="buffer-warning">
  <span class="warning-icon">⚠️</span>
  <span class="warning-text">已勾选按大小模式，若最终按大小切分将忽略交叠缓冲</span>
</div>
```

- [ ] **步骤 7：修改缓冲开关禁用逻辑**

找到交叠缓冲的 input 元素，修改 `disabled` 属性：

```vue
<input
  type="checkbox"
  v-model="useOverlapHandles"
  class="vt-switch"
  :disabled="bufferDisabled || disabled"
/>
```

修改提示文字使用动态计算属性：

```vue
<div class="form-hint vt-muted">
  {{ bufferHintText }}
</div>
```

- [ ] **步骤 8：添加样式（Checkbox 和警告横幅）**

在 `<style scoped>` 中添加：

```css
/* Checkbox 组 */
.checkbox-group {
  display: flex;
  gap: var(--vt-space-4);
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  cursor: pointer;
}

.vt-checkbox {
  width: 24px;
  height: 24px;
  appearance: none;
  border: 2px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  cursor: pointer;
  position: relative;
  transition: all 180ms ease;
  flex-shrink: 0;
}

.vt-checkbox:hover {
  border-color: var(--vt-primary);
}

.vt-checkbox:checked {
  background: var(--vt-primary);
  border-color: var(--vt-primary);
}

.vt-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 10px;
  border: solid var(--vt-text);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-label {
  font-size: 14px;
  color: var(--vt-text-regular);
  user-select: none;
}

.mode-config {
  padding-left: var(--vt-space-6);
  border-left: 2px solid var(--vt-border);
}

.unit-label {
  padding: 0 var(--vt-space-3);
  font-size: 13px;
  color: var(--vt-text-secondary);
  font-weight: 500;
}

.buffer-warning {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  padding: var(--vt-space-3);
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--vt-radius-md);
}

.warning-icon {
  font-size: 16px;
}

.warning-text {
  font-size: 12px;
  color: var(--vt-text-regular);
  line-height: 1.4;
}
```

- [ ] **步骤 9：测试 ToolSlicer.vue 改造**

启动开发服务器并测试：

```bash
npm start
```

测试点：
- Checkbox 可以多选/取消
- 单选按大小时缓冲开关自动禁用
- 多选 + 包含按大小 + 开启缓冲时显示警告横幅
- 动态配置区正确显示/隐藏

- [ ] **步骤 10：Commit ToolSlicer.vue 改造**

```bash
git add src/components/tools/ToolSlicer.vue
git commit -m "feat(UI): ToolSlicer 改造为多选模式

- Radio 改为 Checkbox，支持多选
- 新增动态配置区（按时长/按大小输入框）
- 新增缓冲警告横幅
- 缓冲开关根据模式自动禁用
- 新增 bufferDisabled/showBufferWarning 计算属性
- 修改 handleAnalyze 构建多模式参数"
```

---

## 任务 4：切片大小显示 - SlicerSingleMode.vue

**文件：**
- 修改：`src/components/tools/SlicerSingleMode.vue`

- [ ] **步骤 1：修改切片时间显示**

在 `<template>` 中，找到 `.slice-time` 元素，修改为：

```vue
<div class="slice-time">
  {{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }}
  <span v-if="slice.estimatedSize" class="slice-size">
    • 约 {{ slice.estimatedSize.toFixed(1) }} MB
  </span>
</div>
```

- [ ] **步骤 2：添加大小显示样式**

在 `<style scoped>` 中添加：

```css
.slice-size {
  color: var(--vt-text-muted);
  font-size: 11px;
  margin-left: var(--vt-space-1);
}
```

- [ ] **步骤 3：测试切片大小显示**

```bash
npm start
```

测试：生成切片预览后，确认切片列表显示预估大小。

- [ ] **步骤 4：Commit SlicerSingleMode.vue**

```bash
git add src/components/tools/SlicerSingleMode.vue
git commit -m "feat(UI): SlicerSingleMode 显示切片预估大小

- 切片列表卡片新增大小显示
- 格式：约 X.X MB"
```

---

## 任务 5：批量策略汇总修复 - SlicerBatchMode.vue

**文件：**
- 修改：`src/components/tools/SlicerBatchMode.vue`

- [ ] **步骤 1：读取当前实现**

阅读 SlicerBatchMode.vue 的 `strategyText` 计算属性。

- [ ] **步骤 2：修改 strategyText 计算属性**

找到 `strategyText` 计算属性，替换为：

```typescript
const strategyText = computed(() => {
  const groups = videoStore.batchSliceGroups;
  if (groups.length === 0) return '未分析';
  
  const firstGroup = groups[0];
  const appliedMode = firstGroup.appliedMode;
  
  const modesFromSlicer = slicerStore.enabledModes;
  const enabledCount = Object.values(modesFromSlicer).filter(Boolean).length;
  
  if (enabledCount > 1) {
    return '按时长 或 按大小（先到先切）';
  } else if (appliedMode === 'duration') {
    return `按时长切分`;
  } else if (appliedMode === 'size') {
    return `按大小切分`;
  }
  
  return '未知模式';
});
```

注意：如果 `slicerStore` 不存在，需要从父组件传递 `enabledModes`，或直接从 `batchSliceGroups` 推断。

- [ ] **步骤 3：测试批量策略汇总**

```bash
npm start
```

测试：批量分析后，确认策略汇总文案正确显示实际应用的模式。

- [ ] **步骤 4：Commit SlicerBatchMode.vue**

```bash
git add src/components/tools/SlicerBatchMode.vue
git commit -m "fix(UI): 修复批量策略汇总从实际结果取值

- 从 appliedMode 字段获取实际应用的模式
- 多选模式显示：按时长 或 按大小（先到先切）"
```

---

## 任务 6：时间轴 tooltip 显示大小 - Timeline.vue

**文件：**
- 修改：`src/components/Timeline.vue`

- [ ] **步骤 1：查找切片块渲染代码**

在 Timeline.vue 中找到切片块的渲染部分（`.slice-block`）。

- [ ] **步骤 2：添加 tooltip 结构**

为切片块添加 tooltip（如果已有 tooltip，则在其中添加大小显示）：

```vue
<div class="slice-tooltip">
  <div class="tooltip-label">{{ slice.label }}</div>
  <div class="tooltip-time">
    {{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }}
  </div>
  <div v-if="slice.estimatedSize" class="tooltip-size">
    约 {{ slice.estimatedSize.toFixed(1) }} MB（基于原视频）
  </div>
</div>
```

- [ ] **步骤 3：添加 tooltip 样式**

在 `<style scoped>` 中添加：

```css
.slice-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-md);
  padding: var(--vt-space-2);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 180ms ease;
  z-index: 1000;
}

.slice-block:hover .slice-tooltip {
  opacity: 1;
}

.tooltip-label {
  font-weight: 500;
  margin-bottom: var(--vt-space-1);
}

.tooltip-time {
  color: var(--vt-text-secondary);
  font-family: var(--vt-font-mono);
}

.tooltip-size {
  color: var(--vt-text-muted);
  margin-top: var(--vt-space-1);
  font-size: 11px;
}
```

- [ ] **步骤 4：测试时间轴 tooltip**

```bash
npm start
```

测试：鼠标悬停在切片块上，确认 tooltip 显示大小信息。

- [ ] **步骤 5：Commit Timeline.vue**

```bash
git add src/components/Timeline.vue
git commit -m "feat(UI): Timeline 切片块 tooltip 显示预估大小

- 新增 tooltip 结构显示切片信息
- 包含标签、时间范围、预估大小"
```

---

## 任务 7：Apple Design 工具选择器下拉框

**文件：**
- 新建：`src/components/common/ToolSelector.vue`
- 修改：`src/components/Inspector.vue`

- [ ] **步骤 1：创建 ToolSelector.vue 组件**

创建文件 `src/components/common/ToolSelector.vue`：

```vue
<template>
  <div class="tool-selector">
    <button class="selector-trigger" @click="toggleDropdown">
      <span class="trigger-label">{{ selectedLabel }}</span>
      <span class="trigger-icon" :class="{ open: isOpen }">▼</span>
    </button>
    
    <Transition name="dropdown">
      <div v-if="isOpen" class="selector-dropdown" v-click-outside="closeDropdown">
        <div
          v-for="option in options"
          :key="option.value"
          class="dropdown-option"
          :class="{ active: option.value === modelValue }"
          @click="selectOption(option.value)"
        >
          {{ option.label }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface ToolOption {
  value: string;
  label: string;
}

interface Props {
  modelValue: string;
  options: ToolOption[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isOpen = ref(false);

const selectedLabel = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue)?.label || '';
});

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function closeDropdown() {
  isOpen.value = false;
}

function selectOption(value: string) {
  emit('update:modelValue', value);
  closeDropdown();
}
</script>

<style scoped>
.tool-selector {
  position: relative;
}

.selector-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 var(--vt-space-3);
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  font-size: 14px;
  color: var(--vt-text-regular);
  cursor: pointer;
  transition: all 180ms ease;
}

.selector-trigger:hover {
  border-color: var(--vt-primary);
}

.trigger-icon {
  font-size: 10px;
  transition: transform 180ms ease;
}

.trigger-icon.open {
  transform: rotate(180deg);
}

.selector-dropdown {
  position: absolute;
  top: calc(100% + var(--vt-space-1));
  left: 0;
  right: 0;
  background: var(--vt-bg-elevated);
  backdrop-filter: blur(20px);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  z-index: 1000;
}

.dropdown-option {
  padding: var(--vt-space-3);
  font-size: 14px;
  color: var(--vt-text-regular);
  cursor: pointer;
  transition: background 180ms ease;
}

.dropdown-option:hover {
  background: var(--vt-bg-soft);
}

.dropdown-option.active {
  background: var(--vt-primary-soft);
  color: var(--vt-primary);
  font-weight: 500;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 180ms ease;
  transform-origin: top center;
}

.dropdown-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
```

- [ ] **步骤 2：添加 v-click-outside 指令**

在 `src/directives/clickOutside.ts` 创建指令（如果不存在）：

```typescript
import type { Directive } from 'vue';

export const vClickOutside: Directive = {
  mounted(el, binding) {
    el.clickOutsideEvent = (event: MouseEvent) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event);
      }
    };
    document.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el) {
    document.removeEventListener('click', el.clickOutsideEvent);
  },
};
```

在 ToolSelector.vue 中导入并注册：

```typescript
import { vClickOutside } from '../../directives/clickOutside';
```

- [ ] **步骤 3：在 Inspector.vue 中使用 ToolSelector**

找到 Inspector.vue 中的工具选择器部分，替换为：

```vue
<ToolSelector
  v-model="currentTool"
  :options="[
    { value: 'slicer', label: '视频智能切分' }
  ]"
/>
```

在 `<script setup>` 中导入：

```typescript
import ToolSelector from './common/ToolSelector.vue';
```

- [ ] **步骤 4：测试 ToolSelector 组件**

```bash
npm start
```

测试点：
- 点击触发按钮展开/收起
- 下拉浮层显示毛玻璃效果
- 动画流畅（scale + opacity）
- 点击外部区域自动关闭

- [ ] **步骤 5：Commit ToolSelector 组件**

```bash
git add src/components/common/ToolSelector.vue src/directives/clickOutside.ts src/components/Inspector.vue
git commit -m "feat(UI): 新增 Apple Design 风格工具选择器

- 创建 ToolSelector.vue 自定义下拉框
- 毛玻璃效果 + 弹性动画
- 新增 v-click-outside 指令
- Inspector.vue 替换原生 select"
```

---

## 任务 8：更新 Preload 类型签名

**文件：**
- 修改：`src/preload.ts`

- [ ] **步骤 1：更新 analyzeSlices 类型**

在 `preload.ts` 中，找到 `analyzeSlices` 的类型声明，确保类型签名匹配新接口：

```typescript
analyzeSlices: (params: SliceAnalyzeParams) => Promise<SliceAnalyzeResult>;
```

- [ ] **步骤 2：更新 batchAnalyzeSlices 类型**

确保 `batchAnalyzeSlices` 返回类型包含新增字段：

```typescript
batchAnalyzeSlices: (
  videos: { path: string; id: string; name: string }[],
  params: Omit<SliceAnalyzeParams, 'filePath'>
) => Promise<BatchSliceGroup[]>;
```

- [ ] **步骤 3：验证类型定义**

```bash
npm run type-check
```

预期：所有类型错误已解决。

- [ ] **步骤 4：Commit Preload 更新**

```bash
git add src/preload.ts
git commit -m "chore(preload): 更新 IPC 类型签名

- 更新 analyzeSlices 类型定义
- 更新 batchAnalyzeSlices 返回类型"
```

---

## 任务 9：端到端测试

**无需修改文件，纯手动测试**

- [ ] **步骤 1：启动应用**

```bash
npm start
```

- [ ] **步骤 2：测试单选模式（按时长）**

1. 导入视频
2. 勾选"按时长"，取消"按大小"
3. 设置时长 1 分钟
4. 开启缓冲（应该可用）
5. 点击"生成切片预览"
6. 验证：
   - 切片列表显示预估大小
   - 时间轴 tooltip 显示大小
   - 应用了缓冲

- [ ] **步骤 3：测试单选模式（按大小）**

1. 取消"按时长"，勾选"按大小"
2. 设置大小 50 MB
3. 验证缓冲开关自动禁用（灰色）
4. 点击"生成切片预览"
5. 验证：切片没有应用缓冲

- [ ] **步骤 4：测试多选模式（时长先到）**

1. 同时勾选"按时长 1 分钟"+"按大小 100 MB"
2. 导入 5 分钟 50 MB 视频
3. 开启缓冲
4. 验证：显示警告横幅
5. 点击"生成切片预览"
6. 验证：按时长切分，应用了缓冲

- [ ] **步骤 5：测试多选模式（大小先到）**

1. 同时勾选"按时长 10 分钟"+"按大小 50 MB"
2. 导入 5 分钟 200 MB 视频
3. 点击"生成切片预览"
4. 验证：按大小切分，没有应用缓冲

- [ ] **步骤 6：测试不满足条件的视频**

1. 同时勾选"按时长 20 分钟"+"按大小 1 GB"
2. 导入 10 分钟 500 MB 视频
3. 点击"生成切片预览"
4. 验证：
   - 生成 1 个切片
   - 标注"无需切分"（如果有此 UI）
   - 切片时长等于视频总时长

- [ ] **步骤 7：测试批量模式**

1. 选择多个视频
2. 同时勾选"按时长 20 分钟"+"按大小 1 GB"
3. 点击"应用规则并批量扫描"
4. 验证：
   - 批量策略汇总显示"按时长 或 按大小（先到先切）"
   - 每个视频根据其实际情况采用不同模式
   - 切片大小正确显示

- [ ] **步骤 8：测试向后兼容**

1. 清空浏览器缓存（如果有持久化数据）
2. 重新导入视频并生成切片
3. 验证：旧数据格式正常加载（如果有）

- [ ] **步骤 9：记录测试结果**

创建测试报告 `docs/superpowers/test-reports/2026-07-04-multimode-test.md`，记录所有测试结果。

---

## 任务 10：最终验证与文档

**文件：**
- 修改：`docs/architecture.md`（更新架构文档）

- [ ] **步骤 1：运行完整类型检查**

```bash
npm run type-check
```

预期：无类型错误。

- [ ] **步骤 2：运行代码检查**

```bash
npm run lint
```

预期：无 lint 错误。

- [ ] **步骤 3：更新架构文档**

在 `docs/architecture.md` 中添加多选模式的说明：

```markdown
### 切分模式多选支持

**数据结构：**
- `SliceModeConfig[]` 数组存储多个模式配置
- 每个模式包含 `mode`、`targetValue`、`enabled` 字段

**先到先切算法：**
- `determineFirstReachedMode` 函数计算第一个切点
- 选择最早到达的模式切分整个视频

**缓冲智能降级：**
- 按大小模式自动忽略缓冲设置
- 多选模式根据实际采用的模式决定是否应用缓冲
```

- [ ] **步骤 4：Commit 架构文档更新**

```bash
git add docs/architecture.md
git commit -m "docs(架构): 添加多选模式说明"
```

- [ ] **步骤 5：创建最终 commit**

确保所有更改已提交：

```bash
git status
```

如果有未提交的文件，统一提交：

```bash
git add .
git commit -m "chore: 完成视频切片多选模式功能"
```

- [ ] **步骤 6：验证 Git 历史**

```bash
git log --oneline -10
```

预期：看到所有任务的 commit 记录，每个 commit 都有清晰的描述。

---

## 验收标准

**功能完整性：**
- ✅ 切分模式支持多选（Checkbox）
- ✅ 先到先切算法正确工作
- ✅ 缓冲智能降级（按大小模式自动禁用）
- ✅ 不满足条件的视频视为单切片
- ✅ 切片大小预估正确显示
- ✅ 批量策略汇总从实际结果取值
- ✅ Apple Design 工具选择器替代原生 select

**代码质量：**
- ✅ 无 TypeScript 类型错误
- ✅ 无 ESLint 警告
- ✅ 遵循项目代码规范（CLAUDE.md 和 rules）

**用户体验：**
- ✅ UI 样式符合设计规范（4px 网格、暗黑主题）
- ✅ 动画流畅（180ms ease）
- ✅ 交互反馈及时（警告横幅、禁用状态）

**向后兼容：**
- ✅ 旧数据格式正常加载
- ✅ 主进程兼容新旧两种参数格式

---

## 风险与注意事项

1. **类型兼容性：** 主进程的 `normalizeParams` 函数必须正确处理旧格式参数
2. **UI 状态同步：** 缓冲开关禁用逻辑必须与模式选择实时同步
3. **预估准确性：** 切片大小预估基于平均码率，VBR 视频可能有偏差
4. **批量模式：** 每个视频可能采用不同模式，UI 需清晰展示

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-07-04-slicer-multimode-plan.md`。两种执行方式：

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

选哪种方式？

