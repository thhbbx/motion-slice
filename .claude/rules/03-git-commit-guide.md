---
description: Git 提交规范与格式要求
globs: "*"
---
# Git Commit 规范

当你（Claude）需要执行 git commit 时，必须严格遵循以下 Angular 规范（Conventional Commits）：

## 1. 提交格式
`<type>(<scope>): <subject>`

## 2. 常用 Type 约束
- **feat**: 新功能 (例如：视频切片、晃动识别)
- **fix**: 修复 Bug
- **style**: UI/CSS 样式调整 (必须符合 02-ui-style-guide.md 的要求)
- **refactor**: 重构（例如：IPC 通信改造、代码结构优化）
- **chore**: 构建过程、依赖更新或辅助工具的变动
- **docs**: 文档更新（如更新 README 或 CLAUDE.md）

## 3. 详细要求
- **必须使用中文**描述 subject。
- 绝不允许写过于简短或无意义的 commit（如 "update", "fix bug", "test"）。
- 如果是针对特定功能模块的修改，必须带上 scope。
    - 🟢 正确示例：`feat(ipc): 添加视频晃动分析的 preload 接口`
    - ❌ 错误示例：`feat: update api`