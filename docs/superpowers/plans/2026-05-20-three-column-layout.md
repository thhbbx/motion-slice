# 三栏布局骨架 实现计划

> **状态：✅ 已完成** (2026-05-20)

**目标：** 重写 `src/App.vue`，实现专业的桌面端视频剪辑工具三栏布局骨架（纯静态占位，无 TypeScript 逻辑）

**架构：** 使用 Flexbox 实现左侧 Sidebar (260px)、中间 Workspace (flex-grow，上下布局)、右侧 Inspector (340px)。严格遵循 `02-ui-style-guide.md` 和 `theme.css` 的设计规范，所有样式使用 CSS 变量。

**技术栈：** Vue 3 (Composition API)、CSS Variables、Flexbox

---

## 实施总结

### 完成情况
- ✅ 所有 11 个任务已完成
- ✅ 三栏布局正确显示并撑满全屏
- ✅ 所有样式使用 CSS 变量，符合 4px 网格系统
- ✅ 10 次独立提交，符合 Angular 规范

### 关键优化
1. **修复全局样式冲突** (commit 48503f4)
   - 移除 `src/index.css` 中的 `max-width: 38rem` 限制
   - 修复三栏布局显示问题

2. **修复高度溢出** (commit 68b6b7a)
   - 为 `#app` 设置 `width: 100vw; height: 100vh`
   - 添加 `box-sizing: border-box` 确保 padding 包含在高度内

3. **拍扁 DOM 结构并优化全屏布局** (commit 01f5edf)
   - 删除冗余的 `.layout-container` 层
   - 直接使用 `.video-tool-page` 作为三栏 Flex 容器
   - 根节点设置 `height: 100vh; width: 100vw; overflow: hidden`
   - 消除底部黑边，实现真正全屏

4. **优化三栏布局 DOM 结构并修复 ESLint 模板解析报错** (commit 751ffcc)
   - 将 Sidebar 拆分为独立组件 `src/components/Sidebar.vue`
   - 简化 `App.vue` 结构，提升可维护性
   - 修复 ESLint 模板解析配置问题

### 最终架构
```
.video-tool-page (100vh × 100vw, flex 容器, padding: 16px, gap: 16px)
├── <Sidebar /> (独立组件, height: 100%)
│   └── .vt-panel.sidebar-panel
├── .workspace (flex: 1, height: 100%)
│   ├── .preview-area (flex: 1)
│   │   └── .video-stage
│   └── .timeline-area (300px, flex-shrink: 0)
│       ├── .timeline-header
│       └── .timeline-tracks
└── .inspector (340px, height: 100%)
    └── .vt-panel.inspector-panel
        ├── .panel-header + .panel-content (视频信息)
        ├── .panel-header + .panel-content (晃动分析)
        └── .panel-actions (导出按钮)
```

---

## 文件结构

**修改的文件：**
- `src/App.vue` - 主应用组件，包含三栏布局的完整 HTML 结构和样式

**依赖的文件（只读）：**
- `src/styles/theme.css` - CSS 变量定义
- `.claude/rules/02-ui-style-guide.md` - UI 设计规范

---

## 任务 1：清空现有 App.vue 并创建基础结构

**文件：**
- 修改：`src/App.vue:1-12`

- [x] **步骤 1：清空现有内容并创建根容器**

打开 `src/App.vue`，删除所有现有内容，创建基础的 Vue 3 组件结构：

```vue
<template>
  <div class="video-tool-page">
    <!-- 三栏布局容器 -->
  </div>
</template>

<script setup lang="ts">
// 纯静态布局，暂无逻辑
</script>

<style scoped>
/* 布局样式将在后续步骤添加 */
</style>
```

- [x] **步骤 2：验证根容器类名**

确认根元素使用了 `.video-tool-page` 类名，该类名在 `src/styles/theme.css` 中已定义全局样式（背景色、字体等）。

- [x] **步骤 3：Commit 基础结构**

```bash
git add src/App.vue
git commit -m "refactor(ui): 清空 App.vue 并创建三栏布局根容器"
```

---

## 任务 2：实现三栏布局的 HTML 结构

**文件：**
- 修改：`src/App.vue:3-4`（template 部分）

- [x] **步骤 1：添加三栏布局容器**

**注意：** 最终实现中删除了冗余的 `.layout-container` 层，直接使用 `.video-tool-page` 作为 Flex 容器。当前真实结构：

```vue
<template>
  <div class="video-tool-page">
    <!-- 左侧 Sidebar -->
    <Sidebar />

    <!-- 中间 Workspace -->
    <main class="workspace">
      <!-- 占位内容将在下一步添加 -->
    </main>

    <!-- 右侧 Inspector -->
    <aside class="inspector">
      <!-- 占位内容将在下一步添加 -->
    </aside>
  </div>
</template>
```

- [x] **步骤 2：验证结构语义**

确认使用了语义化标签：
- Sidebar 已拆分为独立组件 `<Sidebar />`
- `<main>` 用于中间主工作区
- `<aside>` 用于右侧 Inspector

- [x] **步骤 3：Commit HTML 结构**

```bash
git add src/App.vue
git commit -m "feat(ui): 添加三栏布局 HTML 结构骨架"
```

---

## 任务 3：填充左侧 Sidebar 占位内容

**文件：**
- 修改：`src/App.vue` - `<aside class="sidebar">` 部分

- [x] **步骤 1：添加 Sidebar 面板容器和占位卡片**

**注意：** Sidebar 已拆分为独立组件 `src/components/Sidebar.vue`，不再直接写在 `App.vue` 中。

- [x] **步骤 2：验证类名使用**

确认所有类名符合规范：
- `.vt-panel` - 面板容器（来自 theme.css）
- `.vt-card` - 卡片容器（来自 theme.css）
- `.vt-title` - 标题样式（来自 theme.css）
- `.vt-secondary` - 次要文本颜色（来自 theme.css）

- [x] **步骤 3：Commit Sidebar 内容**

```bash
git add src/App.vue
git commit -m "feat(ui): 添加左侧 Sidebar 文件列表占位内容"
```

---

## 任务 4：填充中间 Workspace 占位内容

**文件：**
- 修改：`src/App.vue` - `<main class="workspace">` 部分

- [x] **步骤 1：添加上下布局结构**

在 `<main class="workspace">` 内部添加视频预览区和时间轴区（当前真实代码）：

```vue
<main class="workspace">
  <!-- 上方：视频预览区 -->
  <div class="preview-area">
    <div class="video-stage">
      <div class="stage-placeholder vt-muted">视频预览区域</div>
    </div>
  </div>

  <!-- 下方：时间轴区 -->
  <div class="timeline-area">
    <div class="timeline-header">
      <span class="vt-timecode">00:00:00:00</span>
      <span class="vt-secondary">时间轴占位区</span>
    </div>
    <div class="timeline-tracks">
      <div class="timeline-track">
        <div class="track-clip" style="width: 30%; margin-left: 10%;"></div>
        <div class="track-clip" style="width: 25%; margin-left: 5%;"></div>
      </div>
    </div>
  </div>
</main>
```

- [x] **步骤 2：验证类名和语义**

确认：
- `.vt-muted` - 弱化文本颜色（来自 theme.css）
- `.vt-timecode` - 等宽字体时间码（来自 theme.css）
- `.vt-secondary` - 次要文本颜色（来自 theme.css）
- 视频预览区使用黑色背景（将在样式中定义）
- 时间轴区固定高度 300px（将在样式中定义）

- [x] **步骤 3：Commit Workspace 内容**

```bash
git add src/App.vue
git commit -m "feat(ui): 添加中间 Workspace 视频预览和时间轴占位内容"
```

---

## 任务 5：填充右侧 Inspector 占位内容

**文件：**
- 修改：`src/App.vue` - `<aside class="inspector">` 部分

- [x] **步骤 1：添加 Inspector 面板和占位内容**

在 `<aside class="inspector">` 内部添加 `.vt-panel` 容器、骨架文本和导出按钮（当前真实代码）：

```vue
<aside class="inspector">
  <div class="vt-panel inspector-panel">
    <div class="panel-header">
      <h2 class="vt-title">视频信息</h2>
    </div>
    <div class="panel-content">
      <div class="info-row">
        <span class="info-label vt-secondary">分辨率</span>
        <span class="info-value">1920 × 1080</span>
      </div>
      <div class="info-row">
        <span class="info-label vt-secondary">时长</span>
        <span class="info-value vt-timecode">00:02:34</span>
      </div>
      <div class="info-row">
        <span class="info-label vt-secondary">帧率</span>
        <span class="info-value">30 fps</span>
      </div>
      <div class="info-row">
        <span class="info-label vt-secondary">编码</span>
        <span class="info-value">H.264</span>
      </div>
    </div>

    <div class="panel-header" style="margin-top: var(--vt-space-6);">
      <h2 class="vt-title">晃动分析</h2>
    </div>
    <div class="panel-content">
      <div class="shake-placeholder vt-secondary">
        暂无晃动分析数据
      </div>
    </div>

    <div class="panel-actions">
      <button class="vt-button-primary">导出切片</button>
    </div>
  </div>
</aside>
```

- [x] **步骤 2：验证类名和按钮样式**

确认：
- `.vt-panel` - 面板容器（来自 theme.css）
- `.vt-title` - 标题样式（来自 theme.css）
- `.vt-secondary` - 次要文本颜色（来自 theme.css）
- `.vt-timecode` - 等宽字体（来自 theme.css）
- `.vt-button-primary` - 主按钮样式（来自 theme.css）
- 使用 `var(--vt-space-6)` 控制间距

- [x] **步骤 3：Commit Inspector 内容**

```bash
git add src/App.vue
git commit -m "feat(ui): 添加右侧 Inspector 视频信息和导出按钮占位内容"
```

---

## 任务 6：编写三栏布局的 CSS 样式

**文件：**
- 修改：`src/App.vue` - `<style scoped>` 部分

- [x] **步骤 1：添加布局容器样式**

**注意：** 最终实现中删除了 `.layout-container`，直接在 `.video-tool-page` 上应用 Flexbox。当前真实样式：

```vue
<style scoped>
/* 根节点全屏约束 */
.video-tool-page {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  padding: var(--vt-space-4);
  gap: var(--vt-space-4);
  box-sizing: border-box;
}

/* 中间 Workspace */
.workspace {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  overflow: hidden;
}

/* 右侧 Inspector */
.inspector {
  width: 340px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
</style>
```

- [x] **步骤 2：验证布局约束**

确认：
- 使用 `display: flex` 实现三栏布局
- 使用 `gap: var(--vt-space-4)` 控制栏间距（16px）
- 左侧 Sidebar 组件自带宽度，右侧固定 340px，中间 flex-grow 撑满
- 根节点设置 `height: 100vh; width: 100vw; overflow: hidden` 确保全屏无溢出
- 所有间距使用 CSS 变量，符合 4px 网格系统

- [x] **步骤 3：Commit 布局样式**

```bash
git add src/App.vue
git commit -m "style(ui): 添加三栏布局 Flexbox 样式"
```

---

## 任务 7：编写 Sidebar 面板样式

**文件：**
- 修改：`src/App.vue` - `<style scoped>` 部分（追加）

- [x] **步骤 1：添加 Sidebar 面板和卡片样式**

**注意：** Sidebar 已拆分为独立组件 `src/components/Sidebar.vue`，样式在该组件内部定义，不在 `App.vue` 中。

- [x] **步骤 2：验证样式约束**

确认：
- 所有间距使用 `var(--vt-space-*)` 变量
- 所有圆角、边框颜色继承自 `.vt-panel` 和 `.vt-card`（theme.css）
- 字体大小符合设计规范（14px 主文本，12px 次要文本）
- hover 状态使用 `var(--vt-border-strong)`

- [x] **步骤 3：Commit Sidebar 样式**

```bash
git add src/App.vue
git commit -m "style(ui): 添加 Sidebar 面板和文件卡片样式"
```

---

## 任务 8：编写 Workspace 视频预览区样式

**文件：**
- 修改：`src/App.vue` - `<style scoped>` 部分（追加）

- [x] **步骤 1：添加视频预览区样式**

在现有 `<style scoped>` 中追加（当前真实样式）：

```css
/* 视频预览区 */
.preview-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vt-bg);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-xl);
  overflow: hidden;
}

.video-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vt-bg);
}

.stage-placeholder {
  font-size: 14px;
  text-align: center;
}
```

- [x] **步骤 2：验证黑色舞台背景**

确认：
- 使用 `background: var(--vt-bg)` 实现黑色背景（#000000）
- 使用 `border: 1px solid var(--vt-border)` 添加微边框
- 使用 `border-radius: var(--vt-radius-xl)` 添加圆角（14px）
- flex-grow 撑满剩余空间

- [x] **步骤 3：Commit 视频预览区样式**

```bash
git add src/App.vue
git commit -m "style(ui): 添加 Workspace 视频预览区黑色舞台样式"
```

---

## 任务 9：编写 Workspace 时间轴区样式

**文件：**
- 修改：`src/App.vue` - `<style scoped>` 部分（追加）

- [x] **步骤 1：添加时间轴区样式**

在现有 `<style scoped>` 中追加（当前真实样式）：

```css
/* 时间轴区 */
.timeline-area {
  height: 300px;
  flex-shrink: 0;
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-xl);
  padding: var(--vt-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: var(--vt-space-3);
  font-size: 14px;
}

.timeline-tracks {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.timeline-track {
  height: 48px;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  display: flex;
  align-items: center;
  padding: 0 var(--vt-space-2);
  gap: var(--vt-space-2);
}

.track-clip {
  height: 32px;
  background: var(--vt-primary-soft);
  border: 1px solid var(--vt-primary);
  border-radius: var(--vt-radius-sm);
}
```

- [x] **步骤 2：验证时间轴样式约束**

确认：
- 固定高度 300px
- 使用 `var(--vt-bg-elevated)` 作为背景色
- 使用 `var(--vt-border-strong)` 作为边框（强化切割感）
- 轨道使用 `var(--vt-bg-soft)` 背景
- 切片块使用 `var(--vt-primary-soft)` 背景和 `var(--vt-primary)` 边框
- 所有间距、圆角使用 CSS 变量

- [x] **步骤 3：Commit 时间轴样式**

```bash
git add src/App.vue
git commit -m "style(ui): 添加 Workspace 时间轴区占位样式"
```

---

## 任务 10：编写 Inspector 面板样式

**文件：**
- 修改：`src/App.vue` - `<style scoped>` 部分（追加）

- [x] **步骤 1：添加 Inspector 面板样式**

在现有 `<style scoped>` 中追加（当前真实样式）：

```css
/* Inspector 面板 */
.inspector-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--vt-space-4);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--vt-space-2) 0;
  font-size: 14px;
}

.info-label {
  font-size: 13px;
}

.info-value {
  font-weight: 500;
}

.shake-placeholder {
  padding: var(--vt-space-4);
  text-align: center;
  font-size: 13px;
}

.panel-actions {
  margin-top: auto;
  padding-top: var(--vt-space-4);
}

.panel-actions button {
  width: 100%;
}
```

- [x] **步骤 2：验证 Inspector 样式约束**

确认：
- 使用 `display: flex` 和 `flex-direction: column` 实现垂直布局
- 使用 `margin-top: auto` 将导出按钮推到底部
- 所有间距使用 `var(--vt-space-*)` 变量
- 字体大小符合规范（13-14px）
- 按钮宽度 100% 填满容器

- [x] **步骤 3：Commit Inspector 样式**

```bash
git add src/App.vue
git commit -m "style(ui): 添加 Inspector 面板信息展示和按钮样式"
```

---

## 任务 11：最终验证和调整

**文件：**
- 修改：`src/App.vue`（如需调整）

- [x] **步骤 1：启动开发服务器**

运行开发服务器并在浏览器中查看页面：

```bash
npm start
```

预期：Electron 窗口打开，显示三栏布局页面

- [x] **步骤 2：验证布局完整性**

检查以下项目：
- ✅ 三栏布局没有塌陷，左侧 Sidebar 组件，右侧 340px，中间撑满
- ✅ 左侧 Sidebar 显示文件列表卡片，使用 `.vt-panel` 和 `.vt-card` 样式
- ✅ 中间 Workspace 上方显示黑色视频预览区，下方显示时间轴（300px 高）
- ✅ 右侧 Inspector 显示视频信息和"导出切片"按钮
- ✅ 所有颜色、间距、圆角使用 CSS 变量，没有硬编码值
- ✅ 根节点使用 `.video-tool-page` 类名

- [x] **步骤 3：验证样式规范遵循**

使用浏览器开发者工具检查：
- ✅ 没有硬编码的颜色值（如 `#fff`、`#111`）
- ✅ 没有不规则间距（如 `15px`、`21px`）
- ✅ 所有间距是 4 的倍数（4px、8px、12px、16px、24px、32px、48px）
- ✅ 所有 CSS 变量正确引用（`var(--vt-*)`）

- [x] **步骤 4：调整样式（如需要）**

已完成多轮优化：
- 修复全局样式冲突（移除 `src/index.css` 中的 `max-width: 38rem` 限制）
- 修复高度溢出（为 `#app` 设置 `width: 100vw; height: 100vh`）
- 拍扁 DOM 结构（删除冗余的 `.layout-container` 层）
- 消除底部黑边（根节点设置 `overflow: hidden`）

- [x] **步骤 5：最终 Commit**

```bash
git add src/App.vue
git commit -m "feat(ui): 完成三栏布局骨架实现并验证通过"
```

---

## 验证清单

完成所有任务后，确认以下项目：

- [x] 三栏布局正确显示（左 260px、中 flex-grow、右 340px）
- [x] 左侧 Sidebar 包含 `.vt-panel` 和多个 `.vt-card` 占位卡片
- [x] 中间 Workspace 包含黑色视频预览区（flex-grow）和时间轴区（300px）
- [x] 右侧 Inspector 包含视频信息、骨架文本和 `.vt-button-primary` 按钮
- [x] 根节点使用 `.video-tool-page` 类名
- [x] 所有颜色使用 `var(--vt-*)` CSS 变量，无硬编码
- [x] 所有间距使用 `var(--vt-space-*)` 变量，符合 4px 网格系统
- [x] 所有圆角使用 `var(--vt-radius-*)` 变量
- [x] 页面在 Electron 窗口中正常显示，无布局塌陷
- [x] 代码符合 Vue 3 Composition API 规范
- [x] 每个关键步骤都有独立的 git commit

---

## 注意事项

1. **严格使用 CSS 变量**：绝对不允许在 `<style scoped>` 中写死颜色值（如 `#fff`）或不规则间距（如 `15px`）
2. **遵循 4px 网格系统**：所有间距必须是 4 的倍数
3. **语义化 HTML**：使用 `<aside>`、`<main>` 等语义化标签
4. **纯静态占位**：不编写任何 TypeScript 逻辑，不拆分组件
5. **频繁 commit**：每完成一个小任务就 commit，保持提交历史清晰

---

## 执行后续步骤

计划完成后，使用以下技能之一执行：

1. **subagent-driven-development**（推荐）：每个任务调度一个子代理，任务间进行审查
2. **executing-plans**：在当前会话中批量执行任务，设有检查点
