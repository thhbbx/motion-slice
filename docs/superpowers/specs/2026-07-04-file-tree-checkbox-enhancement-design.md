# 文件树复选框增强设计规格

**日期：** 2026-07-04  
**状态：** 待实现  
**目标：** 增强左侧文件列表的复选框体验，支持目录级联选择、三态样式和精致动效

---

## 一、设计目标

### 1.1 核心诉求
- 复选框尺寸从 16px 提升到 20px，提升可点击性
- 目录节点增加复选框，支持级联选择所有子视频
- 实现三态复选框（全选/部分选中/未选），清晰传达层级选择状态
- 优化复选框样式，添加精致的动效，符合暗黑模式专业工具的高级感

### 1.2 用户场景
- **场景 1**：用户想批量选择某个目录下的所有视频进行切片，点击目录复选框即可全选
- **场景 2**：用户已选中目录 A 下的部分视频，目录复选框显示半选状态，一目了然
- **场景 3**：用户通过复选框多选视频 A、B，然后点击视频 C 的行（非复选框），切换为单选模式

---

## 二、视觉设计

### 2.1 复选框尺寸规格
- **当前：** 16px × 16px
- **新规格：** 20px × 20px
- **理由：** 提升可点击面积，符合 4px 网格系统（20 = 4 × 5）

### 2.2 三态样式定义

#### 未选状态（Unchecked）
- 空框，边框 1.5px，颜色 `var(--vt-border-strong)`
- 圆角 4px
- 悬停时：边框颜色加深，背景淡入 `rgba(139, 92, 246, 0.08)`

#### 半选状态（Indeterminate）
- 背景填充 `var(--vt-primary)` 的 60% 透明度
- 内部显示横线符号 `─`（2px 粗，居中）
- 边框同未选状态

#### 全选状态（Checked）
- 背景填充 `var(--vt-primary)` 实心
- 内部显示勾选符号 `✓`（SVG 路径，2px 描边）
- 边框同未选状态

### 2.3 动效规格
- **勾选动画：**
  - 缩放：0.85 → 1.0
  - 透明度：0 → 1
  - 时长：180ms ease-out
  - 触发时机：从未选/半选切换到全选时
  
- **悬停效果：**
  - 边框颜色从 `var(--vt-border-strong)` 过渡到 `var(--vt-border-hover)`
  - 背景淡入 `rgba(139, 92, 246, 0.08)`
  - 时长：160ms ease

- **状态过渡：**
  - 所有颜色、背景、边框变化使用 160ms ease 过渡

### 2.4 布局顺序
```
[复选框 20px] [箭头 16px] [图标 16px] [文件名] [元数据]
   ↑              ↑           ↑         ↑        ↑
 目录+文件      仅目录      全部     全部    仅文件
```

**间距：**
- 复选框与箭头：`var(--vt-space-2)` (8px)
- 箭头与图标：`var(--vt-space-2)` (8px)
- 图标与文件名：`var(--vt-space-2)` (8px)

---

## 三、交互逻辑

### 3.1 保持现有的单选/多选机制

**已实现的逻辑（不修改）：**
- **点击视频行**（`handleNodeClick`）：调用 `setSelectedVideos([node])`，清空其他选择，单选该视频
- **点击视频复选框**（`handleCheckboxClick`）：调用 `toggleVideoSelection(node)`，切换选中状态（叠加/移除）

**关键原则：**
- 点击行 = 单选（清空模式）
- 点击复选框 = 多选（叠加模式）

### 3.2 新增：目录复选框交互

**行为定义：**
- **点击目录行**：切换展开/收起状态（保持现有逻辑）
- **点击目录复选框**：级联选择该目录下所有视频文件

### 3.3 目录复选框的三态计算

**算法：**
```typescript
function calculateCheckboxState(directoryNode: FileNode): CheckboxState {
  // 1. 收集目录下所有视频文件
  const allVideos = collectVideosInDirectory(directoryNode);
  
  // 2. 如果目录下没有视频，返回未选
  if (allVideos.length === 0) return 'unchecked';
  
  // 3. 统计已选中的视频数量
  const selectedCount = allVideos.filter(video =>
    selectedVideos.some(sv => sv.id === video.id)
  ).length;
  
  // 4. 判断三态
  if (selectedCount === 0) return 'unchecked';        // 未选
  if (selectedCount === allVideos.length) return 'checked';  // 全选
  return 'indeterminate';                              // 半选
}
```

### 3.4 目录复选框的级联选择逻辑

**智能切换规则：**
- **如果当前为全选状态** → 取消该目录下所有视频的选中
- **如果当前为部分选中或未选状态** → 选中该目录下所有视频（叠加到现有选择）

**实现策略：**
```typescript
function toggleDirectorySelection(directoryNode: FileNode) {
  const allVideos = collectVideosInDirectory(directoryNode);
  const state = calculateCheckboxState(directoryNode);
  
  if (state === 'checked') {
    // 全选 → 取消：逐个移除
    allVideos.forEach(video => {
      if (selectedVideos.some(sv => sv.id === video.id)) {
        toggleVideoSelection(video); // 复用现有逻辑
      }
    });
  } else {
    // 未选/半选 → 全选：逐个添加
    allVideos.forEach(video => {
      if (!selectedVideos.some(sv => sv.id === video.id)) {
        toggleVideoSelection(video); // 复用现有逻辑
      }
    });
  }
}
```

**关键点：**
- ✅ 复用现有的 `toggleVideoSelection` 方法，保持状态管理的一致性
- ✅ 叠加选择，不清空之前通过复选框选中的其他视频
- ✅ 自动触发单选 → 多选的状态转换（由 `toggleVideoSelection` 内部处理）

### 3.5 边界情况处理

**情况 1：空目录**
- 目录下没有视频文件
- 复选框状态：未选（不可点击或点击无效果）

**情况 2：嵌套目录**
- 目录 A 包含子目录 B，子目录 B 包含视频 1、2
- 点击目录 A 的复选框 → 递归收集所有子孙视频（包括 B 下的视频 1、2）
- 三态计算同样递归：只要任意层级有视频被选中，父目录就显示半选或全选

**情况 3：单选 → 多选的自动切换**
- 用户当前单选了视频 X
- 点击目录 A 的复选框（该目录下有 3 个视频）
- 结果：视频 X + 目录 A 的 3 个视频 都被选中（共 4 个视频，多选模式）

**情况 4：目录部分选中时的行为**
- 目录下有视频 A、B、C，其中 A 已被选中
- 点击目录复选框 → 全选（B、C 也被选中）
- 再次点击目录复选框 → 取消全选（A、B、C 都被取消）

---

## 四、技术实现方案

### 4.1 文件改动范围

**修改文件：**
1. `src/components/FileTreeItem.vue` - UI 和交互逻辑
2. `src/store/useVideoStore.ts` - 新增 `toggleDirectorySelection` 方法

**不修改：**
- `Sidebar.vue` - 保持现有的"全选"按钮逻辑
- 其他组件和 Store

### 4.2 FileTreeItem.vue 改动细节

#### 4.2.1 新增计算属性

```typescript
// 计算复选框状态（文件 or 目录）
const checkboxState = computed<CheckboxState>(() => {
  if (props.node.type === 'file') {
    return isSelected.value ? 'checked' : 'unchecked';
  }
  
  // 目录节点：计算三态
  return calculateCheckboxState(props.node);
});

// 辅助函数：收集目录下所有视频
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

// 辅助函数：计算三态
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

#### 4.2.2 复选框 UI 改造

**从原生 `<input type="checkbox">` 改为自定义 `<div>`：**

```vue
<div 
  class="tree-checkbox"
  :class="{
    'checkbox-checked': checkboxState === 'checked',
    'checkbox-indeterminate': checkboxState === 'indeterminate',
    'checkbox-unchecked': checkboxState === 'unchecked'
  }"
  @click.stop="handleCheckboxClick"
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

#### 4.2.3 事件处理改造

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

#### 4.2.4 样式改造

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

### 4.3 useVideoStore.ts 改动细节

#### 4.3.1 新增方法

```typescript
/**
 * 切换目录的选中状态（级联选择所有子视频）
 */
function toggleDirectorySelection(directoryNode: FileNode) {
  const allVideos = collectVideosInDirectory(directoryNode);
  
  if (allVideos.length === 0) {
    console.warn('[VideoStore] 目录下没有视频文件，忽略操作');
    return;
  }
  
  // 计算当前状态
  const selectedCount = allVideos.filter(video =>
    selectedVideos.value.some(sv => sv.id === video.id)
  ).length;
  
  const isFullySelected = selectedCount === allVideos.length;
  
  if (isFullySelected) {
    // 全选 → 取消：逐个移除
    console.log(`[VideoStore] 取消目录选择: ${directoryNode.name}`);
    allVideos.forEach(video => {
      if (selectedVideos.value.some(sv => sv.id === video.id)) {
        toggleVideoSelection(video);
      }
    });
  } else {
    // 未选/半选 → 全选：逐个添加
    console.log(`[VideoStore] 全选目录: ${directoryNode.name}, 共 ${allVideos.length} 个视频`);
    allVideos.forEach(video => {
      if (!selectedVideos.value.some(sv => sv.id === video.id)) {
        toggleVideoSelection(video);
      }
    });
  }
}

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

#### 4.3.2 导出新方法

```typescript
return {
  // ... 现有导出
  toggleDirectorySelection, // 新增
};
```

---

## 五、测试验收标准

### 5.1 视觉验收
- [ ] 复选框尺寸为 20px × 20px
- [ ] 未选状态：空框，边框清晰
- [ ] 半选状态：紫色半透明背景 + 横线符号
- [ ] 全选状态：紫色实心背景 + 勾选符号
- [ ] 勾选动画流畅，有缩放和淡入效果
- [ ] 悬停时边框和背景有过渡效果

### 5.2 功能验收

#### 基础功能
- [ ] 目录节点显示复选框
- [ ] 文件节点复选框保持原有逻辑（叠加/移除）
- [ ] 点击目录行仍然是展开/收起，不触发选择

#### 三态逻辑
- [ ] 目录下所有视频未选中 → 复选框显示未选
- [ ] 目录下部分视频被选中 → 复选框显示半选
- [ ] 目录下所有视频被选中 → 复选框显示全选

#### 级联选择
- [ ] 点击未选状态的目录复选框 → 全选该目录下所有视频
- [ ] 点击半选状态的目录复选框 → 全选该目录下所有视频
- [ ] 点击全选状态的目录复选框 → 取消该目录下所有视频

#### 叠加逻辑
- [ ] 单选视频 A，然后点击目录 B 的复选框 → 视频 A + 目录 B 的视频都被选中
- [ ] 多选视频 A、B，然后点击视频 C 的行 → 清空 A、B，只选中 C

#### 嵌套目录
- [ ] 点击父目录复选框 → 递归选中所有子目录的视频
- [ ] 子目录部分选中 → 父目录显示半选
- [ ] 子目录全部选中 → 父目录显示全选

### 5.3 边界情况
- [ ] 空目录点击复选框 → 无效果或提示
- [ ] 只有一个视频的目录 → 点击目录复选框等同于点击该视频的复选框
- [ ] 从多选取消到只剩 1 个视频 → 自动切换到单选模式（由现有逻辑处理）

---

## 六、实现优先级

### P0（核心功能）
1. 复选框尺寸调整为 20px
2. 目录节点添加复选框
3. 三态样式实现（未选/半选/全选）
4. 目录复选框的级联选择逻辑

### P1（用户体验）
1. 勾选动画（缩放 + 淡入）
2. 悬停效果（边框 + 背景）
3. 嵌套目录的递归支持

### P2（打磨优化）
1. 空目录的边界处理
2. 日志输出优化
3. 性能优化（大量视频时的三态计算）

---

## 七、风险与注意事项

### 7.1 性能风险
- **问题：** 如果目录下有数百个视频，递归收集和三态计算可能影响性能
- **缓解：** 
  - 使用 `computed` 缓存三态计算结果
  - 仅在 `selectedVideos` 变化时重新计算

### 7.2 状态同步
- **问题：** 目录复选框的状态依赖子视频的选中状态，需确保响应式更新
- **缓解：**
  - 使用 Vue 的响应式系统，通过 `computed` 自动追踪依赖
  - 复用现有的 `toggleVideoSelection` 方法，避免状态不一致

### 7.3 兼容性
- **问题：** 自定义复选框可能在某些浏览器中样式不一致
- **缓解：**
  - 使用 CSS 变量和标准属性
  - Electron 环境固定 Chromium 内核，风险较低

---

## 八、后续迭代空间

### 可选增强（暂不实现）
1. **Shift 多选：** 按住 Shift 点击复选框，选中范围内的所有视频
2. **右键菜单：** 右键目录提供"全选此目录"选项
3. **拖拽多选：** 拖拽鼠标框选多个视频
4. **键盘导航：** 使用方向键 + 空格键进行选择

---

## 九、设计决策记录

### 决策 1：复选框位置
- **选项：** 箭头左边 vs 箭头右边
- **决定：** 箭头左边
- **理由：** 符合从左到右的操作流程（选择 → 展开 → 查看），避免误触

### 决策 2：级联逻辑
- **选项：** 全选时清空其他选择 vs 叠加到现有选择
- **决定：** 叠加到现有选择
- **理由：** 符合复选框的多选语义，用户可以跨目录累加选择

### 决策 3：三态样式
- **选项：** 圆形 vs 方形，特殊符号 vs 颜色填充
- **决定：** 方形 + 横线符号（半选）+ 勾选符号（全选）
- **理由：** 行业标准，用户认知成本低，视觉清晰

### 决策 4：实现方式
- **选项：** 原生 `<input type="checkbox">` + CSS vs 自定义 `<div>`
- **决定：** 自定义 `<div>`
- **理由：** 原生复选框的三态支持（`indeterminate`）需要 JavaScript 控制，且样式定制受限，自定义实现更灵活

---

**设计规格完成，待审查批准后进入实现阶段。**
