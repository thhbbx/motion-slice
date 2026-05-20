---
paths:
   - "src/App.vue"
   - "src/renderer.ts"
   - "src/index.css"
   - "src/components/**/*.vue"
   - "src/components/**/*.ts"
   - "src/styles/**/*.css"
---

# MotionSlice UI Style Guide

MotionSlice 是一个 Electron 桌面视频处理工具，不是传统的 Web 后台页面。

## UI 目标
暗黑后台系统视觉基因 + 紫蓝主色 + Apple-like 精致感 + 专业视频剪辑工作台。
整体呈现为：专业、克制、工具感强、层级清晰。

## 空间韵律与网格 (Spatial Rhythm)
**这是保持界面高级感的核心约束：**
- 严格遵守 4px / 8px 软网格系统。
- 所有 `margin`, `padding`, `gap`, `height`, `width`, `border-radius` 必须是 4 的倍数（如 4, 8, 12, 16, 24, 32, 48）。
- 绝对禁止出现 `15px`, `21px` 这种不规则间距。
- 布局优先使用 Flexbox 和 Grid 的 `gap` 属性，减少使用 margin 推挤。
- 必须使用 `var(--vt-space-*)` 和 `var(--vt-radius-*)` 变量控制间距和圆角。

## 字体与排版 (Typography)
- 严禁通过夸张的大字号突出层级，**必须优先通过字重（weight）和颜色对比度（color）**区分主次。
- **数字和时间代码（Timecode）：** 必须使用等宽字体 `var(--vt-font-mono)`，确保时间轴播放时数字不会左右晃动。
- 字重规范：
   - 标题/强调数据：`font-weight: 600`
   - 按钮/交互文字：`font-weight: 500`
   - 常规正文：`font-weight: 400`
- 小尺寸全大写标签（TAG）需增加 `letter-spacing: 0.05em` 以提升精致感。

## 质感与层级 (Texture & Hierarchy)
- **微边框（Micro-Borders）：** 深色模式下不依赖外阴影区分层级。悬浮卡片、面板必须使用 `1px` 的半透明微边框 `var(--vt-border-strong)` 配合背景色。
- 避免纯色区块叠加，通过极微弱的背景色差和精准的细边框切分工作区。
- **克制动效：** hover 采用 160ms - 220ms ease 渐变。不要弹跳，不要复杂渐变。

## 推荐布局与页面约束
- 根节点使用 `.video-tool-page`，自定义样式必须限制在该类名下。
- 视频工具相关 class 统一使用 `vt-` 前缀。
- **左侧资源栏：** 240px - 280px（文件/任务/切片列表）。
- **中间工作区：** 视频预览（黑色舞台背景、自定义控制条）、桌面级专业时间轴。
- **右侧分析面板：** 320px - 360px（视频信息、晃动可视化结果、导出设置）。

## 时间轴与可视化 (Timeline)
- 深色轨道背景，切片块使用紫蓝弱背景 `var(--vt-primary-soft)`。
- 选中切片使用紫蓝描边和轻微 glow。
- 当前播放位置使用细竖线和顶部小三角。
- 晃动区间用黄色（警告）或红色（危险）半透明覆盖。
- 必须将晃动识别结果可视化（如状态 Tag、时间轴标记、最大晃动强度数据），不要大段文字堆砌。

## 状态与反馈 (States & Feedback)
- **空状态 (Empty State)：** 面板或时间轴为空时，必须提供克制的引导文字，图标使用细线风格并降低透明度。
- **加载状态 (Loading)：** 视频解析/晃动检测时，避免全屏遮罩，优先使用局部骨架屏组件（应用 `.vt-skeleton` 类名）或顶部极细进度条。
- **焦点状态 (Focus)：** 输入框激活时只改变边框和光晕，不允许发生尺寸抖动或位移。

## 严格禁止项 (Prohibitions)
- ❌ 禁止做成普通后台表格页 / 大面积表单页。
- ❌ 禁止大面积白底或大面积纯紫色。
- ❌ 禁止厚重阴影和复杂炫彩渐变。
- ❌ 禁止在组件里堆砌大量逻辑，保持分析与执行分离。
- ❌ 禁止破坏 Electron 进程边界。

## 颜色与变量约束 (Strict Variables)
**严禁在 `.vue` 组件的 `<style>` 或行内样式中写死 Hex 颜色值或硬编码的像素间距。**
所有颜色、边框、层级背景、间距、圆角必须 100% 使用 `src/styles/theme.css` 中的变量。
- 🟢 正确：`background: var(--vt-bg-elevated); padding: var(--vt-space-4); border-radius: var(--vt-radius-md);`
- ❌ 错误：`background: #111116; padding: 15px; border-radius: 10px;`