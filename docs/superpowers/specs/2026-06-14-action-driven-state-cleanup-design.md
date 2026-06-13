# 动作驱动状态清理架构设计

**日期**: 2026-06-14  
**状态**: 已批准  
**问题**: 状态机缺陷导致切片数据与导出队列的"孤儿状态"残留

---

## 问题背景

### 现状缺陷
系统存在严重的状态依赖生命周期管理缺陷：
1. **单视频切换污染**：从视频 A 切换到视频 B 时，工作台切片列表、时间轴、导出面板完全没有清空，依然显示视频 A 的数据
2. **批量模式取消选择滞留**：取消勾选某个视频后，该视频的切片仍残留在批量切片组和导出队列中
3. **缺乏状态依赖清理机制**：派生状态（切片、导出任务）未与宿主状态（视频选择）建立强绑定的生命周期

### 根本原因诊断
经过代码审查，发现三个致命缺陷：

1. **Watch 配置错误**（最严重）
   ```typescript
   watch(
     () => selectedVideos.value,
     async (newVideos, oldVideos) => { ... },
     { deep: true }  // ❌ 无法正确检测数组引用变化
   )
   ```
   - 当通过 `setSelectedVideos([video])` 整体替换数组时，`oldVideos` 为 `undefined` 或无法正确捕获
   - 导致所有清理逻辑的 `if (oldVideos && ...)` 判断失效

2. **数据流混乱**
   - `ToolSlicer.vue L178`: 单选模式错误地调用 `setBatchSliceGroups([])`，违反双轨隔离原则

3. **异步时序不确定**
   - Watch 是异步的，与 UI 点击事件之间存在不可控的执行时差
   - 清理逻辑依赖推断而非确定性同步执行

---

## 设计方案：动作驱动清理 (Action-Driven Teardown)

### 核心原则

**彻底废弃响应式推断，改为命令式同步清理**

1. **上游拦截 (Action-Based Interception)**  
   清理逻辑必须上浮到 Pinia Actions 中，在更新状态的同一同步执行栈内显式清理关联数据

2. **严格双轨隔离 (Strict State Isolation)**  
   - 单选模式：只操作 `sliceStore.previewSlices` 和 `exportStore.pendingTasks`（toolId='slicer'）
   - 批量模式：只操作 `videoStore.batchSliceGroups`（exportTaskQueue 自动同步）

3. **同步剔除原则 (Synchronous Pruning)**  
   在"移除勾选"行为发生的当下，同步剥离该视频产生的所有下游数据

4. **靶向清理策略 (Targeted Pruning)**  
   不能粗暴清空 `pendingTasks`，必须通过 `toolId` 和 `sourceFilePath` 精准过滤，保护其他工具的任务

---

## 架构实现

### 1. VideoStore Actions 改造

#### `setActiveVideo(video)`
**职责**：设置单选视频，清理旧视频的单选轨数据

```typescript
async function setActiveVideo(video: FileNode | null) {
  if (!video) {
    // 清空选择
    const wasSingleMode = selectedVideos.value.length === 1;
    if (wasSingleMode) {
      await cleanupSingleModeData(selectedVideos.value[0]);
    }
    selectedVideos.value = [];
    currentTime.value = 0;
    duration.value = 0;
    return;
  }

  // 单选切换：先清理旧数据
  if (selectedVideos.value.length === 1 && selectedVideos.value[0].id !== video.id) {
    await cleanupSingleModeData(selectedVideos.value[0]);
  }

  selectedVideos.value = [video];
  currentTime.value = 0;
  if (video.metadata?.duration) {
    setDuration(parseTimecode(video.metadata.duration));
  }
}
```

#### `setSelectedVideos(videos)`
**职责**：批量设置选中视频，处理模式切换

```typescript
async function setSelectedVideos(videos: FileNode[]) {
  const wasSingleMode = selectedVideos.value.length === 1;
  const wasBatchMode = selectedVideos.value.length > 1;
  const isSingleMode = videos.length === 1;
  const isBatchMode = videos.length > 1;

  // 场景 1: 单选切换（A → B）
  if (wasSingleMode && isSingleMode) {
    const oldVideo = selectedVideos.value[0];
    const newVideo = videos[0];
    if (oldVideo.id !== newVideo.id) {
      await cleanupSingleModeData(oldVideo);
    }
  }

  // 场景 2: 单选 → 批量
  if (wasSingleMode && isBatchMode) {
    await cleanupSingleModeData(selectedVideos.value[0]);
  }

  // 场景 3: 批量 → 单选
  if (wasBatchMode && isSingleMode) {
    cleanupBatchModeData();
  }

  // 场景 4: 清空所有选择
  if (videos.length === 0) {
    if (wasSingleMode) {
      await cleanupSingleModeData(selectedVideos.value[0]);
    } else if (wasBatchMode) {
      cleanupBatchModeData();
    }
  }

  selectedVideos.value = videos;
  
  if (isSingleMode) {
    currentTime.value = 0;
    if (videos[0].metadata?.duration) {
      setDuration(parseTimecode(videos[0].metadata.duration));
    }
  } else {
    currentTime.value = 0;
    duration.value = 0;
  }
}
```

#### `toggleVideoSelection(video)`
**职责**：切换多选状态，取消勾选时立即清理

```typescript
function toggleVideoSelection(video: FileNode) {
  const index = selectedVideos.value.findIndex(v => v.id === video.id);
  
  if (index >= 0) {
    // 【取消勾选】- 立即同步清理批量数据
    const removedVideoId = selectedVideos.value[index].id;
    
    // 1. 从批量切片组中删除
    batchSliceGroups.value = batchSliceGroups.value.filter(
      group => group.videoId !== removedVideoId
    );
    
    // 2. exportTaskQueue 是 computed，会自动同步
    
    // 3. 最后移除选择
    selectedVideos.value.splice(index, 1);
    
    console.log(`[VideoStore] 取消勾选视频 ${video.name}，已清理批量数据`);
  } else {
    // 【勾选】- 仅添加
    selectedVideos.value.push(video);
  }
}
```

#### `clearActiveVideo()`
**职责**：清空所有选择

```typescript
async function clearActiveVideo() {
  if (selectedVideos.value.length === 1) {
    await cleanupSingleModeData(selectedVideos.value[0]);
  } else if (selectedVideos.value.length > 1) {
    cleanupBatchModeData();
  }
  
  selectedVideos.value = [];
  currentTime.value = 0;
  duration.value = 0;
}
```

#### 内部清理辅助函数

```typescript
/**
 * 清理单选模式的派生数据
 */
async function cleanupSingleModeData(video: FileNode) {
  const { useSliceStore } = await import('./useSliceStore');
  const { useExportStore } = await import('./useExportStore');
  
  const sliceStore = useSliceStore();
  const exportStore = useExportStore();
  
  // 清理切片数据
  sliceStore.reset();
  
  // 靶向清理导出任务：只删除该视频的 slicer 任务
  exportStore.removeTasksBySource('slicer', video.path);
  
  console.log(`[VideoStore] 已清理单选视频 ${video.name} 的派生数据`);
}

/**
 * 清理批量模式的派生数据
 */
function cleanupBatchModeData() {
  batchSliceGroups.value = [];
  // exportTaskQueue 是 computed，会自动清空
  console.log('[VideoStore] 已清理批量模式数据');
}
```

---

### 2. ExportStore 新增靶向清理方法

```typescript
/**
 * 按工具 ID 和源文件路径移除任务（靶向清理）
 */
function removeTasksBySource(toolId: string, sourceFilePath: string) {
  const before = pendingTasks.value.length;
  pendingTasks.value = pendingTasks.value.filter(task => {
    // 保留不匹配的任务
    return !(task.toolId === toolId && task.payload?.sourceFilePath === sourceFilePath);
  });
  const removed = before - pendingTasks.value.length;
  if (removed > 0) {
    console.log(`[ExportStore] 已移除 ${removed} 个任务 (toolId=${toolId}, source=${sourceFilePath})`);
  }
}
```

---

### 3. ToolSlicer.vue 修复越界操作

**删除单选模式中的越界代码**

```typescript
// ❌ 删除这行
videoStore.setBatchSliceGroups([]);

// ✅ 单选模式只操作单选轨数据
if (videos.length === 1) {
  params.filePath = videos[0].path;
  const result = await window.motionSlice.analyzeSlices(params);
  sliceStore.setPreviewSlices(result.segments);
  // 不操作 batchSliceGroups
  
  // 创建单选模式导出任务...
}
```

---

### 4. 移除 watch 逻辑

**完全删除 `useVideoStore.ts` 中的 watch 块（L133-210）**

---

## 数据流对比

### 重构前（失败的响应式推断）
```
用户点击 → setSelectedVideos() → 更新状态
                                ↓ (异步，不可靠)
                            watch 回调 → 尝试推断清理
                                         ↓ (oldVideos 丢失)
                                      清理失败 ❌
```

### 重构后（确定性命令式清理）
```
用户点击 → setSelectedVideos() → 判断模式切换
                                ↓ (同步)
                           cleanupSingleModeData()
                                ↓
                         sliceStore.reset()
                         exportStore.removeTasksBySource()
                                ↓
                           更新状态 ✅
```

---

## 测试验证场景

### 单选模式切换
1. 选择视频 A，生成 5 个切片
2. 切换到视频 B
3. **预期**：工作台切片列表、时间轴、导出面板完全清空

### 批量模式取消勾选
1. 勾选视频 A、B、C，生成批量切片
2. 取消勾选视频 B
3. **预期**：批量切片组和导出队列中不再包含视频 B 的数据

### 模式切换
1. 单选视频 A，生成切片
2. 勾选视频 B（进入批量模式）
3. **预期**：单选轨数据清空，批量轨为空（未生成）

### 靶向清理验证
1. 单选视频 A，生成切片任务（toolId='slicer'）
2. 假设未来添加其他工具任务（toolId='converter'）
3. 切换视频时
4. **预期**：只清理 slicer 任务，converter 任务保留

---

## 实现清单

- [x] 设计架构方案
- [ ] 重构 `useVideoStore.ts` Actions
- [ ] 新增 `useExportStore.ts` 靶向清理方法
- [ ] 修复 `ToolSlicer.vue` 越界操作
- [ ] 删除 `useVideoStore.ts` watch 逻辑
- [ ] 手动测试所有场景
- [ ] 验证无孤儿状态残留
- [ ] 提交代码

---

## 架构收益

1. **确定性**：清理逻辑在同步执行栈中完成，无异步时序问题
2. **可维护性**：清理逻辑集中在 Actions 中，易于追踪和调试
3. **可扩展性**：靶向清理策略支持未来多工具并存
4. **双轨隔离**：单选/批量模式数据完全独立，无交叉污染
5. **无冗余数据**：所见即所得，未选中的视频绝无内存或 UI 痕迹
