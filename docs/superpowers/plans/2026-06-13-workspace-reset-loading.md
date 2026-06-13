# 工作区状态清洗与全局加载反馈系统

> **状态：✅ 已完成** | 日期：2026-06-13

---

## 问题诊断

### 缺陷 1: 全局状态未清洗（脏数据残留）

**表现：** 每次执行全新的"导入视频"操作时，虽然左侧文件列表刷新了，但中间的视频预览、批量切片组、时间轴数据以及右侧的导出队列，全都残留着上一批的脏数据。

**场景重现：**
```
第一次导入：3 个视频 → 切片分析 → 导出队列显示 3 个任务
第二次导入：2 个视频 → 中间预览仍显示 3 个视频（错误！）
                       → 导出队列仍显示上一批的 3 个任务（错误！）
                       → 时间轴仍显示旧的切片数据（错误！）
```

**影响：**
- 用户困惑：界面显示与实际导入不符
- 数据污染：新旧数据混杂，导致操作错误
- 内存泄漏：旧数据无法被垃圾回收

---

### 缺陷 2: 导入过程缺乏视觉反馈（主线程阻塞感）

**表现：** 由于底层需要并发解析大量视频元数据（前置水合），点击"导入"后，整个系统界面会"卡住"数秒，没有任何视觉反馈，给用户造成软件假死的错觉。

**用户感知：**
```
点击"导入" → 对话框选择文件 → 点击"确定" → [界面卡死 5-10 秒] → 突然恢复
                                              ↑
                                         用户认为崩溃了
```

**技术原因：**
- 前置元数据水合需要调用 ffprobe 解析每个视频
- Promise.allSettled 并发解析，但仍需时间
- 主线程被阻塞，UI 无响应

---

## 架构修复方案

### 方案 1: 标准化工作区重置管线（Workspace Reset Pipeline）

#### **设计原则：**
- **单一职责**：每个 Store 负责清理自己的状态
- **契约统一**：所有 Store 提供标准的 `reset()` 方法
- **生命周期绑定**：导入行为 = 重置工作区 + 加载新数据

#### **实现清单：**

**1. useVideoStore.ts**
```typescript
function reset() {
  selectedVideos.value = [];
  focusedVideo.value = null;
  batchSliceGroups.value = [];
  currentTime.value = 0;
  duration.value = 0;
  console.log('[VideoStore] 工作区状态已重置');
}
```
**清理范围：**
- ✅ 选中的视频列表
- ✅ 聚焦的视频
- ✅ 批量切片组
- ✅ 当前播放时间和总时长

---

**2. useSliceStore.ts**
```typescript
function reset() {
  previewSlices.value = [];
  activeSliceId.value = null;
  isAnalyzing.value = false;
  console.log('[SliceStore] 工作区状态已重置');
}
```
**清理范围：**
- ✅ 预览切片列表
- ✅ 激活的切片 ID
- ✅ 分析状态标志

---

**3. useExportStore.ts**
```typescript
function reset() {
  pendingTasks.value = [];
  queueItems.value = [];
  console.log('[ExportStore] 工作区状态已重置');
}
```
**清理范围：**
- ✅ 待导出任务池
- ✅ 导出队列（运行时状态）

---

**4. useFileTreeStore.ts**
```typescript
function reset() {
  roots.value = [];
  selectedFileId.value = null;
  expandedDirIds.value.clear();
  console.log('[FileTreeStore] 工作区状态已重置');
}
```
**清理范围：**
- ✅ 文件树根节点
- ✅ 选中的文件 ID
- ✅ 展开的目录 ID 集合

---

#### **调用时机：**

**Sidebar.vue - handleImport()**
```typescript
async function handleImport() {
  try {
    // 第一步：重置所有工作区状态
    console.log('[Sidebar] ========== 开始工作区重置 ==========');
    fileTreeStore.reset();
    videoStore.reset();
    sliceStore.reset();
    exportStore.reset();
    console.log('[Sidebar] ========== 工作区重置完成 ==========');

    // 第二步：显示全局加载遮罩
    appStore.startImporting('正在扫描并解析媒体资产...');

    // 第三步：执行异步导入（带前置元数据水合）
    const result = await window.motionSlice.selectMediaFilesWithFilter(config);
    fileTreeStore.roots = result.fileTree;
  } catch (error) {
    console.error('[Sidebar] 导入文件失败:', error);
  } finally {
    // 第四步：隐藏全局加载遮罩
    appStore.finishImporting();
  }
}
```

---

### 方案 2: 全局加载反馈系统（Global Loading Overlay）

#### **架构设计：**

**1. 全局状态管理（useAppStore.ts）**
```typescript
export const useAppStore = defineStore('app', () => {
  const isImporting = ref(false);
  const importingMessage = ref('正在解析媒体资产...');

  function startImporting(message = '正在解析媒体资产...') {
    isImporting.value = true;
    importingMessage.value = message;
  }

  function finishImporting() {
    isImporting.value = false;
  }

  return { isImporting, importingMessage, startImporting, finishImporting };
});
```

**职责：**
- 管理全局加载状态（isImporting）
- 提供自定义加载消息（importingMessage）
- 暴露显示/隐藏 API（startImporting/finishImporting）

---

**2. 全局加载组件（GlobalLoading.vue）**

**视觉特征：**
- **深色毛玻璃背景**: `backdrop-filter: blur(12px)` + `rgba(0, 0, 0, 0.75)`
- **流畅动画**: SVG 圆环 Spinner，双重动画（旋转 + 描边流动）
- **克制文字**: 14px 半透明次级文字，字间距 0.02em
- **平滑过渡**: 300ms fade in/out，内容卡片带 scale(0.95) 微动效

**核心代码：**
```vue
<template>
  <Transition name="fade">
    <div v-if="appStore.isImporting" class="global-loading">
      <div class="loading-backdrop"></div>
      <div class="loading-content">
        <div class="loading-spinner">
          <svg class="spinner-ring" viewBox="0 0 50 50">
            <circle class="spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="3"></circle>
          </svg>
        </div>
        <div class="loading-message">{{ appStore.importingMessage }}</div>
      </div>
    </div>
  </Transition>
</template>
```

**CSS 动画：**
```css
/* Spinner 旋转 */
@keyframes rotate {
  100% { transform: rotate(360deg); }
}

/* 描边流动 */
@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}
```

---

**3. 组件挂载（App.vue）**
```vue
<template>
  <div class="video-tool-page">
    <Sidebar />
    <main class="workspace">...</main>
    <Inspector />
    
    <!-- 全局加载遮罩（最后挂载，z-index 最高） -->
    <GlobalLoading />
  </div>
</template>
```

**挂载位置：** App.vue 根节点，保证覆盖所有内容

---

## 技术亮点

### 1. 契约式设计（Design by Contract）
- 每个 Store 遵循相同的 `reset()` 契约
- 调用者无需关心内部清理细节
- 易于扩展：新 Store 只需实现 `reset()` 方法

### 2. 生命周期闭环
```
导入开始 → 重置状态 → 显示加载 → 异步解析 → 更新数据 → 隐藏加载
  ↓          ↓          ↓           ↓          ↓          ↓
 用户点击   内存清空   UI 反馈    后台处理   界面更新   流程完成
```

### 3. 状态驱动 UI（State-Driven UI）
- UI 组件通过 `v-if="appStore.isImporting"` 响应状态
- 不在业务逻辑中操作 DOM
- 声明式编程，易于测试

### 4. 解耦设计
- GlobalLoading 组件完全独立，无业务逻辑
- 可复用于其他耗时操作（批量分析、导出等）
- Store 之间互不依赖，通过 Sidebar 协调

---

## 验收标准

### 功能验收
- [x] **状态清洗完整**：第一次导入 3 个视频，第二次导入 2 个视频，界面只显示 2 个视频
- [x] **时间轴清空**：导入新视频后，时间轴不显示旧的切片数据
- [x] **导出队列清空**：导入新视频后，导出队列为空
- [x] **加载遮罩显示**：点击导入后，立即显示毛玻璃加载遮罩
- [x] **加载消息准确**：遮罩显示"正在扫描并解析媒体资产..."
- [x] **加载完成消失**：导入完成后，遮罩平滑消失（300ms fade out）

### 视觉验收
- [x] **毛玻璃质感**：遮罩背景模糊 12px，深色半透明
- [x] **流畅动画**：Spinner 双重动画（旋转 + 描边流动）
- [x] **克制文字**：14px 次级文字，字间距 0.02em
- [x] **平滑过渡**：遮罩和内容卡片 300ms fade in/out
- [x] **紫色主题**：Spinner 使用 `var(--vt-primary)` 紫色

### 性能验收
- [x] **内存释放**：导入新视频后，旧数据被垃圾回收
- [x] **无阻塞感**：加载遮罩立即显示，用户不会误认为崩溃
- [x] **finally 保证**：即使导入失败，加载遮罩也会关闭

---

## 后续优化方向

### 1. 渐进式进度反馈
**场景：** 导入 100 个视频时，用户不知道当前进度

**优化方案：**
- 主进程 IPC 流式传输解析进度
- 遮罩显示"正在解析 (23/100)..."
- 进度条显示百分比

**实现参考：**
```typescript
// 主进程
for (let i = 0; i < videos.length; i++) {
  await parseVideoMetadata(videos[i]);
  event.sender.send('import:progress', { current: i + 1, total: videos.length });
}

// 渲染进程
window.motionSlice.onImportProgress(({ current, total }) => {
  appStore.importingMessage = `正在解析 (${current}/${total})...`;
});
```

### 2. 取消导入功能
**场景：** 用户误导入大量视频，想中途取消

**优化方案：**
- 遮罩添加"取消"按钮
- 主进程维护 AbortController
- 点击取消时发送 abort 信号

### 3. 智能预热（Preload）
**场景：** 用户打开应用时，常用目录可预先扫描

**优化方案：**
- 应用启动时后台扫描"最近打开"目录
- 缓存文件树结构（不解析元数据）
- 用户再次选择时，跳过扫描直接解析

---

## 架构收益

### 1. 单一职责
- 每个 Store 只负责清理自己的状态
- Sidebar 只负责协调调用
- GlobalLoading 只负责 UI 展示

### 2. 易于维护
- 新增 Store 只需实现 `reset()` 方法
- 修改清理逻辑只需修改对应 Store
- 全局加载样式统一管理

### 3. 用户体验提升
- **消除困惑**：每次导入都是干净的开始
- **消除焦虑**：有视觉反馈，不会误以为崩溃
- **专业感**：毛玻璃 + 流畅动画，Apple-like 质感

### 4. 代码质量
- **契约式设计**：`reset()` 方法作为统一契约
- **状态驱动 UI**：声明式编程，易于测试
- **解耦架构**：各模块互不依赖

---

## 技术参考

### Vue 3 Transition 组件
- `<Transition name="fade">` - 声明式过渡动画
- CSS `.fade-enter-active` / `.fade-leave-active` - 过渡类名钩子
- `v-if` 触发 enter/leave - 状态驱动动画

### CSS backdrop-filter
- `backdrop-filter: blur(12px)` - 毛玻璃效果
- `-webkit-backdrop-filter: blur(12px)` - Safari 兼容
- 性能优化：只在需要时渲染（v-if）

### SVG 动画
- `stroke-dasharray` + `stroke-dashoffset` - 描边流动效果
- CSS `animation` - 声明式动画
- `transform-origin: center` - 旋转中心

---

**文档版本：** v1.0  
**最后更新：** 2026-06-13  
**维护者：** MotionSlice 开发团队
