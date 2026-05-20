---
description: 渲染进程状态管理与数据流转规范
globs: 
  - "src/**/*.vue"
  - "src/store/**/*.ts"
  - "src/renderer.ts"
---
# 状态管理规范 (Pinia)

MotionSlice 作为一个具有复杂交互的桌面应用，涉及视频元数据、切片列表、晃动时间戳和当前播放进度等多维状态。为了防止组件间数据流转混乱，必须遵循以下规则：

## 1. 核心状态收口
- 严禁在深层级 `.vue` 组件之间通过繁杂的 `props` 和 `emits` 传递核心业务数据。
- 必须使用 **Pinia** 作为全局状态管理方案（例如 `useVideoStore`, `useTaskStore`）。

## 2. 数据单向流转 (IPC -> Store -> View)
- 所有从主进程通过 IPC (Preload API) 拿到的核心数据（例如解析完成的切片列表），**必须第一时间存入对应的 Pinia Store**。
- Vue 组件只负责从 Store 读取数据（使用 `storeToRefs` 保持响应式）以及派发 Action，严禁组件直接缓存并篡改从 IPC 拿到的原始核心数据。

## 3. UI 状态隔离
- 纯 UI 级别的状态（如某个下拉菜单是否展开、Tab 切换状态）应留在组件内部使用 `ref` 或 `reactive` 管理，不要污染 Pinia Store。