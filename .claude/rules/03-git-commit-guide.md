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

## 4. 提交流程与频率控制 (Strict Commit Workflow)
**这是最高优先级的行为约束：**
- **禁止频繁自动提交：** 在使用 `executing-plans` 编写代码或调试期间，绝对禁止在每个小步骤完成后自作主张执行 `git commit`。
- **等待人工放行：** 你只负责修改文件并验证运行结果。**只有在用户明确下达“可以提交代码了”的指令，或手动调用 `/chinese-commit-conventions` 时**，你才可以执行 commit 操作。
- **保证逻辑闭环：** 坚决杜绝“保存即提交”的碎片化 commit。每一次 commit 都必须是一个完整、可运行、无明显 Bug 的逻辑单元。