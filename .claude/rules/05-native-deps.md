---
description: 主进程原生依赖与 FFmpeg (二进制文件) 打包规范
globs: 
  - "src/main.ts"
  - "src/main/**/*.ts"
  - "forge.config.ts"
  - "package.json"
---
# 原生依赖与二进制工具规范

MotionSlice 是一个视频处理工具，在主进程中必然会涉及到 FFmpeg 或其他底层二进制工具的调用。Electron 打包时（尤其是启用了 ASAR）极易发生路径丢失问题。

## 1. 二进制文件的引入与路径处理
- 如果引入了 `ffmpeg-static`、`ffprobe-static` 或自定义的二进制可执行文件，**必须动态处理路径**，以兼容开发环境和生产环境（ASAR 打包后）。
- 严禁直接使用写死的相对路径调用二进制文件。
- 参考路径解析逻辑：使用 `app.isPackaged` 判断，如果是生产环境，需确保路径指向 `app.getAppPath().replace('app.asar', 'app.asar.unpacked')` 或其他正确的释放目录。

## 2. Forge 配置要求 (asarUnpack)
- 当你（Claude）在项目中引入任何需要由 `child_process.spawn` 或 `exec` 调用的二进制依赖时，必须同步修改 `forge.config.ts`，将其配置到 `asarUnpack` 规则中。
- 示例：`asarUnpack: ['**/*.node', 'node_modules/ffmpeg-static/**/*']`

## 3. 性能与阻塞
- 调用 FFmpeg 进行切片或晃动分析时，必须使用**异步非阻塞**的 API。
- 必须通过 IPC 持续向渲染进程发送进度事件 (`progress`)，绝对不允许让渲染进程处于“假死”等待状态。