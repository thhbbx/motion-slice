---
paths:
  - "src/main.ts"
  - "src/preload.ts"
  - "src/renderer.ts"
  - "src/**/*.ts"
  - "src/**/*.vue"
  - "forge.config.ts"
  - "vite.*.config.ts"
---

# Electron IPC and Process Boundary Rules

本项目是 Electron 42 + Vue 3 + TypeScript + Vite 桌面应用。

开发时必须严格区分 main、preload、renderer 三个上下文。

## Main Process

主进程负责：

- BrowserWindow 生命周期
- 应用菜单、窗口控制、系统能力
- 文件选择、文件系统访问
- 视频处理任务
- 数据库连接
- 长任务调度
- IPC handler

## Preload

preload 只负责安全桥接：

- 使用 `contextBridge` 暴露最小 API
- 不写复杂业务逻辑
- 不直接承载视频处理逻辑
- 不暴露通用 Node.js 能力给 renderer

推荐暴露形式：

```ts
window.motionSlice.selectVideoFile()
window.motionSlice.analyzeVideoShake(params)
window.motionSlice.splitVideo(params)
window.motionSlice.cancelTask(taskId)
window.motionSlice.onTaskProgress(callback)
```

## 跨进程功能开发工作流 (Task Decomposition)

当被要求开发涉及主进程与渲染进程通信的新功能时，必须严格按以下步骤拆解任务，**并在执行前与我确认**：

1. **接口定义**：先设计并确认 `preload.ts` 中 `window.motionSlice` 暴露的 API 签名（入参、返回值类型）。
2. **主进程实现**：编写 Node.js 端的逻辑、IPC handler 以及完整的 `try-catch` 错误捕获。
3. **安全桥接**：在 `preload.ts` 中完成类型安全的桥接。
4. **渲染进程消费**：最后在 Vue 组件中调用，并必须处理加载中（Loading）和异常（Error）的 UI 状态。

严禁在一次输出中跨越所有端生成大量代码，务必保持小步快跑。