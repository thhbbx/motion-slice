# 动作驱动状态清理实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现动作驱动的状态清理架构，消除切片数据与导出队列的"孤儿状态"残留

**架构：** 废弃基于 watch 的异步推断清理，改为在 Pinia Actions 中同步显式清理派生状态。单选/批量模式严格双轨隔离，通过 toolId 和 sourceFilePath 实施靶向清理。

**技术栈：** Vue 3, Pinia, TypeScript, Electron

**规格文档：** `docs/superpowers/specs/2026-06-14-action-driven-state-cleanup-design.md`

---

## 文件结构

### 修改的文件

**`src/store/useVideoStore.ts`** (核心重构)
- **职责**：管理视频选择状态，执行同步清理逻辑
- **修改范围**：
  - 重构 `setActiveVideo()` - 单选切换清理
  - 重构 `setSelectedVideos()` - 模式切换清理
  - 重构 `toggleVideoSelection()` - 批量取消勾选清理
  - 重构 `clearActiveVideo()` - 清空选择清理
  - 新增 `cleanupSingleModeData()` - 单选数据清理辅助函数
  - 新增 `cleanupBatchModeData()` - 批量数据清理辅助函数
  - 删除 L133-210 的 watch 逻辑块

**`src/store/useExportStore.ts`** (新增方法)
- **职责**：管理导出任务队列
- **修改范围**：
  - 新增 `removeTasksBySource(toolId, sourceFilePath)` - 靶向清理方法
  - 暴露该方法到 return 对象

**`src/components/tools/ToolSlicer.vue`** (修复越界)
- **职责**：视频切片工具表单和逻辑
- **修改范围**：
  - 删除 L178 的 `videoStore.setBatchSliceGroups([])` 越界调用

---

## 任务分解

### 任务 1：ExportStore 新增靶向清理方法

**文件：**
- 修改：`src/store/useExportStore.ts:1-104`

- [ ] **步骤 1：在 useExportStore 中新增 removeTasksBySource 方法**

在 `clearQueue()` 方法之后、`reset()` 方法之前添加：

```typescript
/**
 * 按工具 ID 和源文件路径移除任务（靶向清理）
 * @param toolId 工具标识符（如 'slicer'）
 * @param sourceFilePath 源文件路径
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

- [ ] **步骤 2：将新方法暴露到 return 对象**

在 return 对象的 Actions 部分添加：

```typescript
return {
  // State
  pendingTasks,
  queueItems,
  hasPendingTasks,
  isExporting,
  // Actions
  upsertTask,
  removeTask,
  removeTasksBySource,  // 新增
  clearTasks,
  updateQueueProgress,
  setQueueStatus,
  initQueue,
  clearQueue,
  reset,
};
```

- [ ] **步骤 3：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 4：Commit ExportStore 改动**

```bash
git add src/store/useExportStore.ts
git commit -m "feat(导出): 新增 removeTasksBySource 靶向清理方法"
```

---

### 任务 2：VideoStore 新增清理辅助函数

**文件：**
- 修改：`src/store/useVideoStore.ts:1-234`

- [ ] **步骤 1：在 return 语句之前添加 cleanupSingleModeData 函数**

在 `reset()` 函数之后、return 之前插入：

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

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit 清理辅助函数**

```bash
git add src/store/useVideoStore.ts
git commit -m "feat(状态): 新增单选/批量模式清理辅助函数"
```

---

### 任务 3：重构 setActiveVideo 方法

**文件：**
- 修改：`src/store/useVideoStore.ts:45-58`

- [ ] **步骤 1：将 setActiveVideo 改为 async 函数并添加清理逻辑**

替换现有的 `setActiveVideo` 函数（L45-58）为：

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
  // 元数据已在导入时预加载，直接使用
  if (video.metadata?.duration) {
    setDuration(parseTimecode(video.metadata.duration));
  }
}
```

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit setActiveVideo 重构**

```bash
git add src/store/useVideoStore.ts
git commit -m "refactor(状态): 重构 setActiveVideo 实现同步清理"
```

---

### 任务 4：重构 setSelectedVideos 方法

**文件：**
- 修改：`src/store/useVideoStore.ts:60-72`

- [ ] **步骤 1：将 setSelectedVideos 改为 async 函数并添加模式切换清理逻辑**

替换现有的 `setSelectedVideos` 函数（L60-72）为：

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
    // 元数据已在导入时预加载，直接使用
    if (videos[0].metadata?.duration) {
      setDuration(parseTimecode(videos[0].metadata.duration));
    }
  } else {
    currentTime.value = 0;
    duration.value = 0;
  }
}
```

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit setSelectedVideos 重构**

```bash
git add src/store/useVideoStore.ts
git commit -m "refactor(状态): 重构 setSelectedVideos 处理模式切换清理"
```

---

### 任务 5：重构 toggleVideoSelection 方法

**文件：**
- 修改：`src/store/useVideoStore.ts:74-81`

- [ ] **步骤 1：重写 toggleVideoSelection 实现批量取消勾选时的同步清理**

替换现有的 `toggleVideoSelection` 函数（L74-81）为：

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

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit toggleVideoSelection 重构**

```bash
git add src/store/useVideoStore.ts
git commit -m "refactor(状态): 重构 toggleVideoSelection 实现取消勾选时同步清理"
```

---

### 任务 6：重构 clearActiveVideo 方法

**文件：**
- 修改：`src/store/useVideoStore.ts:83-87`

- [ ] **步骤 1：将 clearActiveVideo 改为 async 函数并添加清理逻辑**

替换现有的 `clearActiveVideo` 函数（L83-87）为：

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

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit clearActiveVideo 重构**

```bash
git add src/store/useVideoStore.ts
git commit -m "refactor(状态): 重构 clearActiveVideo 实现清空选择时清理"
```

---

### 任务 7：删除 watch 逻辑块

**文件：**
- 修改：`src/store/useVideoStore.ts:133-210`

- [ ] **步骤 1：完全删除 watch 代码块**

删除 L133-210 的整个 watch 块：

```typescript
// 删除从这里开始：
// ========== 状态依赖生命周期管理 ==========
// 监听视频选择变化，自动清理孤儿状态
watch(
  () => selectedVideos.value,
  async (newVideos, oldVideos) => {
    // ... 所有内容 ...
  },
  { deep: true }
);
// 删除到这里结束
```

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit 删除 watch 逻辑**

```bash
git add src/store/useVideoStore.ts
git commit -m "refactor(状态): 移除失效的 watch 清理逻辑"
```

---

### 任务 8：修复 ToolSlicer.vue 越界操作

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue:174-178`

- [ ] **步骤 1：删除单选模式中的 setBatchSliceGroups 调用**

在 L178 删除这一行：

```typescript
videoStore.setBatchSliceGroups([]);  // ❌ 删除此行
```

修改后的代码（L174-200）应为：

```typescript
if (videos.length === 1) {
  params.filePath = videos[0].path;
  const result = await window.motionSlice.analyzeSlices(params);
  sliceStore.setPreviewSlices(result.segments);
  // 不操作 batchSliceGroups（已删除越界调用）

  // 自动创建导出任务
  if (result.segments.length > 0) {
    const task: ExportTask = {
      id: `export-${Date.now()}`,
      toolId: 'slicer',
      title: '视频切片导出',
      summary: `共 ${result.segments.length} 个片段`,
      status: 'pending',
      payload: {
        sourceFilePath: videos[0].path,
        segments: result.segments.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label
        }))
      },
      createdAt: Date.now()
    };
    exportStore.upsertTask(task);
  }
}
```

- [ ] **步骤 2：验证语法无误**

运行：`npm run lint`
预期：无错误

- [ ] **步骤 3：Commit ToolSlicer 修复**

```bash
git add src/components/tools/ToolSlicer.vue
git commit -m "fix(切片): 删除单选模式越界操作 setBatchSliceGroups"
```

---

### 任务 9：手动测试 - 单选模式切换

**文件：**
- 无修改，纯测试

- [ ] **步骤 1：启动开发服务器**

运行：`npm start`
预期：应用正常启动

- [ ] **步骤 2：导入测试视频并执行单选切换测试**

测试步骤：
1. 导入至少 2 个视频文件（视频 A、视频 B）
2. 点击选择视频 A（整行点击）
3. 在工具箱中选择"切片工具"
4. 设置参数（如按时长 30 秒）并点击"生成切片预览"
5. 观察工作台切片列表、时间轴、导出面板显示视频 A 的 N 个切片
6. 点击选择视频 B（整行点击）

**预期结果：**
- 工作台切片列表完全清空（显示"暂无切片"）
- 时间轴切片轨完全清空
- 导出面板任务队列完全清空
- 控制台输出：`[VideoStore] 已清理单选视频 <视频A名称> 的派生数据`
- 控制台输出：`[ExportStore] 已移除 1 个任务 (toolId=slicer, source=<视频A路径>)`

- [ ] **步骤 3：记录测试结果**

在终端输出截图或日志中确认：
- 无孤儿状态残留
- 清理日志正确输出

---

### 任务 10：手动测试 - 批量模式取消勾选

**文件：**
- 无修改，纯测试

- [ ] **步骤 1：执行批量模式取消勾选测试**

测试步骤：
1. 清空所有选择（点击空白区域）
2. 勾选视频 A、B、C 的复选框（进入批量模式）
3. 在工具箱中选择"切片工具"
4. 设置参数并点击"应用规则并批量扫描"
5. 观察工作台显示 A、B、C 三个视频的批量切片组
6. 取消勾选视频 B 的复选框

**预期结果：**
- 工作台批量切片组中视频 B 的节点消失
- 导出面板中视频 B 的导出任务消失
- 只剩下视频 A 和 C 的数据
- 控制台输出：`[VideoStore] 取消勾选视频 <视频B名称>，已清理批量数据`

- [ ] **步骤 2：记录测试结果**

确认批量切片组和导出队列中不再包含视频 B 的数据。

---

### 任务 11：手动测试 - 模式切换（单选 → 批量）

**文件：**
- 无修改，纯测试

- [ ] **步骤 1：执行单选到批量模式切换测试**

测试步骤：
1. 清空所有选择
2. 点击选择视频 A（单选模式）
3. 生成切片预览（5 个片段）
4. 观察工作台、时间轴、导出面板显示单选数据
5. 勾选视频 B 的复选框（切换到批量模式）

**预期结果：**
- 单选轨数据完全清空（工作台切片列表、时间轴、导出面板）
- 批量轨为空状态（尚未生成批量切片）
- 控制台输出：`[VideoStore] 已清理单选视频 <视频A名称> 的派生数据`

- [ ] **步骤 2：记录测试结果**

确认模式切换时单选数据被正确清理。

---

### 任务 12：手动测试 - 模式切换（批量 → 单选）

**文件：**
- 无修改，纯测试

- [ ] **步骤 1：执行批量到单选模式切换测试**

测试步骤：
1. 清空所有选择
2. 勾选视频 A、B、C（批量模式）
3. 生成批量切片
4. 观察工作台显示批量切片组
5. 点击视频 D（整行点击，切换到单选模式）

**预期结果：**
- 批量切片组完全清空
- 导出队列清空（批量任务消失）
- 工作台显示单选模式空状态（尚未生成切片）
- 控制台输出：`[VideoStore] 已清理批量模式数据`

- [ ] **步骤 2：记录测试结果**

确认批量数据被正确清理。

---

### 任务 13：靶向清理验证（扩展性测试）

**文件：**
- 无修改，纯验证

- [ ] **步骤 1：模拟多工具任务共存场景**

测试步骤：
1. 单选视频 A，生成切片任务（toolId='slicer'）
2. 在控制台手动添加一个假的转换任务：
   ```javascript
   const { useExportStore } = await import('./store/useExportStore');
   const exportStore = useExportStore();
   exportStore.upsertTask({
     id: 'test-converter-1',
     toolId: 'converter',
     title: '格式转换任务',
     summary: 'MP4 → AVI',
     status: 'pending',
     payload: { sourceFilePath: '<视频A路径>', format: 'avi' },
     createdAt: Date.now()
   });
   ```
3. 观察导出面板显示 2 个任务（slicer + converter）
4. 切换到视频 B

**预期结果：**
- slicer 任务被移除（toolId 和 sourceFilePath 匹配）
- converter 任务保留（toolId 不匹配，被保护）
- 控制台输出：`[ExportStore] 已移除 1 个任务 (toolId=slicer, source=<视频A路径>)`

- [ ] **步骤 2：记录靶向清理验证结果**

确认靶向清理策略正确保护了其他工具的任务。

---

### 任务 14：最终验证与提交

**文件：**
- 无修改，最终验证

- [ ] **步骤 1：完整回归测试**

重复执行任务 9-13 的所有测试场景，确认：
- ✅ 单选切换无孤儿状态
- ✅ 批量取消勾选无孤儿状态
- ✅ 单选 → 批量切换无孤儿状态
- ✅ 批量 → 单选切换无孤儿状态
- ✅ 靶向清理保护其他工具任务

- [ ] **步骤 2：检查代码质量**

运行：`npm run lint`
预期：无警告或错误

- [ ] **步骤 3：创建最终 commit**

```bash
git add -A
git commit -m "feat(状态): 实现动作驱动清理架构，消除孤儿状态残留

- 重构 VideoStore Actions 实现同步清理
- 新增 ExportStore 靶向清理方法
- 移除失效的 watch 逻辑
- 修复 ToolSlicer 越界操作
- 严格双轨隔离：单选/批量模式数据完全独立

Closes #<issue-number>
"
```

- [ ] **步骤 4：标记实现完成**

在规格文档 `docs/superpowers/specs/2026-06-14-action-driven-state-cleanup-design.md` 中更新实现清单：

```markdown
## 实现清单

- [x] 设计架构方案
- [x] 重构 `useVideoStore.ts` Actions
- [x] 新增 `useExportStore.ts` 靶向清理方法
- [x] 修复 `ToolSlicer.vue` 越界操作
- [x] 删除 `useVideoStore.ts` watch 逻辑
- [x] 手动测试所有场景
- [x] 验证无孤儿状态残留
- [x] 提交代码
```

---

## 规格覆盖度检查

✅ **问题背景** - 已覆盖：通过任务 1-8 修复所有诊断出的缺陷  
✅ **设计方案** - 已覆盖：严格遵循架构实现章节的代码示例  
✅ **VideoStore Actions 改造** - 已覆盖：任务 3-7 重构所有 Actions  
✅ **ExportStore 新增方法** - 已覆盖：任务 1 实现靶向清理  
✅ **ToolSlicer 修复** - 已覆盖：任务 8 删除越界操作  
✅ **移除 watch** - 已覆盖：任务 7 删除 watch 逻辑  
✅ **测试验证场景** - 已覆盖：任务 9-13 涵盖所有测试场景  

---

## 架构收益（重申）

1. **确定性**：清理逻辑在同步执行栈中完成，无异步时序问题
2. **可维护性**：清理逻辑集中在 Actions 中，易于追踪和调试
3. **可扩展性**：靶向清理策略支持未来多工具并存
4. **双轨隔离**：单选/批量模式数据完全独立，无交叉污染
5. **无冗余数据**：所见即所得，未选中的视频绝无内存或 UI 痕迹
