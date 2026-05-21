# Inspector 面板 UI 极致打磨 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Inspector 面板实现跨平台融合按钮（Windows 黄 + macOS 蓝）与骨架屏呼吸动效，提升加载状态的视觉反馈质量。

**架构：** 在 Inspector.vue 中重构底部按钮样式（Lucide 风格图标 + 双色融合），并为属性列表的 8 个数值字段添加条件渲染的骨架屏占位块（pulse 动画）。

**技术栈：** Vue 3, TypeScript, CSS Variables, CSS Animations

---

## 文件结构

**修改文件：**
- `src/components/Inspector.vue` - 重构按钮图标、样式和属性值骨架屏模板
- `src/styles/theme.css` - 添加跨平台融合色彩变量（Windows 黄、macOS 蓝）

---

## 任务 1：添加跨平台融合色彩变量

**文件：**
- 修改：`src/styles/theme.css:1-61`

- [ ] **步骤 1：在颜色系统中添加跨平台融合色**

在 `/* 功能色 */` 区块后添加：

```css
/* 功能色 */
--vt-success: #30b08f;
--vt-warning: #fec171;
--vt-danger: #c03639;
--vt-info: #4ab7bd;
--vt-pink: #e65d6e;

/* 跨平台融合色 */
--vt-windows-yellow: rgb(250, 204, 21); /* Windows 文件夹明黄 */
--vt-macos-blue: rgb(56, 189, 248); /* macOS 亮蓝 */
--vt-macos-blue-soft: rgba(56, 189, 248, 0.1); /* 玻璃质感透明蓝 */
```

**Why:** 为按钮提供跨平台视觉融合的色彩基础，Windows 黄色图标 + macOS 蓝色边框/背景。

- [ ] **步骤 2：验证变量可用性**

运行：`npm start`
预期：应用正常启动，无 CSS 解析错误

- [ ] **步骤 3：Commit**

```bash
git add src/styles/theme.css
git commit -m "style(theme): 添加跨平台融合色彩变量（Windows 黄 + macOS 蓝）"
```

---

## 任务 2：重构 folder-open 图标为 Lucide 风格

**文件：**
- 修改：`src/components/Inspector.vue:5-7`

- [ ] **步骤 1：替换 icon-folder-open 为 Lucide 风格 SVG**

替换现有 `<symbol id="icon-folder-open">` 为：

```vue
<symbol id="icon-folder-open" viewBox="0 0 16 16">
  <path 
    fill="none" 
    stroke="currentColor" 
    stroke-width="1.5" 
    stroke-linecap="round" 
    stroke-linejoin="round" 
    d="M14 13.5V5.5a1 1 0 0 0-1-1H8.5L7 3H2.5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1z"
  />
</symbol>
```

**Why:** Lucide 风格使用 stroke（线条）而非 fill（填充），线宽 1.5px 更精致，且 `stroke="currentColor"` 可继承父元素颜色。

- [ ] **步骤 2：验证图标渲染**

运行：`npm start`
操作：导入视频，切换到【属性】Tab，查看底部按钮图标
预期：图标显示为线条风格，大小 16px

---

## 任务 3：重构按钮样式为跨平台融合风格

**文件：**
- 修改：`src/components/Inspector.vue:240-251`（模板）
- 修改：`src/components/Inspector.vue:760-780`（样式）

- [ ] **步骤 1：为按钮添加自定义类名**

替换底部按钮区域：

```vue
<!-- 底部操作按钮（上下文感知） -->
<div class="inspector-actions">
  <button
    v-if="activeTab === 'properties'"
    class="vt-button-ghost action-button action-button-fusion"
    :disabled="!activeVideo"
    @click="handleShowInFolder"
  >
    <svg class="button-icon button-icon-windows" width="16" height="16">
      <use href="#icon-folder-open"></use>
    </svg>
    <span>在资源管理器中显示</span>
  </button>
  <button
    v-else-if="activeTab === 'analysis'"
    class="vt-button-primary"
    :disabled="!activeVideo"
  >
    开始检测晃动
  </button>
  <button
    v-else-if="activeTab === 'export'"
    class="vt-button-primary"
    :disabled="!activeVideo"
  >
    执行导出
  </button>
</div>
```

**Why:** 添加 `.action-button-fusion` 和 `.button-icon-windows` 类名，用于应用跨平台融合样式。

- [ ] **步骤 2：添加跨平台融合按钮样式**

在 `<style scoped>` 末尾添加：

```css
/* 跨平台融合按钮样式 */
.action-button-fusion {
  border-color: var(--vt-macos-blue);
  color: var(--vt-macos-blue);
  background: transparent;
  gap: var(--vt-space-2);
  transition: all 180ms ease;
}

.action-button-fusion:hover:not(:disabled) {
  border-color: var(--vt-macos-blue);
  background: var(--vt-macos-blue-soft);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.08);
}

.action-button-fusion:active:not(:disabled) {
  transform: translateY(1px);
}

/* Windows 黄色图标 */
.button-icon-windows {
  color: var(--vt-windows-yellow);
  flex-shrink: 0;
  transition: opacity 180ms ease;
}

.action-button-fusion:hover:not(:disabled) .button-icon-windows {
  opacity: 1;
}

.action-button-fusion:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: var(--vt-border);
  color: var(--vt-text-disabled);
}

.action-button-fusion:disabled .button-icon-windows {
  color: var(--vt-text-disabled);
  opacity: 0.4;
}
```

**Why:** 
- 常态：macOS 蓝色边框和文字，Windows 黄色图标，背景透明
- Hover：边框保持蓝色，背景浮现玻璃质感透明蓝，微弱外发光
- Disabled：统一降低透明度，图标和文字变为禁用灰色

- [ ] **步骤 3：验证按钮交互**

运行：`npm start`
操作：
1. 导入视频，切换到【属性】Tab
2. 鼠标悬停在"在资源管理器中显示"按钮上
3. 点击按钮

预期：
- 常态：蓝色边框和文字，黄色图标
- Hover：背景浮现透明蓝色，边框微微发光
- 点击：按钮微微下沉 1px，资源管理器打开

- [ ] **步骤 4：Commit**

```bash
git add src/components/Inspector.vue
git commit -m "style(inspector): 重构按钮为跨平台融合风格（Windows 黄 + macOS 蓝）"
```

---

## 任务 4：实现骨架屏呼吸动效

**文件：**
- 修改：`src/components/Inspector.vue:51-84`（模板）
- 修改：`src/components/Inspector.vue:780-850`（样式）

- [ ] **步骤 1：添加骨架屏 CSS 动画**

在 `<style scoped>` 末尾添加：

```css
/* 骨架屏呼吸动效 */
.skeleton-block {
  display: inline-block;
  height: 16px;
  background: var(--vt-bg-soft);
  border-radius: var(--vt-radius-sm);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

/* 不同属性的骨架宽度（错落排版） */
.skeleton-size { width: 70px; }
.skeleton-duration { width: 60px; }
.skeleton-resolution { width: 80px; }
.skeleton-fps { width: 50px; }
.skeleton-codec { width: 40px; }
.skeleton-bitrate { width: 60px; }
.skeleton-time { width: 100px; }
```

**Why:** 
- `pulse` 动画让 opacity 在 0.4 到 1 之间平滑交替（1.5s 无限循环）
- 不同属性使用不同宽度，视觉更自然
- 高度 16px 匹配文字行高，保持右对齐

- [ ] **步骤 2：改造属性列表模板支持骨架屏**

替换规格列表区域（第 51-84 行）：

```vue
<!-- 规格列表（左右对齐 Key-Value） -->
<div class="specs-list">
  <div class="spec-row">
    <span class="spec-label vt-secondary">文件大小</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ formatFileSize(activeVideo.metadata?.size) }}
    </span>
    <span v-else class="skeleton-block skeleton-size"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">时长</span>
    <span v-if="!isFetchingMetadata" class="spec-value vt-timecode">
      {{ activeVideo.metadata?.duration || '--' }}
    </span>
    <span v-else class="skeleton-block skeleton-duration"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">分辨率</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ activeVideo.metadata?.resolution || '--' }}
    </span>
    <span v-else class="skeleton-block skeleton-resolution"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">帧率</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ formatFrameRate(activeVideo.metadata) }}
    </span>
    <span v-else class="skeleton-block skeleton-fps"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">视频编码</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ activeVideo.metadata?.videoCodec || '--' }}
    </span>
    <span v-else class="skeleton-block skeleton-codec"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">音频编码</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ activeVideo.metadata?.audioCodec || '--' }}
    </span>
    <span v-else class="skeleton-block skeleton-codec"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">码率</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ formatBitrate(activeVideo.metadata) }}
    </span>
    <span v-else class="skeleton-block skeleton-bitrate"></span>
  </div>
  <div class="spec-row">
    <span class="spec-label vt-secondary">创建时间</span>
    <span v-if="!isFetchingMetadata" class="spec-value">
      {{ formatCreatedTime(activeVideo.metadata) }}
    </span>
    <span v-else class="skeleton-block skeleton-time"></span>
  </div>
</div>
```

**Why:** 
- 当 `isFetchingMetadata` 为 true 时，显示骨架屏占位块
- 当 `isFetchingMetadata` 为 false 时，显示真实数据
- 每个属性使用对应宽度的骨架块，保持右对齐

- [ ] **步骤 3：移除文件名旁的加载指示器**

删除文件名行中的加载指示器（第 36-41 行）：

```vue
<div class="file-name-row">
  <div class="file-name">{{ activeVideo.name }}</div>
</div>
```

**Why:** 骨架屏已经提供了足够的加载反馈，无需在文件名旁显示转圈图标。

- [ ] **步骤 4：移除加载指示器相关样式**

删除以下 CSS 规则：

```css
/* 删除这些样式 */
.loading-indicator { ... }
.loading-spinner { ... }
@keyframes spin { ... }
.loading-text { ... }
```

保留 `.file-name-row` 的 `min-height: 20px` 以防止布局跳动。

- [ ] **步骤 5：验证骨架屏动效**

运行：`npm start`
操作：
1. 导入视频，点击视频文件
2. 观察右侧属性面板

预期：
- 点击视频瞬间，8 个属性值位置显示不同宽度的灰色骨架块
- 骨架块以 1.5s 周期呼吸闪烁（opacity 0.4 ↔ 1）
- 1-2 秒后，骨架块消失，真实数据显现
- 整个过程无布局跳动

- [ ] **步骤 6：Commit**

```bash
git add src/components/Inspector.vue
git commit -m "feat(inspector): 实现属性值骨架屏呼吸动效"
```

---

## 任务 5：验证完整 UI 体验

**文件：**
- 无（运行时验证）

- [ ] **步骤 1：验证跨平台融合按钮**

运行：`npm start`
操作：
1. 导入视频，切换到【属性】Tab
2. 观察底部按钮常态：蓝色边框和文字，黄色图标
3. 鼠标悬停：背景浮现透明蓝色，边框微微发光
4. 点击按钮：资源管理器打开并定位文件

预期：所有交互流畅，视觉融合自然

- [ ] **步骤 2：验证骨架屏呼吸动效**

操作：
1. 点击不同视频文件，观察属性面板
2. 确认骨架块宽度错落有致
3. 确认呼吸动画平滑（1.5s 周期）
4. 确认数据加载完成后骨架块消失

预期：加载状态反馈清晰，无布局跳动

- [ ] **步骤 3：验证禁用状态**

操作：
1. 未选中视频时，按钮应为禁用状态
2. 图标和文字变为灰色，透明度降低

预期：禁用状态视觉清晰

- [ ] **步骤 4：最终 Commit**

```bash
git add -A
git commit -m "test: 验证 Inspector 面板 UI 极致打磨功能"
```

---

## 自检清单

**规格覆盖度：**
- ✅ 任务一：添加跨平台融合色彩变量（Windows 黄 + macOS 蓝）
- ✅ 任务二：重构 folder-open 图标为 Lucide 风格（线宽 1.5px）
- ✅ 任务三：重构按钮样式（常态/Hover/Disabled 三态）
- ✅ 任务四：实现骨架屏呼吸动效（pulse 动画 + 错落宽度）
- ✅ 任务五：移除文件名旁的加载指示器

**占位符扫描：**
- ✅ 无 "TODO" 或 "待定"
- ✅ 所有代码步骤包含完整代码块
- ✅ 所有命令包含精确路径和预期输出

**类型一致性：**
- ✅ CSS 变量命名一致（`--vt-windows-yellow`, `--vt-macos-blue`）
- ✅ 类名命名一致（`.action-button-fusion`, `.skeleton-block`）
- ✅ 动画名称一致（`pulse`）

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-21-inspector-ui-polish.md`。两种执行方式：

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
