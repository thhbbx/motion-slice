# 批量视频智能切片管线 实现总结

> **状态：✅ 已完成** | 最后更新：2026-06-13

**目标：** 实现批量视频切片功能，支持多视频同时分析、非破坏性编辑、实时导出进度追踪。

**架构：** 基于 Pinia 状态机隔离（单选/批量双轨）、动态组件策略模式、主进程串行队列、Vue 3 深度响应式管理。

**技术栈：** Electron 42.1.0、Vue 3 Composition API、Pinia、TypeScript、fluent-ffmpeg

---

## 核心架构演进（2026-06-11 至 2026-06-13）

### 1. 策略模式组件解耦 ✅

**问题：** 单选/批量模式在同一组件中使用冗长的 `v-if/else` 判断，代码耦合严重。

**解决方案：** 引入动态组件策略模式
```vue
<!-- ToolSlicer.vue -->
<component :is="currentModeComponent" :mode="mode" :target-value="targetValue" />

<script setup>
const currentModeComponent = computed(() => {
  return isBatchMode.value ? markRaw(SlicerBatchMode) : markRaw(SlicerSingleMode);
});
</script>
```

**新增文件：**
- `src/components/tools/SlicerSingleMode.vue` - 单选模式策略
- `src/components/tools/SlicerBatchMode.vue` - 批量模式策略

**收益：** 符合开闭原则（OCP），新增模式无需修改父组件。

---

### 2. 响应式状态断层修复 ✅

**问题：** 批量导出进度事件从主进程传来，但 UI 进度条和状态永远卡死。

**根因定位：**
1. 使用 `ref(new Map())` 存储进度，Map 的 `set()` 无法触发 Vue 响应式
2. 尝试直接修改 computed 派生数据
3. taskId 格式不匹配导致找不到目标任务

**解决方案：** 状态分离字典模式
```typescript
// ❌ 错误：Map 无法触发响应式
const taskProgress = ref(new Map<string, {...}>());

// ✅ 正确：reactive 对象
const taskProgress = reactive<Record<string, {...}>>({});

// 直接修改触发响应式
taskProgress[matchingTask.id] = { status, progress };
```

**关键修复：**
- 改用 `reactive({})` 替代 `ref(Map)`
- 进度更新直接赋值对象属性
- computed 自动追踪依赖变化

---

### 3. 复合主键防污染机制 ✅

**问题：** 视频 A 和视频 B 都有"片段 1"，导出时状态"张冠李戴"。

**根因：** 只用 `sliceLabel` 匹配任务，多视频场景下 label 不唯一。

**解决方案：** 复合键精确匹配
```typescript
// 提取纯净 videoId
const extractedVideoId = event.taskId.replace(/^export-/, '');

// 双重条件匹配
const matchingTask = allTasks.find(t =>
  t.videoPath === extractedVideoId &&  // 条件1：归属视频
  t.sliceLabel === event.currentLabel  // 条件2：切片标签
);
```

**防止跨视频污染：**
- ✅ 视频 A 的"片段 1" → 只匹配视频 A 的任务
- ✅ 视频 B 的"片段 1" → 只匹配视频 B 的任务

---

### 4. 单体任务与组级进度剥离 ✅

**问题：** 3 个切片的视频，片段 1 和 2 卡在"处理中"，只有片段 3 变"已完成"。

**根因：** 错误地将宏观进度 `(current/total) * 100` 赋值给单个切片。

**业务逻辑纠正：**
```typescript
// ❌ 错误：将 1/3 = 33% 赋值给片段 1
const progress = Math.round((event.current / event.total) * 100);

// ✅ 正确：收到事件 = 该切片已完成
taskProgress[matchingTask.id] = { status: 'completed', progress: 100 };
```

**全局进度计算：**
```typescript
const overallProgress = computed(() => {
  const completed = exportTasks.value.filter(t => t.status === 'completed').length;
  return Math.round((completed / exportTasks.value.length) * 100);
});
```

---

### 5. 预览播放器 Media Fragments 寻址 ✅

**问题：** JS 设置 `video.currentTime` 不稳定，视频从头播放。

**解决方案：** W3C 标准 Media Fragments URI
```html
<video @loadedmetadata="handleVideoReady" @timeupdate="handleTimeUpdate">
  <source :src="`file://${videoPath}#t=${startTime}`" type="video/mp4">
</video>
```

**生命周期拦截：**
```typescript
function handleVideoReady() {
  videoElement.value.currentTime = props.startTime;
  videoElement.value.play();
}

function handleTimeUpdate() {
  if (videoElement.value.currentTime >= props.endTime) {
    videoElement.value.pause();
    videoElement.value.currentTime = props.startTime; // 循环
  }
}
```

**新增文件：**
- `src/components/video/SlicePreviewModal.vue` - 悬浮预览播放器

---

### 6. Apple-like UI 质感抛光 ✅

#### 进度条幽灵修复
**问题：** 进度条使用 CSS 变量未渲染，100% 时仍为黑色。

**修复：** 硬编码紫色渐变
```css
.progress-fill {
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  border-radius: inherit;
}
```

#### 导出完成流程闭环
**问题：** 完成后按钮变为死按钮，用户流程断裂。

**优化：** 激活为"打开输出目录"
```vue
<button v-else class="btn-completed" @click="handleOpenOutputDir">
  📂 打开输出目录
</button>
```

**主进程 API：**
```typescript
// shell-handler.ts
ipcMain.handle('shell:open-directory', async (_, dirPath) => {
  await shell.openPath(dirPath); // 进入目录内部（非高亮）
});
```

#### 成功状态视觉反馈
```css
.task-item.completed .task-status {
  color: rgba(16, 185, 129, 0.9); /* Tailwind Emerald-500 */
  font-weight: 600;
}

.btn-completed:hover {
  background: rgba(16, 185, 129, 0.25);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}
```

#### 预览弹窗精简设计
**修复：** 去除臃肿 padding，紧凑 Header
```css
.modal-header {
  padding: 12px 20px; /* 从 28px 32px 缩减 */
}

.header-info {
  gap: 2px; /* 标题与时间紧密成组 */
}
```

---

### 7. 单视频模式回归修复 ✅

**问题：** 重构批量模式后，单选模式的切片不再出现在导出队列。

**根因：** 单选模式只调用 `sliceStore.setPreviewSlices()`，从未创建导出任务。

**修复：** 分析完成后自动创建任务

**修复：** 分析完成后自动创建任务
```typescript
// ToolSlicer.vue - handleAnalyze()
if (videos.length === 1) {
  const result = await window.motionSlice.analyzeSlices(params);
  sliceStore.setPreviewSlices(result.segments);
  
  // 自动创建导出任务
  if (result.segments.length > 0) {
    const task: ExportTask = {
      id: `export-${Date.now()}`,
      toolId: 'slicer',
      payload: {
        sourceFilePath: videos[0].path,
        segments: result.segments
      },
      // ...
    };
    exportStore.upsertTask(task);
  }
}
```

**双轨安全共存：**
- 单选：`exportStore.pendingTasks` (独立状态)
- 批量：`videoStore.batchSliceGroups` (独立状态)

---

### 8. 元数据前置水合（Eager Hydration）✅

**问题：** 导入视频时列表显示随机假数据，点击后突然更新导致 UI 闪烁；批量模式下未点击的视频属性面板显示 `--` 缺省值。

**根因：** `video-scanner.ts` 使用 `generateMockMetadata()` 生成假数据，真实元数据只在点击视频时通过 `videoStore.loadVideoMetadata()` 懒加载，违反单一事实来源原则。

**架构修复：** 导入时统一解析（前置水合）
```typescript
// video-scanner.ts - 新增异步扫描接口
export async function scanVideoFilesAsync(paths: string[]): Promise<FileNode[]> {
  // 阶段 1: 同步快速扫描文件结构
  const results = scanDirectoryRecursive(paths);
  
  // 阶段 2: 异步并发解析元数据
  await hydrateMetadata(results);
  
  return results;
}

async function hydrateMetadata(fileTree: FileNode[]): Promise<void> {
  const videoNodes = collectVideoNodes(fileTree);
  
  // 并发解析所有视频元数据
  await Promise.allSettled(
    videoNodes.map(async (node) => {
      const metadata = await parseVideoMetadata(node.path);
      node.metadata = metadata; // 回填完整元数据
    })
  );
}
```

**关键修改：**
1. **metadata-handler.ts**：导出 `parseVideoMetadata()` 供其他模块使用
2. **video-scanner.ts**：移除 `generateMockMetadata()`，新增 `scanVideoFilesAsync()` 和 `hydrateMetadata()`
3. **dialog-handler.ts**：两个导入 handler 改用 `scanVideoFilesAsync()`
4. **useVideoStore.ts**：删除 `loadVideoMetadata()` 函数，简化状态设置逻辑

**收益：**
- ✅ 导入即准确：列表立即显示真实时长/分辨率，无占位符
- ✅ 点击无闪烁：元数据已完整，点击只切换状态
- ✅ 批量属性完整：多选模式所有视频属性自动丰满
- ✅ 单一事实来源：metadata 只有一个数据源（导入时解析）
- ✅ 并发性能：使用 `Promise.allSettled` 并发解析，单个失败不影响全局

**详细文档：** `docs/superpowers/plans/2026-06-13-metadata-eager-hydration.md`

---

## 最终文件清单

### 新增文件
- `src/components/tools/SlicerSingleMode.vue` - 单选策略组件
- `src/components/tools/SlicerBatchMode.vue` - 批量策略组件
- `src/components/video/SlicePreviewModal.vue` - 悬浮预览播放器
- `src/components/export/BatchExportQueue.vue` - 批量导出队列
- `src/components/workspace/BatchPolicyCard.vue` - 批量策略卡片
- `src/utils/taskQueue.ts` - 串行任务队列
- `src/types/batch.ts` - 批量切片类型

### 修改文件
- `src/components/tools/ToolSlicer.vue` - 策略模式重构
- `src/components/BatchVideoGrid.vue` - 预览按钮集成
- `src/components/export/BatchExportQueue.vue` - 响应式修复
- `src/store/useVideoStore.ts` - 批量状态管理 + 懒加载移除
- `src/store/useSliceStore.ts` - 清理批量冗余
- `src/store/useExportStore.ts` - 单选任务创建
- `src/types/export.ts` - 类型更新
- `src/preload.ts` - openDirectory API
- `src/main/handlers/shell-handler.ts` - shell.openPath
- `src/main/handlers/export-handler.ts` - 导出引擎
- `src/main/handlers/slice-handler.ts` - 批量分析
- `src/main/handlers/metadata-handler.ts` - 导出 parseVideoMetadata
- `src/main/handlers/dialog-handler.ts` - 异步扫描集成
- `src/main/utils/video-scanner.ts` - 前置水合架构

### 删除文件
- `src/components/workspace/BatchSlicePreview.vue` - 已被 Accordion 取代

---

## Git 提交记录

```
fb2dc98 feat(批量): 实现批量视频智能切片完整管线
63f9758 fix(批量): 修复 lint 错误和未使用的函数
075111e fix(交互): 恢复整行点击切换为单选的原有逻辑
7e14386 fix(批量): 修复三个关键功能断层
5af2020 fix(时间轴): 修复缩略图生成任务的竞态条件
[待提交] refactor(批量): 架构解耦与状态响应式全链路修复
```

---

## 技术难点攻克总结

### 难点 1：Vue 3 响应式追踪失效
**表现：** IPC 事件正常接收，但 UI 不更新。

**根因：** Map/Set 等非原生对象无法被 Vue 响应式系统追踪。

**解决：** 改用 `reactive({})` 对象，直接赋值属性触发更新。

---

### 难点 2：跨视频状态污染
**表现：** 多个视频同时显示"处理中"。

**根因：** 单一维度匹配（label）导致碰撞。

**解决：** 复合键 `videoPath + sliceLabel` 唯一定位。

---

### 难点 3：进度计算业务逻辑混淆
**表现：** 只有最后一个切片显示"已完成"。

**根因：** 将视频组进度误用为单体任务进度。

**解决：** 单体任务直接标记 100%，全局进度由 computed 统计。

---

### 难点 4：Electron IPC 类型不匹配
**表现：** 前端发送数据，主进程报错"任务列表为空"。

**根因：** 前端传 `taskIds[]`，主进程期望 `tasks[]` 完整对象。

**解决：** 统一数据契约，前端组装完整 `ExportTask` 对象。

---

### 难点 5：视频 Seek 时序竞态
**表现：** 视频从头播放，无法定位到切片起点。

**根因：** metadata 未加载完成前设置 `currentTime` 无效。

**解决：** `@loadedmetadata` 钩子中执行 Seek + Play。

---

### 难点 6：元数据懒加载导致状态撕裂
**表现：** 导入后列表显示假数据，点击后突然更新；批量模式未点击视频属性显示 `--`。

**根因：** 元数据解析绑定在"点击事件"而非"导入生命周期"，违反单一事实来源。

**解决：** 前置水合架构 - 导入时统一并发解析，点击只负责状态切换。

---

## 验收清单 ✅

### 功能验收
- [x] 多选 3 个视频，批量分析串行执行
- [x] 点击视频行聚焦，展开图标展开切片
- [x] 禁用切片后导出队列实时过滤
- [x] 导出进度条 0% → 100% 平滑推进
- [x] 任务状态：等待中 → 处理中 → 已完成
- [x] 点击"打开输出目录"直接进入文件夹
- [x] 点击"▶ 预览"播放器自动 Seek 到 startTime
- [x] 单选模式导出队列正常显示
- [x] 导入即准确：列表立即显示真实时长/分辨率
- [x] 点击无闪烁：元数据已完整，点击只切换状态
- [x] 批量属性完整：多选模式所有视频属性自动填充

### 视觉验收
- [x] 进度条紫色渐变填充
- [x] 已完成任务绿色高亮（Emerald-500）
- [x] 预览弹窗紧凑 Header（12px padding）
- [x] 导出队列长文件名 ellipsis 截断
- [x] 完成按钮 hover 绿色高亮 + 微动效

---

## 后续迭代方向

### 已完成 ✅
- 批量视频切片分析管线
- 非破坏性编辑（`isActive` 标记）
- 策略模式组件解耦
- 响应式状态深度追踪
- 复合主键防污染机制
- 悬浮预览播放器
- 实时导出进度追踪
- Apple-like UI 质感抛光

### 待实现 🔜
- **智能断句切片**：基于静音检测的智能断点
- **预览标记功能**：时间轴上标注关键帧
- **导出模板系统**：预设格式、质量、命名规则
- **错误重试机制**：导出失败自动重试
- **导出历史记录**：查看历史导出任务

---

**文档版本：** v2.0  
**最后更新：** 2026-06-13  
**维护者：** MotionSlice 开发团队
