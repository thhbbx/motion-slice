# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MotionSlice 是一个视频切片与晃动片段识别工具，支持按时间或文件大小切分视频，并自动识别视频中的晃动时间片段。

## 技术栈

- **Electron 42.1.0**: 桌面应用框架
- **Vue 3**: 前端 UI 框架（使用 Composition API）
- **TypeScript**: 类型安全
- **Vite**: 构建工具和开发服务器
- **Electron Forge**: 打包和分发工具

## 架构说明

项目遵循 Electron 标准三进程架构：

### 1. 主进程 (Main Process)
- **入口**: `src/main.ts`
- **配置**: `vite.main.config.ts`
- 负责创建窗口、应用生命周期管理
- 当前配置：800x600 窗口，开发模式下自动打开 DevTools

### 2. 渲染进程 (Renderer Process)
- **入口**: `src/renderer.ts`
- **配置**: `vite.renderer.config.ts`
- **UI 组件**: `src/App.vue`
- 使用 Vue 3 挂载到 `#app`，负责所有 UI 渲染
- **重要**: 默认禁用 Node.js 集成以保证安全性

### 3. 预加载脚本 (Preload Script)
- **入口**: `src/preload.ts`
- **配置**: `vite.preload.config.ts`
- 当前为空，未来需要在此处通过 `contextBridge` 暴露主进程 API 给渲染进程

### Electron Forge 配置
- **文件**: `forge.config.ts`
- **打包格式**: Squirrel (Windows)、ZIP (macOS)、RPM、DEB (Linux)
- **ASAR**: 已启用代码打包
- **Fuses 安全配置**: 
  - 禁用 Node.js 运行模式
  - 启用 Cookie 加密
  - 启用 ASAR 完整性验证
  - 仅从 ASAR 加载应用

## 常用命令

```bash
# 开发模式（启动 Vite 开发服务器 + Electron）
npm start

# 代码检查
npm run lint

# 打包应用（生成可分发的应用程序）
npm run package

# 构建安装包（生成平台特定的安装程序）
npm run make

# 发布应用
npm run publish
```

## 开发注意事项

### 主进程与渲染进程通信
- 渲染进程默认无法直接访问 Node.js API 和 Electron API
- 必须通过 `src/preload.ts` 使用 `contextBridge.exposeInMainWorld()` 暴露安全的 API
- 主进程通过 `ipcMain` 监听，渲染进程通过预加载脚本暴露的 API 调用

### 类型声明
- `src/vue.d.ts`: Vue 组件类型声明
- `forge.env.d.ts`: Electron Forge 环境变量类型声明（如 `MAIN_WINDOW_VITE_DEV_SERVER_URL`）

### 文件路径处理
- 使用 `path.join(__dirname, ...)` 处理文件路径
- 开发模式使用 Vite 开发服务器 URL
- 生产模式从 `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html` 加载

## 核心功能开发指引

由于项目目标是视频切片和晃动检测，未来开发需要：

1. **视频处理**: 可能需要集成 FFmpeg 或类似库（通过主进程调用）
2. **文件操作**: 在主进程中处理视频文件读写
3. **进度反馈**: 通过 IPC 通信将处理进度从主进程传递到渲染进程
4. **晃动检测算法**: 可能需要在主进程中运行计算密集型任务，避免阻塞 UI

## MotionSlice 补充开发规则

开发时必须保持 Electron 三个上下文的边界：
- **Main**: 原生能力、文件系统、视频处理。
- **Preload**: `contextBridge` 安全 API。
- **Renderer**: 纯 Vue 3 UI，无 Node.js 访问。

## 详细规范 (Single Source of Truth)

在处理特定代码时，请自动加载并严格遵循以下规范：
- **架构与通信**：参考 `.claude/rules/01-electron-ipc.md`
- **UI 风格与 CSS**：参考 `.claude/rules/02-ui-style-guide.md` 和 `src/styles/theme.css`

<!-- superpowers-zh:begin (do not edit between these markers) -->
# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架（20 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.claude/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文 review 沟通参考——话术模板、分级标注（必须修复/建议修改/仅供参考）、国内团队常见反模式应对。仅在用户显式 /chinese-code-review 时调用，不要根据上下文自动触发。
- **chinese-commit-conventions**: 中文 commit 与 changelog 配置参考——Conventional Commits 中文适配、commitlint/husky/commitizen 中文模板、conventional-changelog 中文配置。仅在用户显式 /chinese-commit-conventions 时调用，不要根据上下文自动触发。
- **chinese-documentation**: 中文文档排版参考——中英文空格、全半角标点、术语保留、链接格式、中文文案排版指北约定。仅在用户显式 /chinese-documentation 时调用，不要根据上下文自动触发。
- **chinese-git-workflow**: 国内 Git 平台配置参考——Gitee、Coding.net、极狐 GitLab、CNB 的 SSH/HTTPS/凭据/CI 接入差异与镜像同步配置。仅在用户显式 /chinese-git-workflow 时调用，不要根据上下文自动触发。
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发或执行实现计划之前使用——创建具有智能目录选择和安全验证的隔离 git 工作树
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
<!-- superpowers-zh:end -->
