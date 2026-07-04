# 文件树复选框增强实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 增强左侧文件列表的复选框体验，支持目录级联选择、三态样式（全选/半选/未选）和精致动效

**架构：** FileTreeItem.vue 负责复选框 UI 和三态计算，useVideoStore.ts 负责目录级联选择的状态管理，复用现有的 toggleVideoSelection 方法保持一致性

**技术栈：** Vue 3 Composition API, TypeScript, Pinia

---

## 文件结构

**修改文件：**
- `src/components/FileTreeItem.vue` - 复选框 UI 改造、三态计算、事件处理
- `src/store/useVideoStore.ts` - 新增 toggleDirectorySelection 和 collectVideosInDirectory 方法

**测试方式：**
- 手动测试：在开发模式下运行应用，导入包含嵌套目录的视频文件，验证复选框行为

---

## 任务 1：Store 层 - 新增目录级联选择方法

**文件：**
- 修改：`src/store/useVideoStore.ts:313`（在 return 语句之前添加新方法）

**重要修复：** 
此任务包含对批量取消逻辑的关键修复，避免在目录级联取消时触发 `toggleVideoSelection` 的降维逻辑导致部分视频未被取消。

- [ ] **步骤 1：添加 collectVideosInDirectory 辅助函数**

在 `reset()` 方法之后，`return` 语句之前添加：

```typescript
/**
 * 递归收集目录下所有视频文件
 */
function collectVideosInDirectory(node: FileNode): FileNode[] {
  const videos: FileNode[] = [];
  
  if (node.type === 'file') {
    videos.push(node);
  } else if (node.children) {
    for (const child of node.children) {
      videos.push(...collectVideosInDirectory(child));
    }
  }
  
  return videos;
}
```

- [ ] **步骤 2：添加 toggleDirectorySelection 方法**

在 `collectVideosInDirectory` 函数之后添加：

```typescript
/**
 * 切换目录的选中状态（级联选择所有子视频）
 */
async function toggleDirectorySelection(directoryNode: FileNode) {
  const allVideos = collectVideosInDirectory(directoryNode);
  
  if (allVideos.length === 0) {
    console.log('[VideoStore] 目录下没有视频文件，忽略级联选择操作');
    return;
  }
  
  console.log(`[VideoStore] 目录 "${directoryNode.name}" 下收集到 ${allVideos.length} 个视频`);
  
  // 计算当前状态
  const selectedCount = allVideos.filter(video =>
    selectedVideos.value.some(sv => sv.id === video.id)
  ).length;
  
  const isFullySelected = selectedCount === allVideos.length;
  
  console.log(`[VideoStore] 已选中 ${selectedCount}/${allVideos.length} 个视频，全选状态: ${isFullySelected}`);
  
  if (isFullySelected) {
    // 全选 → 取消：批量移除，避免触发降维逻辑
    console.log(`[VideoStore] 开始取消目录选择: ${directoryNode.name}`);
    
    // 收集需要移除的视频 ID
    const idsToRemove = new Set(allVideos.map(v => v.id));
    
    // 批量过滤，避免逐个调用 toggleVideoSelection 触发降维
    const remainingVideos = selectedVideos.value.filter(v => !idsToRemove.has(v.id));
    const removedCount = selectedVideos.value.length - remainingVideos.length;
    
    console.log(`[VideoStore] 即将移除 ${removedCount} 个视频，保留 ${remainingVideos.length} 个视频`);
    
    // 根据剩余数量决定清理策略
    if (remainingVideos.length === 0) {
      // 全部清空：清理所有模式的数据
      console.log(`[VideoStore] 清空所有选择，触发完整清理`);
      selectedVideos.value = [];
      currentTime.value = 0;
      duration.value = 0;
      
      // 清理批量模式数据
      await cleanupBatchModeData();
    } else if (remainingVideos.length === 1) {
      // 降维到单选：清理批量数据，保留单选状态
      console.log(`[VideoStore] 降维到单选: ${remainingVideos[0].name}`);
      await cleanupBatchModeData();
      selectedVideos.value = remainingVideos;
      
      // 初始化单选状态
      currentTime.value = 0;
      if (remainingVideos[0].metadata?.duration) {
        setDuration(parseTimecode(remainingVideos[0].metadata.duration));
      }
    } else {
      // 仍然是批量模式：只移除目标视频，清理对应的批量数据
      console.log(`[VideoStore] 批量模式，移除 ${removedCount} 个视频`);
      
      // 清理被移除视频的批量切片数据
      const removedIds = new Set(allVideos.map(v => v.id));
      batchSliceGroups.value = batchSliceGroups.value.filter(
        group => !removedIds.has(group.videoId)
      );
      
      selectedVideos.value = remainingVideos;
    }
    
    console.log(`[VideoStore] 取消目录选择完成，最终剩余 ${selectedVideos.value.length} 个视频`);
  } else {
    // 未选/半选 → 全选：逐个添加（顺序执行，避免竞态）
    console.log(`[VideoStore] 全选目录: ${directoryNode.name}, 共 ${allVideos.length} 个视频`);
    for (const video of allVideos) {
      if (!selectedVideos.value.some(sv => sv.id === video.id)) {
        await toggleVideoSelection(video);
      }
    }
  }
}
```

**关键修复说明：**
- **Bug 根源：** 原逻辑使用 `forEach` 循环逐个调用 `toggleVideoSelection`，当取消到剩余 2 个视频时，会触发"批量降维到单选"逻辑，导致循环继续时状态不一致，最后一个视频无法被取消
- **修复方案：** 使用批量过滤 (`filter`) 一次性移除所有目标视频，避免触发 `toggleVideoSelection` 的降维逻辑
- **状态管理：** 根据剩余视频数量（0 / 1 / >1）决定清理策略，确保状态一致性

- [ ] **步骤 3：导出新方法**

在 return 语句中添加新方法的导出（在 `reset,` 之后）：

```typescript
return {
  selectedVideos: readonly(selectedVideos),
  focusedVideo: readonly(focusedVideo),
  batchSliceGroups: readonly(batchSliceGroups),
  activeVideo,
  isBatchMode,
  exportTaskQueue,
  isFetchingMetadata,
  currentTime,
  duration,
  setActiveVideo,
  setSelectedVideos,
  setFocusedVideo,
  setBatchSliceGroups,
  toggleSliceActive,
  toggleVideoSelection,
  clearActiveVideo,
  setCurrentTime,
  setDuration,
  reset,
  toggleDirectorySelection, // 新增
};
```

- [ ] **步骤 4：验证 Store 方法**

打开浏览器开发者工具，在 Console 中测试：

```javascript
// 假设已导入视频，获取第一个目录节点
const store = useVideoStore();
const firstDir = /* 从文件树中获取一个目录节点 */;
store.toggleDirectorySelection(firstDir);
// 检查 Console 日志是否输出 "[VideoStore] 全选目录: ..."
// 检查 store.selectedVideos 是否包含该目录下的所有视频
```

预期：Console 输出日志，selectedVideos 正确更新

---

## 任务 2：UI 层 - 添加目录复选框和三态计算

**文件：**
- 修改：`src/components/FileTreeItem.vue:15-22`（复选框 UI）
- 修改：`src/components/FileTreeItem.vue:112-160`（脚本逻辑）

### 步骤 1：添加辅助函数和计算属性

- [ ] **步骤 1.1：导入类型定义**

在 `<script setup>` 顶部，import 语句之后添加类型定义：

```typescript
type CheckboxState = 'unchecked' | 'indeterminate' | 'checked';
```

- [ ] **步骤 1.2：添加 collectVideosInDirectory 辅助函数**

在 `isExpanded` 计算属性之后，`handleNodeClick` 函数之前添加：

```typescript
function collectVideosInDirectory(node: FileNode): FileNode[] {
  const videos: FileNode[] = [];
  
  if (node.type === 'file') {
    videos.push(node);
  } else if (node.children) {
    for (const child of node.children) {
      videos.push(...collectVideosInDirectory(child));
    }
  }
  
  return videos;
}
```

- [ ] **步骤 1.3：添加 calculateCheckboxState 辅助函数**

在 `collectVideosInDirectory` 函数之后添加：

```typescript
function calculateCheckboxState(directoryNode: FileNode): CheckboxState {
  const allVideos = collectVideosInDirectory(directoryNode);
  
  if (allVideos.length === 0) return 'unchecked';
  
  const selectedCount = allVideos.filter(video =>
    videoStore.selectedVideos.some(sv => sv.id === video.id)
  ).length;
  
  if (selectedCount === 0) return 'unchecked';
  if (selectedCount === allVideos.length) return 'checked';
  return 'indeterminate';
}
```

- [ ] **步骤 1.4：添加 checkboxState 计算属性**

在 `calculateCheckboxState` 函数之后添加：

```typescript
const checkboxState = computed<CheckboxState>(() => {
  if (props.node.type === 'file') {
    return isSelected.value ? 'checked' : 'unchecked';
  }
  
  // 目录节点：计算三态
  return calculateCheckboxState(props.node);
});
```

### 步骤 2：改造复选框 UI

- [ ] **步骤 2.1：替换原生复选框为自定义组件**

定位到模板中的复选框部分（约 15-22 行），替换为：

```vue
<!-- 自定义复选框（目录 + 文件） -->
<div 
  class="tree-checkbox"
  :class="{
    'checkbox-checked': checkboxState === 'checked',
    'checkbox-indeterminate': checkboxState === 'indeterminate',
    'checkbox-unchecked': checkboxState === 'unchecked'
  }"
  @click.stop="handleCheckboxClick"
  :title="props.node.type === 'directory' ? '点击选择该目录下所有视频' : ''"
>
  <!-- 全选：勾选图标 -->
  <svg 
    v-if="checkboxState === 'checked'" 
    class="checkbox-icon"
    width="12"
    height="12"
    viewBox="0 0 16 16"
  >
    <path 
      d="M3 8L7 12L13 4" 
      stroke="currentColor" 
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
  
  <!-- 半选：横线符号 -->
  <svg
    v-else-if="checkboxState === 'indeterminate'"
    class="checkbox-icon"
    width="12"
    height="12"
    viewBox="0 0 16 16"
  >
    <path
      d="M4 8H12"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
</div>
```

注意：移除 `v-if="node.type === 'file'"` 条件，让目录也显示复选框。

### 步骤 3：更新事件处理逻辑

- [ ] **步骤 3.1：修改 handleCheckboxClick 方法**

定位到 `handleCheckboxClick` 方法（约 157-160 行），替换为：

```typescript
function handleCheckboxClick() {
  if (props.node.type === 'file') {
    // 文件：复用现有逻辑
    videoStore.toggleVideoSelection(props.node);
  } else {
    // 目录：调用新方法
    videoStore.toggleDirectorySelection(props.node);
  }
}
```

---

## 任务 3：样式优化 - 复选框尺寸和三态样式

**文件：**
- 修改：`src/components/FileTreeItem.vue:214-220`（复选框样式）

- [ ] **步骤 1：替换原有复选框样式**

定位到 `.tree-checkbox` 样式（约 214-220 行），完整替换为：

```css
.tree-checkbox {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 1.5px solid var(--vt-border-strong);
  border-radius: 4px;
  cursor: pointer;
  transition: all 160ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tree-checkbox:hover {
  border-color: var(--vt-primary);
  background: rgba(139, 92, 246, 0.08);
}

/* 未选状态 */
.checkbox-unchecked {
  background: transparent;
}

/* 半选状态 */
.checkbox-indeterminate {
  background: rgba(139, 92, 246, 0.6);
  border-color: var(--vt-primary);
}

/* 全选状态 */
.checkbox-checked {
  background: var(--vt-primary);
  border-color: var(--vt-primary);
}

/* 勾选动画 */
.checkbox-icon {
  color: #ffffff;
  animation: checkboxPop 180ms ease-out;
}

@keyframes checkboxPop {
  0% {
    opacity: 0;
    transform: scale(0.85);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **步骤 2：移除原有的 accent-color 样式**

删除旧的复选框样式：

```css
/* 删除这段（如果存在）：
.tree-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--vt-primary);
}
*/
```

---

## 任务 4：手动测试与验证

**测试环境：**
- 运行：`npm start`
- 浏览器：Electron 开发模式

### 测试用例

- [ ] **测试 1：复选框尺寸**

**操作：** 打开应用，观察文件树中的复选框  
**预期：** 复选框明显比之前大（20px vs 16px），更容易点击

- [ ] **测试 2：目录显示复选框**

**操作：** 观察目录节点  
**预期：** 目录节点左侧显示复选框（之前只有文件有）

- [ ] **测试 3：目录三态 - 未选**

**操作：** 导入包含目录的视频，不选择任何视频  
**预期：** 目录复选框显示空框（未选状态）

- [ ] **测试 4：目录三态 - 全选**

**操作：** 手动勾选目录下的所有视频  
**预期：** 目录复选框显示紫色实心 + 勾选符号（全选状态）

- [ ] **测试 5：目录三态 - 半选**

**操作：** 手动勾选目录下的部分视频（不是全部）  
**预期：** 目录复选框显示紫色半透明 + 横线符号（半选状态）

- [ ] **测试 6：点击目录复选框 - 未选 → 全选**

**操作：** 点击未选状态的目录复选框  
**预期：**
- 该目录下所有视频被选中
- 目录复选框变为全选状态
- Console 输出 `[VideoStore] 全选目录: ...`

- [ ] **测试 7：点击目录复选框 - 半选 → 全选**

**操作：** 手动选中目录下部分视频，然后点击目录复选框  
**预期：**
- 该目录下所有视频被选中（包括之前未选的）
- 目录复选框变为全选状态

- [ ] **测试 8：点击目录复选框 - 全选 → 取消**

**操作：** 点击全选状态的目录复选框  
**预期：**
- 该目录下所有视频被取消选中
- 目录复选框变为未选状态
- Console 输出 `[VideoStore] 取消目录选择: ...`

- [ ] **测试 9：级联选择 - 叠加逻辑**

**操作：**
1. 手动勾选视频 A
2. 点击目录 B 的复选框（该目录包含视频 X、Y、Z）

**预期：**
- 视频 A 仍然被选中（不被清空）
- 视频 X、Y、Z 也被选中
- 共 4 个视频被选中（多选模式）

- [ ] **测试 10：嵌套目录 - 递归选择**

**操作：** 点击父目录的复选框（该目录包含子目录，子目录包含视频）  
**预期：**
- 所有子目录下的视频都被选中（递归收集）
- 父目录和子目录的复选框都显示全选状态

- [ ] **测试 11：嵌套目录 - 父目录半选**

**操作：** 手动勾选子目录下的部分视频  
**预期：**
- 子目录复选框显示半选
- 父目录复选框也显示半选（递归计算）

- [ ] **测试 12：点击视频行 - 单选模式**

**操作：**
1. 通过复选框多选视频 A、B、C
2. 点击视频 D 的行（不是复选框）

**预期：**
- 视频 A、B、C 被清空
- 只有视频 D 被选中（单选模式）

- [ ] **测试 13：勾选动画**

**操作：** 点击未选状态的目录复选框  
**预期：**
- 勾选图标有缩放和淡入动画（0.85 → 1.0，180ms）
- 动画流畅自然

- [ ] **测试 14：悬停效果**

**操作：** 鼠标悬停在复选框上  
**预期：**
- 边框颜色变为紫色（`var(--vt-primary)`）
- 背景淡入半透明紫色（`rgba(139, 92, 246, 0.08)`）
- 过渡时长 160ms，流畅

- [ ] **测试 15：空目录边界情况**

**操作：** 点击空目录的复选框（目录下没有视频文件）  
**预期：**
- Console 输出 `[VideoStore] 目录下没有视频文件，忽略操作`
- 没有选中任何视频
- 复选框保持未选状态

- [ ] **测试 16：点击目录行 - 不触发选择**

**操作：** 点击目录行（不点复选框）  
**预期：**
- 目录展开/收起
- 不触发选择逻辑（selectedVideos 不变）

---

### 关键 Bug 修复测试场景

以下测试场景专门验证批量取消时的降维逻辑 Bug 修复：

- [ ] **测试 17：Bug 修复 - 单选后全选再取消全选**

**背景：** 修复了在目录级联取消时触发 `toggleVideoSelection` 降维逻辑导致部分视频未被取消的 Bug

**操作：**
1. 先单选任意一个视频（如 `项目1\ZJ_0407_B0387\ZJ_0407_B0387.mov`）
2. 点击根目录 `项目1` 的复选框全选（假设有 97 个视频）
3. 再次点击根目录 `项目1` 的复选框取消全选

**预期：**
- 所有 97 个视频都被取消选中
- `selectedVideos` 为空数组（长度为 0）
- Console 输出 `[VideoStore] 取消目录选择完成，最终剩余 0 个视频`
- 界面上所有复选框都显示未选状态

**失败标志：**
- 如果有任何视频仍然保持选中状态，说明 Bug 未修复
- 特别关注同名文件在不同目录下的情况

- [ ] **测试 18：Bug 修复 - 大量视频的批量取消**

**操作：**
1. 导入包含大量视频的目录（50+ 个视频）
2. 点击目录复选框全选
3. 立即点击目录复选框取消全选

**预期：**
- 所有视频一次性被取消，无遗漏
- Console 日志显示：
  - `[VideoStore] 即将移除 N 个视频，保留 0 个视频`
  - `[VideoStore] 清空所有选择，触发完整清理`
- 性能流畅，无明显卡顿

- [ ] **测试 19：Bug 修复 - 跨目录选择后取消单个目录**

**操作：**
1. 手动勾选目录 A 下的 2 个视频
2. 点击目录 B 的复选框（包含 5 个视频）
3. 点击目录 B 的复选框取消选择

**预期：**
- 目录 B 的 5 个视频被取消
- 目录 A 的 2 个视频仍然保持选中
- `selectedVideos` 长度为 2
- Console 输出 `[VideoStore] 批量模式，移除 5 个视频`

- [ ] **测试 20：Bug 修复 - 取消后降维到单选**

**操作：**
1. 手动勾选视频 A、B
2. 点击目录 C 的复选框（包含 5 个视频）
3. 点击目录 C 的复选框取消选择

**预期：**
- 目录 C 的 5 个视频被取消
- 视频 A、B 仍然保持选中（多选模式）
- `selectedVideos` 长度为 2
- 如果再手动取消视频 B，应降维到单选模式（只剩视频 A）

- [ ] **测试 21：Bug 修复 - 同名文件在不同目录**

**操作：**
1. 确保有同名文件在不同目录（如 `dir1/video.mov` 和 `dir2/video.mov`）
2. 点击根目录复选框全选
3. 点击根目录复选框取消全选

**预期：**
- 所有同名文件都被正确取消，无遗漏
- 验证方式：检查 `selectedVideos` 长度为 0，且界面上所有复选框都是未选状态

---

## 任务 5：优化与边界处理

**文件：**
- 修改：`src/store/useVideoStore.ts`（优化日志和性能）

- [ ] **步骤 1：添加性能优化注释**

在 `toggleDirectorySelection` 方法顶部添加注释：

```typescript
/**
 * 切换目录的选中状态（级联选择所有子视频）
 * 
 * 性能注意：
 * - collectVideosInDirectory 会递归遍历整个目录树
 * - 对于大型目录（数百个视频），可能影响性能
 * - 使用 computed 缓存三态计算结果可缓解此问题
 */
function toggleDirectorySelection(directoryNode: FileNode) {
  // ... 现有代码
}
```

- [ ] **步骤 2：优化空目录日志**

修改空目录的日志级别和消息：

```typescript
if (allVideos.length === 0) {
  console.log('[VideoStore] 目录下没有视频文件，忽略级联选择操作');
  return;
}
```

- [ ] **步骤 3：添加边界情况测试**

运行开发模式，测试以下场景：

1. **空目录：** 点击空目录复选框，确认无副作用
2. **单视频目录：** 点击只有 1 个视频的目录复选框，确认行为等同于点击该视频的复选框
3. **大量视频：** 如果有包含 100+ 视频的目录，测试性能是否可接受

预期：所有边界情况都正常处理，无崩溃或卡顿

---

## 实现优先级总结

**P0（核心功能）- 必须完成：**
- ✅ 任务 1：Store 层新增方法
- ✅ 任务 2：UI 层添加目录复选框和三态计算
- ✅ 任务 3：样式优化

**P1（用户体验）- 必须完成：**
- ✅ 任务 4：手动测试与验证

**P2（打磨优化）- 可选：**
- ✅ 任务 5：优化与边界处理

---

## 验收标准

### 功能验收
- [ ] 目录节点显示复选框
- [ ] 目录复选框正确显示三态（未选/半选/全选）
- [ ] 点击目录复选框可级联选择所有子视频
- [ ] 级联选择支持叠加逻辑（不清空之前的选择）
- [ ] 嵌套目录递归支持
- [ ] 点击视频行仍然是单选模式（清空其他选择）

### 视觉验收
- [ ] 复选框尺寸为 20px × 20px
- [ ] 三态样式符合设计规格（空框/半透明紫+横线/实心紫+勾选）
- [ ] 勾选动画流畅（缩放 + 淡入）
- [ ] 悬停效果符合规格（边框 + 背景）

### 边界验收
- [ ] 空目录点击无副作用
- [ ] 单视频目录行为正确
- [ ] 大量视频时性能可接受

---

## 风险与注意事项

### 1. 性能风险
- **风险：** 大目录（100+ 视频）的递归计算可能影响性能
- **缓解：** Vue 的 computed 会自动缓存，仅在依赖变化时重新计算
- **应对：** 如果发现性能问题，可考虑添加手动缓存或限流

### 2. 状态同步
- **风险：** 目录复选框状态依赖子视频状态，需确保响应式更新
- **缓解：** 使用 computed 自动追踪依赖，复用 toggleVideoSelection 保持一致性
- **应对：** 如果发现状态不同步，检查 computed 的依赖是否正确

### 3. 类型一致性
- **风险：** FileTreeItem.vue 和 useVideoStore.ts 中的 collectVideosInDirectory 是重复实现
- **缓解：** 这是设计决策，UI 层需要计算三态，Store 层需要执行级联选择，各司其职
- **应对：** 如果未来需要复用，可提取到独立的工具函数

---

**实现计划完成，准备开始执行。**
