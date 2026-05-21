# 左侧 Sidebar 多层级目录与视频文件导入功能 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现左侧 Sidebar 的多层级本地目录和视频文件导入功能，支持递归扫描、自底向上剪枝、Apple-like 树状渲染和可拖拽侧边栏宽度调整。

**架构：** 主进程通过 `dialog.showOpenDialog` 选择文件/文件夹，递归扫描并剪枝空目录，返回树状数据结构。Preload 暴露安全 API。渲染进程使用 Pinia Store 管理文件树状态，通过递归 Vue 组件渲染树状结构，支持展开/折叠和选中状态。侧边栏宽度通过拖拽调整柄动态调节。

**技术栈：** Electron 42 IPC、Node.js fs/path、Pinia、Vue 3 Composition API、递归组件、CSS Variables

---

## 文件结构

**新建文件：**
- `src/types/file-tree.ts` - 文件树数据结构类型定义
- `src/main/handlers/dialog-handler.ts` - 主进程文件选择和扫描逻辑
- `src/main/utils/video-scanner.ts` - 视频文件递归扫描和剪枝工具
- `src/store/file-tree.ts` - Pinia Store 管理文件树状态
- `src/components/Sidebar.vue` - 左侧 Sidebar 主容器组件
- `src/components/FileTreeItem.vue` - 递归文件树节点组件

**修改文件：**
- `src/main.ts` - 注册 IPC handlers
- `src/preload.ts` - 暴露文件选择 API
- `src/renderer.ts` - 注册 Pinia Store
- `src/App.vue` - 替换左侧占位内容为 Sidebar 组件

**依赖文件（只读）：**
- `src/styles/theme.css` - CSS 变量定义
- `.claude/rules/01-electron-ipc.md` - IPC 通信规范
- `.claude/rules/02-ui-style-guide.md` - UI 设计规范
- `.claude/rules/04-state-management.md` - 状态管理规范

---

## 任务 1：定义文件树数据结构类型

**文件：**
- 创建：`src/types/file-tree.ts`

- [x] **步骤 1：创建类型定义文件**

创建 `src/types/file-tree.ts`，定义文件树节点的 TypeScript 类型：

```typescript
/**
 * 文件树节点类型
 */
export type FileNodeType = 'file' | 'directory';

/**
 * 视频元数据（Mock 数据，未来集成 ffprobe 后替换）
 */
export interface VideoMetadata {
  duration: string; // 格式：HH:MM:SS 或 MM:SS
  resolution: string; // 格式：1920x1080
  size: string; // 格式：125.4 MB
}

/**
 * 文件树节点
 */
export interface FileNode {
  id: string; // 唯一标识符（使用路径作为 ID）
  name: string; // 文件/文件夹名称
  path: string; // 完整路径
  type: FileNodeType; // 节点类型
  children?: FileNode[]; // 子节点（仅目录有）
  metadata?: VideoMetadata; // 视频元数据（仅视频文件有）
}
```

- [x] **步骤 2：验证类型定义**

确认类型定义符合需求：
- `id` 使用路径作为唯一标识
- `children` 仅在 `type === 'directory'` 时存在
- `metadata` 仅在 `type === 'file'` 时存在
- 所有字段都有清晰的 JSDoc 注释

---

## 任务 2：实现视频文件扫描和剪枝工具

**文件：**
- 创建：`src/main/utils/video-scanner.ts`

- [x] **步骤 1：创建视频扫描工具文件**

已创建 `src/main/utils/video-scanner.ts`，实现递归扫描和剪枝逻辑。

- [x] **步骤 2：实现递归扫描函数**

已实现 `scanDirectoryRecursive` 函数，支持递归扫描目录并构建文件树。

**关键优化：Windows 权限错误处理**
- 在 `fs.readdirSync` 调用处增加了 try-catch 错误处理
- 遇到 EPERM 或 EACCES 错误时（如 Windows 特殊文件夹 My Music/My Pictures/My Videos），优雅跳过该目录并返回 null
- 其他错误继续抛出，确保真实问题不被掩盖

```typescript
if (stats.isDirectory()) {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dirPath);
  } catch (error: any) {
    // 遇到权限错误（如 Windows 特殊文件夹），跳过该目录
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`跳过无权限访问的目录: ${dirPath}`);
      return null; // 返回 null，让 pruneEmptyDirectories 自动移除
    }
    throw error; // 其他错误继续抛出
  }
  // ...
}
```

- [x] **步骤 3：实现自底向上剪枝函数**

已实现 `pruneEmptyDirectories` 函数，自底向上移除不包含任何视频文件的目录节点。

- [x] **步骤 4：验证扫描和剪枝逻辑**

确认实现符合需求：
- 仅保留视频文件（.mp4, .mov, .avi 等）
- 自底向上剪枝空目录
- 生成 Mock 元数据（duration, resolution, size）
- 错误处理完善（try-catch + Windows 权限错误特殊处理）

---

## 任务 3：实现主进程文件选择和 IPC Handler

**文件：**
- 创建：`src/main/handlers/dialog-handler.ts`
- 修改：`src/main.ts`

- [x] **步骤 1：创建 Dialog Handler 文件**

已创建 `src/main/handlers/dialog-handler.ts`，实现文件选择逻辑。

- [x] **步骤 2：在主进程中注册 Handler**

已修改 `src/main.ts`，在 `app.on('ready')` 中注册 IPC handlers，并将所有注释改为中文。

- [x] **步骤 3：验证主进程逻辑**

确认实现符合需求：
- IPC channel 名称为 `dialog:select-media`
- 支持 `openFile`, `openDirectory`, `multiSelections`
- 返回类型为 `FileNode[]`
- 完整的错误处理（try-catch）

---

## 任务 4：在 Preload 中暴露安全 API

**文件：**
- 修改：`src/preload.ts`
- 创建：`src/types/preload.d.ts`

- [x] **步骤 1：暴露文件选择 API**

已修改 `src/preload.ts`，使用 `contextBridge` 暴露安全的 API。

- [x] **步骤 2：创建类型声明文件**

已创建 `src/types/preload.d.ts`，为 `window.motionSlice` 添加类型声明。

- [x] **步骤 3：验证 Preload API**

确认实现符合需求：
- 使用 `contextBridge.exposeInMainWorld` 暴露 API
- API 命名为 `window.motionSlice.selectMediaFiles`
- 返回类型为 `Promise<FileNode[]>`
- 有完整的 JSDoc 注释和 TypeScript 类型声明

---

## 任务 5：创建 Pinia Store 管理文件树状态

**文件：**
- 创建：`src/store/file-tree.ts`
- 修改：`src/renderer.ts`

- [x] **步骤 1：安装 Pinia 依赖**

Pinia 已安装（项目已包含依赖）。

- [x] **步骤 2：创建 File Tree Store**

已创建 `src/store/file-tree.ts`，定义文件树状态管理。

- [x] **步骤 3：在渲染进程中注册 Pinia**

已修改 `src/renderer.ts`，注册 Pinia。

- [x] **步骤 4：验证 Store 实现**

确认实现符合需求：
- 使用 Composition API 风格（`defineStore` + `setup` 函数）
- 状态包含：`roots`, `selectedFileId`, `expandedDirIds`
- Actions 包含：`loadFileTree`, `selectFile`, `toggleDirectory`
- 数据流转符合 IPC -> Store -> View 规范

---

## 任务 6：创建递归文件树节点组件

**文件：**
- 创建：`src/components/FileTreeItem.vue`

- [x] **步骤 1：创建递归组件模板**

已创建 `src/components/FileTreeItem.vue`，实现递归渲染逻辑。

**UI 精修优化（2026-05-21）：**
- 引入极简 SVG 图标（Lucide 风格，stroke-width 1.5px）：
  - 文件夹：箭头 + 文件夹图标
  - 视频文件：摄像机图标（胶片 + 镜头）
- 修复元数据截断问题：`.tree-node-content` 使用 `display: flex; flex-direction: column; flex: 1; min-width: 0;`
- 优化选中状态：高亮线通过 `::before` 定位到最左侧边缘，上下留出 `var(--vt-space-1)` 间距

- [x] **步骤 2：实现组件逻辑**

已实现组件逻辑，包含选中状态、展开状态和点击处理。

- [x] **步骤 3：编写组件样式（第一部分）**

已完成样式编写。

- [x] **步骤 4：编写组件样式（第二部分）**

已完成样式编写。

- [x] **步骤 5：验证递归组件**

确认实现符合需求：
- 使用递归渲染子节点
- 缩进通过 `calc(var(--vt-space-4) * depth)` 控制
- 文件夹有箭头图标和文件夹图标，展开时箭头旋转 90 度
- 视频文件有摄像机图标
- 选中节点有 `var(--vt-primary-soft)` 背景和左侧高亮线（通过 `::before` 绝对定位到 left: 0）
- 视频元数据双行布局，使用 `.vt-secondary` 和 `.vt-timecode`
- 深层级防御：`.tree-node-content` 使用 `display: flex; flex-direction: column; flex: 1; min-width: 0;` 解决截断问题
- 绑定 `title` 属性显示完整名称

---

## 任务 7：创建 Sidebar 主容器组件

**文件：**
- 创建：`src/components/Sidebar.vue`

- [x] **步骤 1：创建 Sidebar 组件模板**

已创建 `src/components/Sidebar.vue`，实现主容器和拖拽调整柄。

**UI 精修优化（2026-05-21）：**
- 导入按钮添加极简 `+` 图标（十字，stroke-width 1.5px）
- 按钮内部使用 `display: flex; align-items: center; gap: var(--vt-space-2);` 布局

- [x] **步骤 2：实现组件逻辑**

已实现组件逻辑，包含导入按钮点击处理和拖拽调整宽度功能。

- [x] **步骤 3：编写组件样式（第一部分）**

已完成样式编写。

- [x] **步骤 4：编写组件样式（第二部分）**

已完成样式编写。

- [x] **步骤 5：验证 Sidebar 组件**

确认实现符合需求：
- 包含"导入"按钮（带 `+` 图标），点击调用 `loadFileTree`
- 空状态显示引导文字和图标
- 文件树使用 `FileTreeItem` 递归渲染
- 右边缘有拖拽调整柄，宽度范围 200px-600px
- 所有样式使用 CSS 变量，符合 4px 网格系统

---

## 任务 8：集成 Sidebar 组件到 App.vue

**文件：**
- 修改：`src/App.vue`

- [x] **步骤 1：导入 Sidebar 组件**

已修改 `src/App.vue` 的 `<script setup>` 部分，导入 Sidebar 组件。

- [x] **步骤 2：替换左侧占位内容**

已修改 `src/App.vue` 的 `<template>` 部分，将左侧占位内容替换为 Sidebar 组件。

- [x] **步骤 3：移除旧的 Sidebar 样式**

已修改 `src/App.vue` 的 `<style scoped>` 部分，移除旧的 `.sidebar` 和 `.sidebar-panel` 样式。

- [x] **步骤 4：验证集成**

确认实现符合需求：
- Sidebar 组件正确导入并使用
- 左侧区域不再有固定宽度（由 Sidebar 组件自己控制）
- 旧的占位样式已移除
- 中间和右侧区域保持不变

---

## 任务 9：最终验证和测试

**文件：**
- 验证：所有新建和修改的文件

- [x] **步骤 1：启动开发服务器**

已运行开发服务器，Electron 窗口正常打开，显示三栏布局页面。

- [x] **步骤 2：验证文件导入功能**

已测试文件导入流程：
- 文件选择对话框正常打开
- 仅显示包含视频文件的目录和视频文件
- 视频文件显示 Mock 元数据（时长、分辨率、大小）
- Windows 特殊文件夹（My Music/My Pictures/My Videos）被优雅跳过，不再报 EPERM 错误

- [x] **步骤 3：验证树状结构交互**

已测试树状结构的交互功能：
- 文件夹箭头旋转 90 度
- 选中文件有 `var(--vt-primary-soft)` 背景和 `2px` 高亮线（通过 `::before` 绝对定位到 left: 0）
- 缩进为 `16px * depth`
- 长文件名被截断，显示省略号
- 元数据不再过早截断（通过 `flex: 1; min-width: 0;` 解决）

- [x] **步骤 4：验证可拖拽侧边栏**

已测试侧边栏宽度调整：
- 拖拽调整柄在 hover 时显示 `var(--vt-border-strong)` 背景
- 拖拽时光标保持 `col-resize`
- 宽度不能小于 200px 或大于 600px

- [x] **步骤 5：验证样式规范遵循**

已使用浏览器开发者工具检查：
- ✅ 所有颜色使用 `var(--vt-*)` 变量，无硬编码
- ✅ 所有间距使用 `var(--vt-space-*)` 变量，符合 4px 网格
- ✅ 所有圆角使用 `var(--vt-radius-*)` 变量
- ✅ 视频元数据使用 `.vt-secondary` 和 `.vt-timecode` 类名
- ✅ 深层级文本防御：`.tree-node-content` 使用 `display: flex; flex-direction: column; flex: 1; min-width: 0;`

- [x] **步骤 6：验证 TypeScript 类型安全**

TypeScript 类型检查通过（无类型错误）。

- [x] **步骤 7：验证 ESLint 规范**

ESLint 检查通过（无错误或警告）。

**UI 精修记录（2026-05-21）：**
- 修复元数据截断 Bug：`.tree-node-content` 改为 `display: flex; flex-direction: column; flex: 1; min-width: 0;`
- 引入极简 SVG 图标（Lucide 风格，stroke-width 1.5px）：文件夹图标、视频图标、导入按钮 `+` 图标
- 优化选中状态：高亮线通过 `::before` 绝对定位到最左侧边缘（left: 0），上下留出 `var(--vt-space-1)` 间距
- 添加 CSP 配置到 `index.html`，消除 Electron 安全警告

---

## 验证清单

完成所有任务后，确认以下项目：

- [x] 文件树数据结构类型定义完整（`FileNode`, `VideoMetadata`）
- [x] 视频扫描工具正确实现递归扫描和自底向上剪枝
- [x] 主进程 IPC Handler 正确注册并返回文件树
- [x] Preload API 安全暴露 `window.motionSlice.selectMediaFiles`
- [x] Pinia Store 管理文件树状态，符合 IPC -> Store -> View 规范
- [x] FileTreeItem 组件正确实现递归渲染和交互
- [x] Sidebar 组件包含导入按钮、空状态和可拖拽调整柄
- [x] App.vue 正确集成 Sidebar 组件
- [x] 所有样式使用 CSS 变量，符合 4px 网格系统
- [x] 文件导入、展开/折叠、选中、拖拽调整功能正常
- [x] TypeScript 类型检查通过
- [x] ESLint 检查通过
- [x] Windows 权限错误处理（EPERM）优雅跳过特殊文件夹
- [x] UI 精修完成（SVG 图标、截断修复、选中状态优化）
- [x] CSP 配置添加到 index.html

---

## 注意事项

1. **严格使用 CSS 变量**：绝对不允许硬编码颜色值或不规则间距
2. **遵循 4px 网格系统**：所有间距必须是 4 的倍数
3. **IPC 通信规范**：主进程负责文件系统访问，Preload 仅暴露安全 API
4. **状态管理规范**：核心数据必须存入 Pinia Store，组件只读取和派发 Action
5. **深层级防御**：文本容器必须设置 `min-width: 0; overflow: hidden; text-overflow: ellipsis`
6. **错误处理**：所有异步操作必须有 try-catch 和用户友好的错误提示
7. **禁止自动提交**：开发期间绝对禁止自动执行 `git commit`，等待用户明确指令

---

## 执行后续步骤

计划完成后，使用以下技能之一执行：

1. **subagent-driven-development**（推荐）：每个任务调度一个子代理，任务间进行审查
2. **executing-plans**：在当前会话中批量执行任务，设有检查点

