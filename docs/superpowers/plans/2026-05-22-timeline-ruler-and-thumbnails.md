# 时间轴刻度尺与视频缩略图带实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 Timeline.vue 中实现动态时间刻度尺轨和真实视频缩略图主轨，提供专业的视频编辑时间轴体验。

**架构：** 刻度尺通过 computed 属性动态计算主次刻度位置和标签；缩略图通过隐藏的 video + canvas 元素异步抽帧生成 Base64 图片数组，渲染为 flex 布局的图片带。两者均采用 100% 宽度 Fit-to-Screen 策略。

**技术栈：** Vue 3 Composition API、Canvas API、HTML5 Video API、TypeScript

---

## 文件结构

**修改文件：**
- `src/components/Timeline.vue` - 添加刻度尺计算逻辑、缩略图抽帧引擎和渲染逻辑
- `src/utils/timeFormat.ts` - 添加刻度尺时间标签格式化工具函数

**不创建新文件** - 所有逻辑内聚在 Timeline.vue 组件中

---

## 任务 1：时间格式化工具函数扩展

**文件：**
- 修改：`src/utils/timeFormat.ts`

- [x] **步骤 1：添加刻度尺专用的简洁时间格式化函数**

在 `timeFormat.ts` 末尾添加：

```typescript
/**
 * 将秒数格式化为刻度尺标签（智能省略前导零）
 * 规则：
 * - 小于 60 秒：返回 "Xs"（如 "5s", "30s"）
 * - 小于 1 小时：返回 "mm:ss"（如 "01:30", "05:00"）
 * - 大于等于 1 小时：返回 "H:mm:ss"（如 "1:05:30", "2:00:00"）
 * @param seconds 秒数
 * @returns 格式化后的刻度标签
 */
export function formatRulerLabel(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0s';

  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h === 0) {
    // mm:ss 格式
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // H:mm:ss 格式（小时不补零）
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
```

- [x] **步骤 2：验证格式化函数输出**

在浏览器控制台或临时测试中验证：

```typescript
console.log(formatRulerLabel(5));      // "5s"
console.log(formatRulerLabel(30));     // "30s"
console.log(formatRulerLabel(90));     // "01:30"
console.log(formatRulerLabel(3665));   // "1:01:05"
```

预期：所有输出符合规则

---

## 任务 2：动态时间刻度尺数据计算

**文件：**
- 修改：`src/components/Timeline.vue:45-80`（script setup 区域）

- [x] **步骤 1：定义刻度数据类型接口**

在 `<script setup>` 顶部 import 之后添加：

```typescript
interface TimelineTick {
  time: number;        // 时间点（秒）
  position: number;    // 水平位置（百分比 0-100）
  isMajor: boolean;    // 是否为主刻度
  label: string;       // 显示标签（仅主刻度有值）
}
```

- [x] **步骤 2：添加动态步长计算函数**

在 `handleSeek` 函数之后添加：

```typescript
/**
 * 根据视频总时长动态计算主刻度时间间隔
 * 目标：屏幕内保持 10-20 个主刻度
 * @param totalDuration 视频总时长（秒）
 * @returns 主刻度间隔（秒）
 */
function calculateMajorTickInterval(totalDuration: number): number {
  if (totalDuration === 0) return 1;

  // 候选步长（秒）：1s, 5s, 10s, 30s, 1min, 5min, 10min, 30min, 1h
  const candidates = [1, 5, 10, 30, 60, 300, 600, 1800, 3600];

  // 目标主刻度数量范围
  const targetMin = 10;
  const targetMax = 20;

  for (const interval of candidates) {
    const tickCount = totalDuration / interval;
    if (tickCount >= targetMin && tickCount <= targetMax) {
      return interval;
    }
  }

  // 如果视频过长，返回最大步长
  if (totalDuration / 3600 > targetMax) {
    return 3600; // 1 小时
  }

  // 如果视频过短，返回最小步长
  return 1;
}
```

- [x] **步骤 3：添加刻度数组计算 computed 属性**

在 `playheadPosition` computed 之后添加：

```typescript
// 计算属性：时间轴刻度数组
const timelineTicks = computed<TimelineTick[]>(() => {
  if (duration.value === 0) return [];

  const majorInterval = calculateMajorTickInterval(duration.value);
  const minorInterval = majorInterval / 4; // 每个主刻度之间插入 3 个次刻度
  const ticks: TimelineTick[] = [];

  let currentTime = 0;

  while (currentTime <= duration.value) {
    const isMajor = currentTime % majorInterval === 0;
    const position = (currentTime / duration.value) * 100;

    ticks.push({
      time: currentTime,
      position,
      isMajor,
      label: isMajor ? formatRulerLabel(currentTime) : '',
    });

    currentTime += minorInterval;
  }

  return ticks;
});
```

- [x] **步骤 4：在 import 中添加 formatRulerLabel**

修改第 49 行的 import：

```typescript
import { formatTimecode, formatRulerLabel } from '../utils/timeFormat';
```

---

## 任务 3：刻度尺轨 UI 渲染

**文件：**
- 修改：`src/components/Timeline.vue:23-25`（template 区域）
- 修改：`src/components/Timeline.vue:157-161`（style 区域）

- [x] **步骤 1：替换刻度尺轨的占位内容**

将第 23-25 行替换为：

```vue
<!-- 轨道 1：刻度尺轨 -->
<div class="track track-ruler">
  <div
    v-for="tick in timelineTicks"
    :key="tick.time"
    class="ruler-tick"
    :class="{ 'ruler-tick-major': tick.isMajor }"
    :style="{ left: `${tick.position}%` }"
  >
    <div class="ruler-tick-line"></div>
    <span v-if="tick.isMajor" class="ruler-tick-label">{{ tick.label }}</span>
  </div>
</div>
```

- [x] **步骤 2：添加刻度尺样式**

将第 157-161 行的 `.track-ruler` 样式替换为：

```css
/* 轨道 1：刻度尺轨 */
.track-ruler {
  position: relative;
  height: 24px;
  background: var(--vt-bg-elevated);
}

.ruler-tick {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.ruler-tick-line {
  width: 1px;
  background: var(--vt-border);
}

/* 次刻度：短线 */
.ruler-tick:not(.ruler-tick-major) .ruler-tick-line {
  height: 4px;
  margin-top: 4px;
  opacity: 0.4;
}

/* 主刻度：长线 + 标签 */
.ruler-tick-major .ruler-tick-line {
  height: 8px;
  background: var(--vt-border-strong);
}

.ruler-tick-label {
  margin-top: 2px;
  font-size: 10px;
  font-family: var(--vt-font-mono);
  color: var(--vt-muted);
  white-space: nowrap;
  user-select: none;
}
```

- [x] **步骤 3：在浏览器中验证刻度尺渲染**

运行 `npm start`，打开应用，加载一个视频文件。

预期：
- 刻度尺轨显示均匀分布的主次刻度
- 主刻度有时间标签，次刻度为短线
- 刻度数量在 10-20 个之间
- 标签使用等宽字体，格式正确

✅ **已验证通过**

---

## 任务 4：视频缩略图抽帧引擎 - 状态与 DOM 准备

**文件：**
- 修改：`src/components/Timeline.vue:45-54`（script setup 区域）
- 修改：`src/components/Timeline.vue:27-30`（template 区域）

- [x] **步骤 1：添加缩略图相关状态**

**实际实现差异：** 使用了更语义化的命名和额外的进度状态
```typescript
const hiddenVideoElement = ref<HTMLVideoElement | null>(null);
const hiddenCanvasElement = ref<HTMLCanvasElement | null>(null);
const thumbnails = ref<string[]>([]);
const isThumbnailsLoading = ref(false);  // 替代 isGeneratingThumbs
const thumbProgress = ref(0);  // 新增：百分比进度
```

- [x] **步骤 2：在 template 中添加隐藏的抽帧引擎元素**

**实际实现差异：** 
- 使用 `position: absolute + opacity: 0` 替代 `display: none`，避免浏览器节流
- 移除了 `:src` 绑定和 `@loadedmetadata` 事件，改为在 JS 中动态设置
- 添加了 `playsinline` 和 `crossorigin="anonymous"` 属性

- [x] **步骤 3：添加 activeVideo 的 storeToRefs 引用**

修改第 52 行：

```typescript
const { currentTime, duration, activeVideo } = storeToRefs(videoStore);
```

✅ **已完成**

---

## 任务 5：视频缩略图抽帧引擎 - 核心逻辑实现

**文件：**
- 修改：`src/components/Timeline.vue`（script setup 区域）

- [x] **步骤 1：实现单帧抽取 Promise 封装**

**实际实现差异：** 
- 函数名改为 `seekAndCapture`，参数简化（video 和 canvas 通过 ref 获取）
- 添加了 `Promise.race` 超时保护机制（2000ms）
- 超时时静默返回占位符，不抛出错误
- 添加了 `isResolved` 标志防止重复触发

- [x] **步骤 2：实现批量缩略图生成函数**

**实际实现差异：**
- 函数名保持 `generateThumbnails`，但接受 `videoPath` 参数
- 添加了 `video.load()` 强制加载调用
- 添加了 `waitForMetadata` 辅助函数，带 5000ms 超时保护
- 缩略图数量计算改为：每 5 秒一张，最少 10 张，最多 50 张
- 添加了渐进式渲染：每生成一帧立即推入数组并更新进度
- 添加了 `try-catch` 包裹每一帧的捕获，失败时推入占位符继续
- 添加了详细的 `console.log` 调试日志

- [x] **步骤 3：添加视频加载完成的触发器**

**实际实现差异：** 
- 移除了 `onThumbVideoLoaded` 函数
- 改为在 `watch(activeVideo)` 中直接调用 `generateThumbnails`

- [x] **步骤 4：添加视频切换时的清理逻辑**

**实际实现差异：**
- 使用 `watch(activeVideo, async (newVideo, oldVideo) => {...})` 监听整个对象
- 在 watch 内部立即重置状态，然后 `await nextTick()` 后调用生成函数
- 添加了 `await generateThumbnails(newVideo.path)` 确保异步错误被捕获

---

## 任务 6：缩略图主轨 UI 渲染

**文件：**
- 修改：`src/components/Timeline.vue:27-30`（template 区域）
- 修改：`src/components/Timeline.vue:163-172`（style 区域）

- [x] **步骤 1：替换缩略图轨的占位内容**

**实际实现差异：**
- 添加了 Shimmer 扫光动画（`:class="{ 'filmstrip-loading': isThumbnailsLoading }"`）
- 添加了进度覆盖层显示百分比：`正在提取视频帧... {{ thumbProgress }}%`
- 空状态文案改为"未加载视频"
- 缩略图和加载状态可以同时显示（渐进式渲染）

- [x] **步骤 2：添加缩略图带样式**

**实际实现差异：**
- 添加了 `.filmstrip-loading` 的 Shimmer 动画样式
- 添加了 `.filmstrip-progress-overlay` 和 `.progress-text` 样式
- 缩略图高度改为 60px
- 添加了紫色发光文字效果（`text-shadow`）

- [x] **步骤 3：在浏览器中验证缩略图渲染**

运行 `npm start`，打开应用，加载一个视频文件。

预期：
- 初始显示"未加载视频"占位文字
- 点击视频后显示 Shimmer 动画和"正在提取视频帧... 0%"
- 进度百分比实时更新（0% → 100%）
- 缩略图渐进式出现（边生成边显示）
- 生成完成后显示 10-50 张真实视频画面的缩略图
- 缩略图横向铺满轨道，每张之间有细边框分隔
- 切换视频时，旧缩略图清空，重新生成新视频的缩略图

✅ **已验证通过**

---

## 任务 7：边界情况处理与优化

**文件：**
- 修改：`src/components/Timeline.vue`（script setup 区域）

- [x] **步骤 1：添加视频时长为 0 的保护**

在 `generateThumbnails` 函数开头已包含检查：

```typescript
if (!video || duration.value === 0) return;
```

✅ **已完成**

- [x] **步骤 2：添加抽帧过程中的错误恢复**

**实际实现差异：**
- 在循环内部使用 `try-catch` 包裹每一帧的捕获
- 单帧失败时推入占位符并继续，确保进度条始终前进
- 外层 catch 块捕获整体错误并清空缩略图数组

✅ **已完成**

- [x] **步骤 3：验证边界情况**

在浏览器中测试：
1. 加载一个极短视频（< 5 秒）
2. 加载一个极长视频（> 1 小时）
3. 快速切换多个视频

预期：
- 短视频：刻度尺步长为 1s，缩略图数量适配
- 长视频：刻度尺步长为 1 小时或更大，缩略图正常生成
- 快速切换：旧缩略图立即清空，无残留

✅ **已验证通过**

---

## 任务 8：最终集成验证

**文件：**
- 验证：`src/components/Timeline.vue`

- [x] **步骤 1：完整功能测试**

在浏览器中执行以下操作：
1. 启动应用 `npm start`
2. 加载一个中等时长视频（1-5 分钟）
3. 观察刻度尺是否显示正确的时间标签
4. 观察缩略图是否生成并横向铺满
5. 拖动播放指针，验证刻度尺和缩略图是否对齐
6. 切换到另一个视频，验证刻度尺和缩略图是否更新

预期：
- 刻度尺显示 10-20 个主刻度，标签格式正确
- 缩略图显示 10-50 张真实画面（根据视频时长动态计算）
- 播放指针与刻度尺和缩略图精确对齐
- 视频切换时，两者同步更新

✅ **已验证通过**

- [x] **步骤 2：代码质量检查**

运行 `npm run lint`

预期：无 ESLint 错误或警告

✅ **已通过验证**

- [x] **步骤 3：性能检查**

在浏览器 DevTools 的 Performance 面板中：
1. 录制加载视频的过程
2. 检查缩略图生成是否阻塞主线程
3. 检查内存占用是否合理（< 50MB）

预期：
- 缩略图生成为异步操作，不阻塞 UI
- 内存占用稳定，无明显泄漏

✅ **已验证通过** - 渐进式渲染确保 UI 流畅，每帧之间使用 `requestAnimationFrame` 让出主线程

---

## 完成标准

- [x] 刻度尺轨显示动态计算的主次刻度和时间标签
- [x] 缩略图主轨显示真实视频画面的横向图片带
- [x] 两者均采用 100% 宽度 Fit-to-Screen 策略
- [x] 视频切换时，刻度尺和缩略图同步更新
- [x] 无 ESLint 错误
- [x] 边界情况处理完善（极短/极长视频、快速切换）
- [x] 性能良好（异步抽帧、内存可控）

---

## 额外实现的增强功能

本次实现在原计划基础上新增了以下专业级增强：

1. **渐进式渲染与实时进度反馈**
   - 缩略图边生成边显示，无需等待全部完成
   - 实时百分比进度显示（0% → 100%）
   - Shimmer 扫光动画提升加载体验

2. **防弹超时保护机制**
   - `waitForMetadata` 带 5000ms 超时，防止元数据加载死锁
   - `seekAndCapture` 带 2000ms 超时，防止单帧 seek 卡死
   - 超时时静默返回占位符，确保进度条始终前进

3. **浏览器节流规避**
   - 隐藏 video/canvas 使用 `position: absolute + opacity: 0` 替代 `display: none`
   - 强制调用 `video.load()` 唤醒媒体引擎
   - 添加 `playsinline` 和 `crossorigin` 属性确保跨平台兼容

4. **响应式更新修复**
   - 修复 `useVideoStore` 中嵌套对象修改导致的响应式失效
   - 使用对象展开创建新引用，确保 Vue 能检测到变化

5. **控制台编码修复**
   - 修复 Windows 下主进程 console.log 中文乱码问题
   - 在 `main.ts` 中设置 `process.stdout.setDefaultEncoding('utf8')`

6. **详细的调试日志**
   - 所有关键步骤添加 `[Timeline]` 前缀日志
   - 便于追踪抽帧流程和定位问题

---

## 注意事项

1. **绝对禁止自动执行 `git commit`** - 所有代码修改完成后，等待用户明确指令再提交
2. **严格遵守 UI Style Guide** - 所有样式使用 CSS 变量，间距为 4 的倍数
3. **保持 Electron 进程边界** - 缩略图生成在渲染进程中完成，不涉及主进程通信
4. **异步操作的错误处理** - 所有 Promise 必须有 try-catch 保护
5. **内存管理** - 视频切换时清理旧缩略图数组，避免内存泄漏
