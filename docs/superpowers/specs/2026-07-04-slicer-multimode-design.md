# MotionSlice 视频切片多选模式设计规格

## 1. 概述

**目标：** 将视频切片工具从单选模式（按时长 OR 按大小）升级为多选模式（按时长 AND/OR 按大小），支持智能优先级判断和扩展性架构。

**业务价值：**
- 用户可同时设置时长和大小上限，取最先到达的条件切分
- 提升切片预览体验，实时显示预估大小
- 为未来新增"按场景"/"按静音"等模式预留架构空间

**范围：**
- 数据结构扩展（支持多模式配置数组）
- UI 改造（Radio → Checkbox，新增缓冲警告）
- 主进程逻辑升级（先到先切算法）
- 切片大小预估与动态标注
- Apple Design 风格工具选择器下拉框

---

## 2. 核心需求

### 2.1 切分模式改造

**当前状态：** 单选 Radio（按时长 OR 按大小）

**目标状态：** 多选 Checkbox（按时长 AND/OR 按大小）

**默认配置：**
- 按时长：勾选，默认 20 分钟
- 按大小：勾选，默认 1GB (1024 MB)

**优先级逻辑：**
- 计算每个勾选模式的第一个切点位置
- 选择最早到达的切点对应的模式
- 使用该模式切分整个视频（A 方案：全视频统一模式）

**示例：**
- 视频：30 分钟，800MB
- 勾选：按时长 20 分钟 + 按大小 1GB
- 判断：时长切点在 20 分钟，大小切点在 37.5 分钟（1024/800*30）
- 结果：按时长模式切分为 2 个片段（0-20 分钟，20-30 分钟）

---

### 2.2 交叠缓冲兼容性

**单选"按大小"时：**
- 自动禁用缓冲开关（灰色）
- 提示文字：「按大小模式不支持交叠缓冲（会导致切片大小不准确）」

**多选模式时（同时勾选时长+大小）：**
- 缓冲开关保持可用
- 若用户开启缓冲，显示警告横幅：「⚠️ 已勾选按大小模式，若最终按大小切分将忽略交叠缓冲」
- 运行时根据实际采用的模式决定是否应用缓冲

**单选"按时长"时：**
- 保持现有逻辑（缓冲开关正常可用）

**技术实现：**
- 主进程 `determineFirstReachedMode` 返回实际采用的模式
- 若采用模式为 `size`，强制将 `useOverlapHandles` 设为 false

---

### 2.3 不满足条件的视频处理

**定义：** 所有勾选的模式都无法产生至少 2 个切片

**判断逻辑：**
- 按时长：`videoDuration <= targetValue`
- 按大小：`fileSizeMB <= targetValue`

**处理方式：**
- 视为单切片（`segments.length === 1`）
- 文件名添加 `_切片1` 后缀
- UI 标注："无需切分"（灰色文字）
- 切片信息：`startTime: 0, endTime: videoDuration, label: "切片 1"`

**示例：**
- 视频：10 分钟，500MB
- 勾选：按时长 20 分钟 + 按大小 1GB
- 判断：两个条件都不满足
- 结果：生成单切片，标注"无需切分"

---

### 2.4 切片大小显示

**方案 A：预估 + 动态标注（已确认）**

**阶段 1 - 分析时预估：**
- 显示格式：`约 8.5 MB（基于原视频）`
- 计算公式：`fileSizeMB * (segmentDuration / videoDuration)`
- 显示位置：
  - 单选模式：切片列表卡片 + 时间轴 tooltip
  - 批量模式：BatchVideoGrid 切片展开面板

**阶段 2 - 导出设置改变时：**
- 显示格式：`约 8.5 MB → 约 12.3 MB（重新编码）`
- 触发条件：用户调整导出质量 < 100% 或切换格式
- 计算逻辑：根据质量参数调整系数（待后续实现）

**阶段 3 - 导出完成后：**
- 显示格式：`8.7 MB（实际）`
- 数据来源：读取导出文件的实际大小

**批量策略汇总修复：**
- 当前 Bug：从用户设置取值显示"切片参数"
- 修复方案：从实际分析结果（`appliedMode`）取值
- 多选模式描述：`"按时长 或 按大小（先到先切）"`

---

### 2.5 UI 样式优化

**工具选择器下拉框改造：**
- 当前：原生 `<select>` 元素
- 目标：Apple Design 风格自定义下拉框
- 视觉特征：
  - 卡片式浮层（深灰背景 `var(--vt-bg-elevated)`，微边框 `var(--vt-border-strong)`）
  - 毛玻璃效果：`backdrop-filter: blur(20px)`
  - 弹性动画：scale(0.95) → scale(1)，180ms ease
  - 选项 hover：背景色 `var(--vt-bg-soft)`
  - 圆角：`var(--vt-radius-lg)` (12px)

**切分模式复选框统一：**
- 文件树复选框：20px
- 切分模式复选框：24px
- 统一设计语言：圆角 `var(--vt-radius-sm)`，勾选动画一致

**批量策略汇总支持多选描述：**
- 单选模式：`"按时长 60s 切分"`
- 多选模式：`"按时长 或 按大小（先到先切）"`
- 显示实际应用的模式和参数值

---

## 3. 数据结构设计

### 3.1 类型定义扩展

**新增类型：`SliceModeConfig`**

```typescript
// src/types/slice.ts

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

**修改类型：`SliceAnalyzeParams`**

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

**修改类型：`SliceAnalyzeResult`**

```typescript
/**
 * 切片分析响应模型（新增字段）
 */
export interface SliceAnalyzeResult {
  segments: VideoSegment[];
  totalCount: number;
  videoDuration: number;
  appliedMode: SliceMode; // 新增：实际应用的模式
  estimatedSizes?: number[]; // 新增：每个切片的预估大小（MB）
  needsSlicing: boolean; // 新增：是否真正需要切分
}
```

**修改类型：`VideoSegment`**

```typescript
/**
 * 视频切片片段数据模型（新增字段）
 */
export interface VideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  label: string;
  headBuffer: number;
  tailBuffer: number;
  estimatedSize?: number; // 新增：预估大小（MB）
}
```

---

### 3.2 向后兼容策略

**主进程兼容检测：**

```typescript
// src/main/handlers/slice-handler.ts

function normalizeParams(params: any): SliceAnalyzeParams {
  // 新格式：modes 数组存在
  if (params.modes && Array.isArray(params.modes)) {
    return params as SliceAnalyzeParams;
  }
  
  // 旧格式：mode + targetValue
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

**渲染进程兼容：**
- 新组件优先使用新接口
- 保留旧版本的单模式逻辑作为 fallback
- 数据迁移：首次加载时检测旧数据，自动转换为新格式

---

## 4. 核心算法设计

### 4.1 先到先切算法

**函数：`determineFirstReachedMode`**

**职责：** 计算每个模式的第一个切点，返回最早到达的模式

**输入：**
- `videoDuration: number` - 视频总时长（秒）
- `fileSizeMB: number` - 视频文件大小（MB）
- `modes: SliceModeConfig[]` - 已启用的模式配置

**输出：**
- `{ mode: SliceMode; targetDuration: number }` - 采用的模式和对应的切分时长

**算法逻辑：**

```typescript
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
      const cutPoint = config.targetValue; // 秒
      if (cutPoint < minCutPoint) {
        minCutPoint = cutPoint;
        selectedMode = 'duration';
        targetDuration = config.targetValue;
      }
    } else if (config.mode === 'size') {
      const mbPerSecond = fileSizeMB / videoDuration;
      const cutPoint = config.targetValue / mbPerSecond; // 转换为秒
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

**关键点：**
- 按大小模式需转换为时长：`targetSizeMB / (fileSizeMB / videoDuration)`
- 比较所有模式的第一个切点，选择最小值
- 返回的 `targetDuration` 统一为秒数，后续切分逻辑可直接使用

---

### 4.2 是否需要切分判断

**函数：`needsSlicing`**

**职责：** 判断视频是否满足任一模式的切分条件

**输入：**
- `videoDuration: number` - 视频总时长（秒）
- `fileSizeMB: number` - 视频文件大小（MB）
- `modes: SliceModeConfig[]` - 已启用的模式配置

**输出：**
- `boolean` - true 表示需要切分，false 表示不满足条件

**算法逻辑：**

```typescript
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

**边界情况：**
- 所有模式都未勾选：返回 false（视为单切片）
- 视频时长/大小刚好等于目标值：返回 false（不切分）

---

### 4.3 切片大小预估

**函数：`estimateSegmentSizes`**

**职责：** 基于原视频码率预估每个切片的大小

**输入：**
- `segments: VideoSegment[]` - 切片数组
- `videoDuration: number` - 视频总时长（秒）
- `fileSizeMB: number` - 视频文件大小（MB）

**输出：**
- `number[]` - 每个切片的预估大小（MB，保留两位小数）

**算法逻辑：**

```typescript
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

**注意事项：**
- 预估基于平均码率（`fileSizeMB / videoDuration`）
- 不考虑 VBR（可变码率）的局部波动
- 包含缓冲区的时长（`startTime` 和 `endTime` 已应用缓冲扩张）

---

## 5. UI 组件设计

### 5.1 ToolSlicer.vue 改造

**改造要点：**
1. 切分模式从 Radio 改为 Checkbox（支持多选）
2. 动态显示配置区（勾选哪个模式就显示对应输入框）
3. 新增缓冲警告横幅（多选 + 包含按大小 + 开启缓冲时显示）
4. 缓冲开关自动禁用（单选按大小时禁用）

**关键状态：**

```typescript
// 切分模式启用状态
const enabledModes = ref({
  duration: true,  // 默认勾选
  size: true       // 默认勾选
});

// 按时长配置
const durationUnit = ref<'minutes' | 'seconds'>('minutes');
const durationDisplay = ref(20); // 默认 20 分钟

// 按大小配置
const sizeValue = ref(1024); // 默认 1GB

// 缓冲配置
const useOverlapHandles = ref(false);
const overlapDuration = ref(10.0);
```

**计算属性：**

```typescript
// 缓冲是否禁用（单选按大小时禁用）
const bufferDisabled = computed(() => {
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  return enabledCount === 1 && enabledModes.value.size;
});

// 缓冲警告横幅显示条件
const showBufferWarning = computed(() => {
  const enabledCount = Object.values(enabledModes.value).filter(Boolean).length;
  return enabledCount > 1 && enabledModes.value.size && useOverlapHandles.value;
});

// 缓冲提示文字
const bufferHintText = computed(() => {
  if (bufferDisabled.value) {
    return '按大小模式不支持交叠缓冲（会导致切片大小不准确）';
  }
  return '在切口两端延伸冗余时间，便于后期转场';
});
```

**样式规范：**
- Checkbox 大小：24px（文件树为 20px，切分模式更大以便点击）
- 圆角：`var(--vt-radius-sm)` (4px)
- 勾选状态：背景色 `var(--vt-primary)`，白色勾选图标
- 缓冲警告横幅：黄色边框 `rgba(251, 191, 36, 0.3)`，浅黄背景

---

### 5.2 SlicerSingleMode.vue 改造

**新增：切片大小显示**

**显示位置 1：切片列表卡片**

```vue
<div class="slice-time">
  {{ formatTime(slice.startTime) }} - {{ formatTime(slice.endTime) }}
  <span v-if="slice.estimatedSize" class="slice-size">
    • 约 {{ slice.estimatedSize.toFixed(1) }} MB
  </span>
</div>
```

**显示位置 2：时间轴 tooltip（Timeline.vue）**

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

---

### 5.3 SlicerBatchMode.vue 改造

**批量策略汇总修复：**

**当前错误实现（从用户设置取值）：**

```typescript
const strategyText = computed(() => {
  return `按${mode.value === 'duration' ? '时长' : '大小'} ${targetValue.value}${mode.value === 'duration' ? '秒' : 'MB'} 切分`;
});
```

**修复后实现（从实际结果取值）：**

```typescript
const strategyText = computed(() => {
  const groups = videoStore.batchSliceGroups;
  if (groups.length === 0) return '未分析';
  
  // 从第一个视频的分析结果获取实际应用的模式
  const firstGroup = groups[0];
  const appliedMode = firstGroup.appliedMode; // 新增字段
  
  const enabledCount = modes.value.filter(m => m.enabled).length;
  
  if (enabledCount > 1) {
    return '按时长 或 按大小（先到先切）';
  } else if (appliedMode === 'duration') {
    return `按时长 ${targetValue.value} 秒切分`;
  } else {
    return `按大小 ${targetValue.value} MB 切分`;
  }
});
```

**批量切片组类型扩展：**

```typescript
// src/types/batch.ts

export interface BatchSliceGroup {
  videoId: string;
  videoPath: string;
  videoName: string;
  slices: BatchSliceItem[];
  createdAt: number;
  appliedMode: SliceMode; // 新增：该视频实际采用的模式
  needsSlicing: boolean; // 新增：是否真正需要切分
}
```

---

### 5.4 Apple Design 工具选择器下拉框

**组件：ToolSelector.vue（新建）**

**职责：** 替代原生 `<select>`，提供 Apple 风格的自定义下拉框

**视觉规范：**
- 触发按钮：高度 36px，圆角 `var(--vt-radius-md)` (8px)
- 下拉浮层：
  - 背景：`var(--vt-bg-elevated)` + 毛玻璃 `backdrop-filter: blur(20px)`
  - 边框：`1px solid var(--vt-border-strong)`
  - 圆角：`var(--vt-radius-lg)` (12px)
  - 阴影：`0 8px 24px rgba(0, 0, 0, 0.4)`
- 动画：
  - 进入：`scale(0.95) opacity(0)` → `scale(1) opacity(1)`
  - 持续时间：180ms ease
  - 使用 `transform-origin: top center`

**交互逻辑：**
- 点击触发按钮展开/收起
- 点击选项后自动收起
- 点击外部区域自动收起（使用 `@click.outside` 指令）
- 键盘导航：上下箭头选择，Enter 确认，Esc 关闭

**HTML 结构：**

```vue
<div class="tool-selector">
  <button class="selector-trigger" @click="toggleDropdown">
    <span class="trigger-label">{{ selectedTool.label }}</span>
    <span class="trigger-icon">▼</span>
  </button>
  
  <Transition name="dropdown">
    <div v-if="isOpen" class="selector-dropdown" @click.outside="closeDropdown">
      <div
        v-for="tool in tools"
        :key="tool.value"
        class="dropdown-option"
        :class="{ active: tool.value === modelValue }"
        @click="selectTool(tool.value)"
      >
        {{ tool.label }}
      </div>
    </div>
  </Transition>
</div>
```

---

## 6. 实现文件清单

### 6.1 类型定义文件

**修改：`src/types/slice.ts`**
- 新增 `SliceMode` 类型
- 新增 `SliceModeConfig` 接口
- 修改 `SliceAnalyzeParams` 接口（`mode` → `modes`）
- 修改 `SliceAnalyzeResult` 接口（新增 3 个字段）
- 修改 `VideoSegment` 接口（新增 `estimatedSize` 字段）

**修改：`src/types/batch.ts`**
- 修改 `BatchSliceGroup` 接口（新增 2 个字段）

---

### 6.2 主进程文件

**修改：`src/main/handlers/slice-handler.ts`**
- 新增 `determineFirstReachedMode` 函数
- 新增 `needsSlicing` 函数
- 新增 `estimateSegmentSizes` 函数
- 新增 `normalizeParams` 函数（向后兼容）
- 修改 `analyzeVideoSlices` 函数（支持多模式）
- 修改 `handleBatchAnalyze` 函数（传递 `appliedMode` 和 `needsSlicing`）

---

### 6.3 UI 组件文件

**修改：`src/components/tools/ToolSlicer.vue`**
- Radio 改为 Checkbox
- 新增动态配置区（按时长/按大小输入框）
- 新增缓冲警告横幅
- 修改 `buildAnalyzeParams` 函数（构建多模式数组）
- 新增 `bufferDisabled`、`showBufferWarning`、`bufferHintText` 计算属性

**修改：`src/components/tools/SlicerSingleMode.vue`**
- 切片列表卡片新增大小显示
- 新增 `formatSize` 辅助函数

**修改：`src/components/tools/SlicerBatchMode.vue`**
- 修复批量策略汇总文案（从 `appliedMode` 取值）

**修改：`src/components/Timeline.vue`**
- 切片块 tooltip 新增大小显示

**新建：`src/components/common/ToolSelector.vue`**
- Apple Design 风格自定义下拉框
- 毛玻璃效果 + 弹性动画

**修改：`src/components/Inspector.vue`**
- 替换原生 `<select>` 为 `<ToolSelector>`

---

### 6.4 Preload 文件

**修改：`src/preload.ts`**
- 更新 `analyzeSlices` 的 TypeScript 类型签名
- 更新 `batchAnalyzeSlices` 的 TypeScript 类型签名

---

## 7. 架构保证

### 7.1 扩展性设计

**新增切分模式的步骤：**

1. 在 `SliceMode` 类型中添加新值（如 `'scene'`）
2. 在 `determineFirstReachedMode` 函数中添加对应的切点计算逻辑
3. 在 `ToolSlicer.vue` 中添加对应的 Checkbox 和配置输入框
4. 主进程切分逻辑保持不变（统一转换为 `targetDuration`）

**互斥规则扩展方案（预留）：**

```typescript
// 未来可在 SliceModeConfig 中添加互斥字段
interface SliceModeConfig {
  mode: SliceMode;
  targetValue: number;
  enabled: boolean;
  exclusiveWith?: SliceMode[]; // 与哪些模式互斥
}

// UI 层自动禁用互斥的选项
const isModeDisabled = (mode: SliceMode) => {
  for (const config of enabledModes.value) {
    if (config.enabled && config.exclusiveWith?.includes(mode)) {
      return true;
    }
  }
  return false;
};
```

---

### 7.2 向后兼容保证

**数据迁移策略：**
- 主进程检测旧格式参数，自动转换为新格式
- 渲染进程无需手动迁移，下次分析时自动使用新接口
- 旧版本生成的切片数据（无 `estimatedSize` 字段）正常显示，仅不展示大小

**API 兼容性：**
- Preload API 签名保持不变（仅内部类型定义更新）
- 主进程 IPC Handler 兼容新旧两种参数格式
- 返回结果新增字段为可选字段，不影响旧代码

---

## 8. 测试策略

### 8.1 单元测试

**测试文件：`tests/unit/slice-logic.test.ts`（新建）**

**测试用例：**

1. `determineFirstReachedMode` 函数
   - 单选按时长：返回时长模式
   - 单选按大小：返回大小模式（转换后的时长）
   - 多选时长先到：返回时长模式
   - 多选大小先到：返回大小模式
   - 边界情况：两个切点相同时的优先级

2. `needsSlicing` 函数
   - 满足时长条件：返回 true
   - 满足大小条件：返回 true
   - 两个都不满足：返回 false
   - 刚好等于目标值：返回 false

3. `estimateSegmentSizes` 函数
   - 单切片：预估大小等于文件大小
   - 多切片：预估大小总和约等于文件大小
   - 包含缓冲区的切片：预估大小正确计算

---

### 8.2 集成测试

**测试文件：`tests/integration/slicer-multimode.test.ts`（新建）**

**测试场景：**

1. 单选按时长切分
   - 输入：30 分钟视频，按时长 20 分钟
   - 预期：生成 2 个切片

2. 单选按大小切分
   - 输入：2GB 视频，按大小 1GB
   - 预期：生成 2 个切片

3. 多选时长先到
   - 输入：30 分钟 800MB 视频，按时长 20 分钟 + 按大小 1GB
   - 预期：按时长切分，生成 2 个切片

4. 多选大小先到
   - 输入：30 分钟 2GB 视频，按时长 20 分钟 + 按大小 1GB
   - 预期：按大小切分，生成 2 个切片

5. 不满足切分条件
   - 输入：10 分钟 500MB 视频，按时长 20 分钟 + 按大小 1GB
   - 预期：生成 1 个切片，`needsSlicing: false`

6. 缓冲智能降级
   - 输入：按大小模式 + 开启缓冲
   - 预期：实际切片不应用缓冲

---

### 8.3 UI 测试

**测试场景：**

1. Checkbox 多选交互
   - 勾选/取消勾选模式
   - 动态配置区显示/隐藏

2. 缓冲警告横幅
   - 多选 + 包含按大小 + 开启缓冲：显示
   - 单选按时长 + 开启缓冲：不显示

3. 缓冲开关禁用
   - 单选按大小：自动禁用
   - 多选或单选按时长：保持可用

4. 切片大小显示
   - 切片列表卡片显示预估大小
   - 时间轴 tooltip 显示预估大小

---

## 9. 风险与注意事项

### 9.1 性能风险

**问题：** 预估大小计算在主进程进行，批量分析时可能增加耗时

**缓解措施：**
- 预估逻辑非常简单（一次乘法），性能影响可忽略
- 已有的 TaskQueue 串行执行机制保证稳定性

---

### 9.2 预估准确性风险

**问题：** 基于平均码率的预估可能与实际大小有偏差

**场景：**
- VBR（可变码率）视频：局部码率波动大
- 包含复杂场景的片段：实际大小可能更大
- 质量参数调整：导出时重新编码会改变大小

**缓解措施：**
- 在 UI 中明确标注"约"和"基于原视频"
- 阶段 2 实现质量参数调整后的重新预估
- 阶段 3 显示实际大小作为最终真相

---

### 9.3 用户体验风险

**问题：** 多选模式的优先级逻辑可能不直观

**场景：** 用户同时勾选时长和大小，但不清楚最终会用哪个模式

**缓解措施：**
- 分析完成后在批量策略汇总中明确显示实际采用的模式
- 可考虑在 UI 中增加"预览切分决策"按钮（未来扩展）

---

## 10. 总结

本设计实现了以下核心目标：

1. ✅ 切分模式从单选升级为多选，支持同时设置时长和大小上限
2. ✅ 先到先切算法，智能选择最优模式
3. ✅ 缓冲兼容性处理，按大小模式自动降级
4. ✅ 不满足条件的视频视为单切片
5. ✅ 切片大小预估与动态标注
6. ✅ UI 样式优化（Checkbox 统一、Apple Design 下拉框）
7. ✅ 数据结构可扩展，支持未来新增模式
8. ✅ 向后兼容旧数据格式

**下一步：** 编写实现计划，拆分为小步骤任务。

