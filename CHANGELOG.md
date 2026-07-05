# MotionSlice 更新日志

## [0.0.6] - 2026-07-05

### 🐛 Bug 修复

#### 修复 Tab 切换导致配置信息丢失问题 (0c9e476)
**问题描述**：
- 用户在工作台配置切片参数后，切换到导出 Tab 再切回来，所有配置都被清空
- 导出设置（格式、质量、输出目录）也会在切换后丢失

**根本原因**：
- `Inspector.vue` 使用 `v-if` 条件渲染 Tab 内容，导致组件切换时被完全销毁和重建
- 所有内部 `ref`/`reactive` 状态都会重置为初始值

**解决方案**：
- ✨ 新建 `useToolConfigStore` - 集中管理工具配置和导出配置
- 🔧 重构 `ToolSlicer.vue` - 将本地状态提升到 Store，通过计算属性双向绑定
- 🔧 重构 `ExportTab.vue` - 从 Store 读取导出配置，优化默认路径加载逻辑

**技术改进**：
- 状态独立于组件生命周期，符合 Pinia 最佳实践
- 未来可扩展配置预设、历史记录等功能

#### 重构统一导出面板并修复 8 个问题 (ff7d8d4)
**重构内容**：
- 合并 `ExportTab.vue` 和 `BatchExportQueue.vue` 为统一组件
- 实现 `isBatchMode` 动态切换单选/多选模式 UI
- 删除废弃的 `BatchExportQueue.vue` 组件

**Bug 修复**：
1. 修复单选模式切片列表不展开问题
2. 修复导出进度不同步问题（App.vue taskId 匹配逻辑）
3. 修复部分失败时状态被错误覆写问题
4. 修复只读状态赋值警告（`isExporting` computed）
5. 修复批量导出循环中断问题（后端 Fail-Safe 模式）
6. 修复 TaskId 不匹配导致进度事件无法更新队列状态
7. 修复切片导出失败时 UI 仍显示"处理中"状态
8. 修复缺少失败事件通知的问题

**UI 优化**：
- 移除冗余的微观进度显示
- 修复失败状态文字颜色层级
- 优化错误日志展开打印

### 🎨 UI 优化

#### 统一下拉框样式 (0c9e476)
- 替换导出面板的原生 `<select>` 为 `ToolSelector` 组件
- 与工作台的"选择工具"下拉框保持一致的视觉风格
- 深色背景 + 毛玻璃效果 + 紫蓝色主题高亮 + 流畅弹性动画
- 删除废弃的 `.vt-select` 样式代码

### 📦 变更统计

**今日提交**: 6 个
**新增文件**: 2 个
- `src/store/useToolConfigStore.ts` (75 行)
- `docs/fixes/tab-switch-state-loss-fix.md` (125 行)

**修改文件**: 5 个
- `src/components/ExportTab.vue`
- `src/components/tools/ToolSlicer.vue`
- `src/App.vue`
- `src/main/handlers/export-handler.ts`
- `src/components/export/BatchExportQueue.vue` (已删除)

**代码变更**: +254 行 / -49 行

### 🔧 技术改进

1. **状态管理优化**
   - 引入 `useToolConfigStore` 统一管理配置
   - 符合 Pinia 最佳实践和项目架构设计

2. **IPC 通信完善**
   - 完善导出失败事件流：Main → Preload → Renderer
   - 统一 TaskId 生成逻辑，修复进度匹配问题

3. **队列粒度调整**
   - 从"每个切片一个队列项"改为"每个视频一个队列项"
   - 更符合实际业务逻辑

### 📝 文档

- 新增 `docs/fixes/tab-switch-state-loss-fix.md` - Tab 切换状态丢失问题修复文档
- 新增 `docs/superpowers/plans/2026-07-05-unified-export-panel-fix.md` - 统一导出面板重构文档

---

## [0.0.5] - 2026-07-04

（历史版本记录...）
