# 视频智能切分工具 UI 增强实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 迭代右侧工作台"视频智能切分"工具，增强目标时长单位切换、调整缓冲时长参数范围、修复输入框原生样式瑕疵。

**架构：** 前端在 ToolSlicer.vue 组件中增加单位切换 UI 和响应式转换逻辑，主进程在 slice-handler.ts 中放宽缓冲时长参数校验上限，全局 CSS 中隐藏 number 输入框的原生 spinners。

**技术栈：** Vue 3 Composition API, TypeScript, Electron IPC, CSS Variables

---

## 文件结构

**修改文件：**
- `src/components/tools/ToolSlicer.vue` - 增加单位切换 UI、调整默认值、实现单位自动转换逻辑
- `src/main/handlers/slice-handler.ts` - 放宽 overlapDuration 后端校验上限至 30 秒
- `src/styles/theme.css` - 全局隐藏 number 输入框的原生调整按钮

**涉及类型：**
- `src/types/slice.ts` - SliceAnalyzeParams（已存在，无需修改）

---

## 任务 1：目标时长单位切换 UI（前端组件）

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue:39-52`（目标时长输入区域）
- 修改：`src/components/tools/ToolSlicer.vue:135-138`（响应式数据定义）
- 修改：`src/components/tools/ToolSlicer.vue:232-423`（样式区域）

### 步骤 1：添加响应式数据（单位状态和转换逻辑）

在 `ToolSlicer.vue` 的 `<script setup>` 中，在 `targetValue` 定义之后添加：

- [x] **添加单位状态和监听器**

```typescript
// 实际实现（已优化避免初始化触发问题）
const mode = ref<'duration' | 'size'>('duration');
const targetUnit = ref<'minutes' | 'seconds'>('minutes'); // 新增：单位状态，默认分钟
const displayValue = ref<number>(20); // 新增：UI 展示值，默认 20 分钟
const targetValue = ref<number>(1200); // 修改默认值为 1200 秒（20 分钟）

// 新增：监听单位切换，自动转换数值
watch(targetUnit, (newUnit, oldUnit) => {
  if (oldUnit && newUnit !== oldUnit) {
    if (newUnit === 'seconds' && oldUnit === 'minutes') {
      // 分钟 → 秒：乘以 60
      displayValue.value = Math.round(displayValue.value * 60);
    } else if (newUnit === 'minutes' && oldUnit === 'seconds') {
      // 秒 → 分钟：除以 60，保留整数
      displayValue.value = Math.round(displayValue.value / 60);
    }
  }
});

// 新增：监听展示值变化，同步更新实际秒数值
watch(displayValue, (newVal) => {
  if (mode.value === 'duration') {
    targetValue.value = targetUnit.value === 'minutes' ? newVal * 60 : newVal;
  }
});

// 注意：需要在 import 中添加 watch
import { ref, computed, markRaw, watch } from 'vue';
```

- [x] **验证响应式逻辑**

在浏览器 DevTools Console 中测试：
```javascript
// 应该看到 displayValue 为 20，targetUnit 为 'minutes'，targetValue 为 1200
```

### 步骤 2：重构目标时长输入 UI

将现有的单行输入框改造为输入框 + 单位切换器的组合布局。

- [x] **替换表单行为输入框与单位切换器组合**

定位到 `<template>` 中的"数值输入"区域（约 38-52 行），完整替换为：

```vue
<!-- 实际实现：增加了 v-if 条件，仅在按时长模式显示单位切换器 -->
<!-- 目标时长输入：输入框 + 单位切换器 -->
<div class="form-row">
  <label class="form-label">
    <span class="label-text">{{ inputLabel }}</span>
  </label>
  <div class="input-with-unit">
    <input
      type="number"
      v-model.number="displayValue"
      :placeholder="inputPlaceholder"
      :min="targetUnit === 'minutes' ? 1 : 1"
      :step="targetUnit === 'minutes' ? 1 : 10"
      class="vt-input"
      :disabled="disabled"
    />
    <div v-if="mode === 'duration'" class="unit-toggle">
      <button
        type="button"
        class="unit-option"
        :class="{ active: targetUnit === 'minutes' }"
        @click="targetUnit = 'minutes'"
        :disabled="disabled"
      >
        分钟
      </button>
      <button
        type="button"
        class="unit-option"
        :class="{ active: targetUnit === 'seconds' }"
        @click="targetUnit = 'seconds'"
        :disabled="disabled"
      >
        秒
      </button>
    </div>
  </div>
</div>
```

- [x] **更新计算属性 inputLabel 和 inputPlaceholder**

定位到 `inputLabel` 和 `inputPlaceholder` 计算属性（约 150-156 行），修改为：

```typescript
const inputLabel = computed(() => {
  if (mode.value === 'size') return '目标大小 (MB)';
  return targetUnit.value === 'minutes' ? '目标时长' : '目标时长';
});

const inputPlaceholder = computed(() => {
  if (mode.value === 'size') return '50';
  return targetUnit.value === 'minutes' ? '20' : '1200';
});
```

- [x] **删除或更新旧的 handleModeChange 方法**

定位到 `handleModeChange` 方法（约 159-162 行），更新默认值逻辑：

```typescript
function handleModeChange(newMode: 'duration' | 'size') {
  mode.value = newMode;
  if (newMode === 'duration') {
    targetUnit.value = 'minutes';
    displayValue.value = 20;
    targetValue.value = 1200;
  } else {
    displayValue.value = 50;
    targetValue.value = 50;
  }
}
```

### 步骤 3：添加单位切换器样式

在 `<style scoped>` 中添加样式定义。

- [x] **添加 input-with-unit 容器和 unit-toggle 样式**

在 `.form-hint` 样式后添加：

```css
/* 输入框与单位切换器组合容器 */
.input-with-unit {
  display: flex;
  gap: var(--vt-space-2);
  align-items: center;
}

.input-with-unit .vt-input {
  flex: 1;
  min-width: 0;
}

/* 单位切换器（macOS 分段控制风格） */
.unit-toggle {
  display: flex;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-sm);
  padding: 2px;
  gap: 2px;
}

.unit-option {
  flex: 1;
  height: 32px;
  min-width: 56px;
  padding: 0 var(--vt-space-3);
  border: none;
  border-radius: calc(var(--vt-radius-sm) - 2px);
  background: transparent;
  color: var(--vt-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 180ms ease;
  white-space: nowrap;
}

.unit-option:hover:not(:disabled) {
  color: var(--vt-text-regular);
  background: rgba(255, 255, 255, 0.04);
}

.unit-option.active {
  background: var(--vt-primary);
  color: var(--vt-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.unit-option:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [x] **运行开发服务器验证样式**

```bash
npm start
```

预期：在右侧工具栏"视频智能切分"区域看到：
- 输入框默认显示 `20`
- 右侧单位切换器显示"分钟"高亮，"秒"未高亮
- 点击"秒"时，输入框自动变为 `1200`
- 样式符合 macOS 分段控制风格（深色背景、圆角、平滑过渡）

---

## 任务 2：缓冲时长范围调整（前端 + 后端）

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue:69-84`（缓冲时长滑块）
- 修改：`src/components/tools/ToolSlicer.vue:138`（默认值）
- 修改：`src/main/handlers/slice-handler.ts:201-203`（后端参数校验）

### 步骤 1：前端调整缓冲时长默认值和最大值

- [x] **修改 overlapDuration 默认值为 10 秒**

定位到 `overlapDuration` 定义（约 138 行），修改为：

```typescript
const overlapDuration = ref<number>(10.0); // 修改默认值：1.0 → 10.0
```

- [x] **修改滑块最大值为 30 秒**

定位到缓冲时长滑块（约 74-82 行），修改 `max` 属性：

```vue
<input
  type="range"
  v-model.number="overlapDuration"
  min="0.0"
  max="30.0"
  step="0.1"
  class="vt-slider"
  :disabled="disabled"
/>
```

- [x] **更新滑块下方的提示文字**

```vue
<div class="form-hint vt-muted">切片边界向外扩张 {{ overlapDuration.toFixed(1) }}s，形成交叠区域（最大 30s）</div>
```

- [x] **运行开发服务器验证前端修改**

```bash
npm start
```

预期：
- 缓冲时长滑块默认位置为 10 秒
- 拖动滑块可达到 30 秒
- 数值显示准确

### 步骤 2：后端放宽参数校验上限

- [x] **修改 slice-handler.ts 中的校验逻辑**

定位到 `analyzeVideoSlices` 函数的参数验证（约 201-203 行），修改为：

```typescript
if (overlapDuration < 0 || overlapDuration > 30) {
  throw new Error(`交叠缓冲时长必须在 0-30 秒之间，当前值: ${overlapDuration}`);
}
```

- [x] **运行完整应用验证端到端逻辑**

```bash
npm start
```

测试步骤：
1. 导入一个视频文件
2. 开启"交叠缓冲"开关
3. 拖动缓冲时长滑块至 25 秒
4. 点击"生成切片预览"
5. 观察控制台日志和时间轴切片结果

预期：
- 无参数校验错误
- 切片成功生成
- 控制台日志显示 `overlapDuration: 25`

---

## 任务 3：隐藏 number 输入框原生 spinners

**文件：**
- 修改：`src/styles/theme.css`（全局样式）

### 步骤 1：添加全局 CSS 规则

- [x] **在 theme.css 末尾添加 input[type="number"] 样式重置**

定位到 `theme.css` 文件末尾（约 219 行之后），添加：

```css
/* --- 输入框样式增强 --- */
/* 隐藏 number 类型输入框的原生上下调整按钮（Spinners） */
.video-tool-page input[type="number"]::-webkit-inner-spin-button,
.video-tool-page input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.video-tool-page input[type="number"] {
    -moz-appearance: textfield; /* Firefox 兼容 */
    appearance: textfield;
}
```

- [x] **验证样式生效**

```bash
npm start
```

测试步骤：
1. 打开应用，导航到"视频智能切分"工具
2. 观察"目标时长"输入框
3. 鼠标悬停和点击输入框

预期：
- 输入框右侧不再显示原生的上下箭头按钮
- 输入框视觉完美融入 `.vt-input` 体系
- 仍然可以通过键盘输入数字

---

## 任务 4：端到端集成测试

**文件：**
- 无需修改代码，纯测试验证

### 步骤 1：完整功能验证

- [ ] **测试单位切换与自动转换**

测试用例：
1. 打开应用，默认显示"目标时长"为 `20`，单位为"分钟"
2. 切换到"秒"，观察输入框自动变为 `1200`
3. 手动修改输入框为 `600`
4. 切换回"分钟"，观察输入框自动变为 `10`
5. 点击"生成切片预览"，验证后端收到的 `targetValue` 为秒数

预期：
- 数值转换逻辑准确
- 控制台日志显示 `targetValue: 600`（秒）

- [ ] **测试缓冲时长边界值**

测试用例：
1. 开启"交叠缓冲"开关
2. 拖动滑块至最大值（30 秒）
3. 点击"生成切片预览"
4. 观察切片是否正常生成

预期：
- 无参数校验错误
- 切片包含正确的 headBuffer 和 tailBuffer（最大 30 秒）

- [ ] **测试输入框样式跨浏览器兼容性**

测试环境：
- Electron 内置 Chromium（主要）
- 如有条件，测试 Firefox 渲染引擎

预期：
- 所有 number 输入框均无原生 spinners
- 样式一致

### 步骤 2：回归测试（确保未破坏现有功能）

- [ ] **测试"按大小"切分模式**

测试用例：
1. 切换切分模式为"按大小"
2. 输入目标大小 `100` MB
3. 点击"生成切片预览"

预期：
- 切分逻辑正常
- 不受单位切换逻辑影响

- [ ] **测试批量模式**

测试用例：
1. 选中多个视频文件
2. 设置目标时长为 `5` 分钟（自动转换为 `300` 秒）
3. 设置缓冲时长为 `15` 秒
4. 点击"应用规则并批量扫描"

预期：
- 批量分析正常完成
- 每个视频的切片参数正确

---

## 任务 5：代码提交（遵循 Git Commit 规范）

**文件：**
- 无需修改代码，纯 Git 操作

### 步骤 1：暂存和提交前端修改

- [ ] **提交 ToolSlicer.vue 修改**

```bash
git add src/components/tools/ToolSlicer.vue
git commit -m "$(cat <<'EOF'
feat(切片工具): 增加目标时长单位切换器

- 新增分钟/秒单位切换 UI（macOS 分段控制风格）
- 实现单位自动转换逻辑（响应式监听）
- 修改默认值为 20 分钟（1200 秒）
- 更新相关计算属性和占位符

**Why:** 用户习惯以分钟为单位输入大时长，但后端 API 需要秒数，增强 UX 和数据转换准确性
**How to apply:** 前端 UI 展示用户友好的单位，IPC 调用时统一转换为秒
EOF
)"
```

### 步骤 2：暂存和提交后端修改

- [ ] **提交 slice-handler.ts 修改**

```bash
git add src/main/handlers/slice-handler.ts
git commit -m "$(cat <<'EOF'
feat(切片参数): 放宽缓冲时长上限至 30 秒

- 修改 overlapDuration 参数校验范围：0-5s → 0-30s
- 更新错误提示信息

**Why:** 长视频剪辑场景需要更大的转场冗余时间，5 秒限制过于保守
**How to apply:** 主进程参数验证与前端 UI 范围保持一致，防止拦截合法请求
EOF
)"
```

### 步骤 3：暂存和提交样式修改

- [ ] **提交 theme.css 修改**

```bash
git add src/styles/theme.css
git commit -m "$(cat <<'EOF'
style(输入框): 隐藏 number 输入框原生 spinners

- 使用 ::-webkit-inner-spin-button 和 -moz-appearance 全局隐藏
- 确保 vt-input 体系视觉一致性

**Why:** 原生上下箭头按钮破坏了暗黑模式精致感，与设计规范冲突
**How to apply:** 全局 CSS 规则，影响所有 number 输入框，保持跨浏览器兼容
EOF
)"
```

### 步骤 4：验证提交历史

- [ ] **检查 commit 规范和完整性**

```bash
git log --oneline -3
```

预期输出：
```
<commit-hash> style(输入框): 隐藏 number 输入框原生 spinners
<commit-hash> feat(切片参数): 放宽缓冲时长上限至 30 秒
<commit-hash> feat(切片工具): 增加目标时长单位切换器
```

---

## 完成标准

✅ 所有任务步骤的复选框已勾选  
✅ 开发服务器运行无错误  
✅ 功能测试全部通过  
✅ 样式符合 UI Style Guide（4px 网格、CSS 变量、暗黑模式）  
✅ Git commits 遵循 Angular 规范（中文 subject，带 Why/How）  
✅ 代码已提交到本地仓库

---

## 执行交接

**"计划已完成并保存到 `docs/superpowers/plans/2026-06-24-slicer-ui-enhancements.md`。两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？"**
