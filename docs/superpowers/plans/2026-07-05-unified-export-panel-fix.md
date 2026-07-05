# 统一导出面板 Bug 修复与优化记录

> 本文档记录了统一导出面板重构后的所有 Bug 修复与 UI 优化

**文档状态：** ✅ 已完成并验证

---

## 修复清单总览

| 序号 | 问题 | 状态 | 文件 |
|------|------|------|------|
| 1 | 单选模式切片列表不展开 | ✅ 已修复 | ExportTab.vue |
| 2 | 导出进度不同步 | ✅ 已修复 | App.vue |
| 3 | 微观进度显示冗余 | ✅ 已优化 | ExportTab.vue |
| 4 | 部分失败时状态覆写错误 | ✅ 已修复 | ExportTab.vue |
| 5 | 失败状态文字颜色层级错误 | ✅ 已优化 | ExportTab.vue |
| 6 | 只读状态赋值警告 | ✅ 已修复 | ExportTab.vue |
| 7 | 错误日志信息不完整 | ✅ 已优化 | ExportTab.vue |
| 8 | 批量导出循环中断问题 | ✅ 已修复 | export-handler.ts |

---

## Bug 1：单选模式切片列表不展开

### 问题描述
单选模式生成 9 个切片后，导出面板只显示 1 个任务（"视频切片导出"），而不是 9 个独立的切片列表项。

### 根本原因
`ExportTab.vue` 的 `exportTasks` 单选分支直接映射 `pendingTasks`（task 级别），没有展开 `task.payload.segments`（segment 级别）。

### 修复方案

**文件：** `src/components/ExportTab.vue`

**修改点 1：未开始导出时的切片展示（第 256-279 行）**

```typescript
// 修改前
return pendingTasks.value.map(task => {
  return {
    id: task.id,
    displayName: task.title,
    ...
  };
});

// 修改后
return pendingTasks.value.flatMap(task => {
  if (!task.payload?.segments || task.payload.segments.length === 0) {
    return [{ id: task.id, displayName: task.title, ... }];
  }
  
  // 展开 segments，每个切片作为独立列表项
  return task.payload.segments.map((segment, index) => ({
    id: `${task.id}-segment-${index}`,
    displayName: segment.label,
    fullPath: `${task.payload.sourceFilePath} - ${segment.label}`,
    parentPath: '',
    status: 'pending' as const,
    progress: 0
  }));
});
```

**修改点 2：导出执行时的队列初始化（第 438-457 行）**

```typescript
// 修改前
const taskIds = pendingTasks.value.map(t => t.id);
exportStore.initQueue(taskIds);
taskIds.forEach(taskId => exportStore.setQueueStatus(taskId, 'processing'));

// 修改后
if (pendingTasks.value.length > 0) {
  const task = pendingTasks.value[0];
  
  if (task.payload?.segments) {
    const queueItemsData = task.payload.segments.map((segment, index) => ({
      taskId: `${task.id}-segment-${index}`,
      title: segment.label,
      status: 'processing' as const,
      progress: 0,
      currentIndex: 0,
      totalCount: 1
    }));
    
    exportStore.$patch({ queueItems: queueItemsData });
  }
}
```

### 修复效果
- ✅ 单选模式：显示 9 个切片（"片段 1", "片段 2"...）
- ✅ 多选模式：显示 N 个切片（"视频名 - 片段名"）
- ✅ UI 统一性：两种模式都按切片粒度展示

---

## Bug 2：导出进度不同步

### 问题描述
主进程日志显示正在处理第 3 个切片，但前端 UI 显示总进度 `0/9`，所有切片状态停留在"处理中"。

### 根本原因
`App.vue` 中的进度监听器无法匹配到新的 segment 级别 taskId：
- 主进程发送：`taskId: 'slicer-G:\video.mov'`
- 前端期望：`taskId: 'slicer-G:\video.mov-segment-0'`

### 修复方案

**文件：** `src/App.vue` 第 42-80 行

```typescript
// 修改前：直接匹配 taskId（失败）
let matchingItem = exportStore.queueItems.find(
  item => item.taskId === event.taskId
);

// 修改后：根据 taskId 前缀 + current 索引构建完整 taskId
if (event.taskId.startsWith('slicer-')) {
  // 单选模式：找到当前正在处理的切片
  const segmentTaskId = `${event.taskId}-segment-${event.current - 1}`;
  const currentSegment = exportStore.queueItems.find(
    item => item.taskId === segmentTaskId
  );

  if (currentSegment) {
    // 标记当前切片为已完成
    currentSegment.status = 'success';
    currentSegment.progress = 100;

    // 如果还有下一个切片，标记为处理中
    if (event.current < event.total) {
      const nextSegmentTaskId = `${event.taskId}-segment-${event.current}`;
      const nextSegment = exportStore.queueItems.find(
        item => item.taskId === nextSegmentTaskId
      );
      if (nextSegment) {
        nextSegment.status = 'processing';
      }
    }
    return;
  }
}
```

### 修复效果
- ✅ 总进度实时更新：`0/9` → `1/9` → `2/9` ... → `9/9`
- ✅ 切片状态正确：已完成显示绿色，处理中高亮显示
- ✅ 当前处理提示：显示正在处理的切片名称

---

## 优化 3：移除冗余的微观进度显示

### 问题描述
"当前正在处理"的 UI 显示 `(0%)` 微观进度，由于底层进度回传延迟，显示 0% 导致用户误以为系统卡死。

### 优化方案

**文件：** `src/components/ExportTab.vue` 第 85-91 行

```vue
<!-- 修改前 -->
<p v-if="currentTask" class="current-task">
  当前正在处理: {{ currentTaskLabel }} ({{ currentTask.progress }}%)
</p>

<!-- 修改后 -->
<p
  v-if="currentTask"
  class="current-task"
  :title="`当前正在处理: ${currentTaskLabel}`"
>
  当前正在处理: {{ currentTaskLabel }}
</p>
```

### 优化效果
- ✅ 移除微观进度：不再显示 `(0%)`
- ✅ 添加悬浮提示：文件名过长时可查看完整路径
- ✅ 保留宏观进度：全局进度条 `总进度: X/9` 正常显示

---

## Bug 4：部分导出失败时状态被错误覆写

### 问题描述
导出 9 个切片时，前 3 个成功，第 4 个失败。底层正确报告片段 1-3 成功，但前端 `catch` 块无差别地将所有任务标记为"失败"。

### 修复方案

**文件：** `src/components/ExportTab.vue` 第 474-486 行

```typescript
// 修改前：无差别覆写所有状态
queueItems.value.forEach(item => {
  exportStore.setQueueStatus(item.taskId, 'failed');
});

// 修改后：只标记非成功状态为失败
queueItems.value.forEach(item => {
  if (item.status !== 'success') {
    exportStore.setQueueStatus(item.taskId, 'failed');
  }
});
```

### 修复效果
- ✅ 保留成功状态：已完成的切片显示绿色"已完成"
- ✅ 精准标记失败：只有未完成的切片标记为"失败"
- ✅ 用户友好：清楚看到哪些切片成功，哪些失败

---

## 优化 5：修复失败状态的文字颜色层级

### 问题描述
失败状态（`.task-item.failed`）将整个父元素的 `color` 设置为危险色，导致文件名变红，但状态文字因层级问题仍为灰色，造成视觉重点偏移。

### 优化方案

**文件：** `src/components/ExportTab.vue` 第 713-721 行

```css
/* 修改前 */
.task-item.failed {
  background: var(--vt-danger-soft);
  color: var(--vt-danger); /* ❌ 文件名变红，状态文字仍为灰色 */
}

/* 修改后 */
.task-item.failed {
  background: var(--vt-danger-soft);
  /* ✅ 移除 color，让文件名保持默认颜色 */
}

.task-item.failed .task-status {
  color: var(--vt-danger);
  font-weight: 600;
  /* ✅ 状态文字变红加粗，对齐 success 设计 */
}
```

### 优化效果
- ✅ 文件名：正常颜色（保持可读性）
- ✅ 状态文字："失败"显示为红色加粗
- ✅ 设计一致性：与成功状态（绿色加粗）对齐

---

## Bug 6：只读状态赋值警告

### 问题描述
控制台抛出警告：`Set operation on key "isExporting" failed: target is readonly.`

### 根本原因
`isExporting` 在 `useExportStore` 中是一个 computed 属性，由队列状态自动推导，不应被手动赋值：
```typescript
const isExporting = computed(() =>
  queueItems.value.some(item => item.status === 'processing')
);
```

### 修复方案

**文件：** `src/components/ExportTab.vue`

**删除的代码：**
```typescript
// 第 375 行 - 删除
isExporting.value = true;

// 第 487-488 行 - 删除整个 finally 块
} finally {
  isExporting.value = false;
}
```

### 修复效果
- ✅ 消除只读警告
- ✅ `isExporting` 完全由队列状态自动计算
- ✅ 状态管理更加可靠

---

## 优化 7：优化错误日志信息

### 问题描述
前端捕获的 error 只打印基础信息，缺少底层堆栈和上下文信息。

### 优化方案

**文件：** `src/components/ExportTab.vue` 第 474-486 行

```typescript
// 修改前
} catch (error) {
  console.error('[ExportTab] 导出失败:', error);
  // ...
}

// 修改后
} catch (error: any) {
  // 展开打印完整的 error 对象
  console.error('[ExportTab] 导出失败，拦截到的完整异常对象:', {
    message: error?.message,
    cause: error?.cause,
    details: error?.details,
    stack: error?.stack,
    rawError: error
  });
  // ...
}
```

### 优化效果
- ✅ 展开打印 `error.cause`、`error.details`、`error.stack`
- ✅ 保留完整的 `rawError` 对象用于深度调试
- ✅ 使用可选链 `?.` 避免访问不存在的属性报错

---

## Bug 8：批量导出循环中断问题（后端）

### 问题描述
多视频批量导出时，如果中间某个 task 抛出异常（例如源文件丢失），会直接中断整个 `for` 循环，导致后续视频被跳过。

### 根本原因
快速失败（Fail-Fast）模式：一个任务失败导致整个批量处理中断。

### 修复方案

**文件：** `src/main/handlers/export-handler.ts` 第 442-472 行

```typescript
// 修改前：Fail-Fast
for (const task of tasks) {
  await exportSlicerTask(task, ...); // 抛异常 → 循环中断
}

// 修改后：Fail-Safe
const batchErrors: string[] = [];

for (const task of tasks) {
  try {
    if (task.toolId === 'slicer') {
      await exportSlicerTask(task, outputDir, format, quality, mainWindow);
    } else {
      console.warn(`[ExportHandler] 未知工具类型: ${task.toolId}`);
      batchErrors.push(`任务 ${task.title || task.id} 失败: 未知工具类型 ${task.toolId}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ExportHandler] 任务 ${task.id} 导出失败:`, error);
    batchErrors.push(`${task.title || task.id} 失败: ${errorMessage}`);
    continue; // ✅ 继续处理下一个任务
  }
}

// 判断是否有失败任务
if (batchErrors.length > 0) {
  const errorSummary = batchErrors.map((err, index) => `  ${index + 1}. ${err}`).join('\n');
  return {
    success: false,
    error: `批量导出存在部分失败 (${batchErrors.length}/${tasks.length}):\n\n${errorSummary}`
  };
}

return { success: true };
```

### 修复效果
- ✅ 容错性提升：单个视频失败不影响其他视频
- ✅ 错误透明：清晰列出哪些任务失败及原因
- ✅ 状态保留：配合前端修复，成功的切片显示绿色"已完成"
- ✅ 用户友好：用户可以看到部分成功的结果

**错误报告格式：**
```
批量导出存在部分失败 (2/5):

  1. 视频A 切片导出 失败: 源文件不存在
  2. 视频C 切片导出 失败: 磁盘空间不足
```

---

## 测试验证清单

### 单选模式测试
- [x] 生成 9 个切片 → 导出面板显示 9 个独立列表项
- [x] 执行导出 → 进度实时更新（0/9 → 9/9）
- [x] 导出完成 → 显示"打开输出目录"按钮
- [x] 部分失败 → 成功的切片显示绿色，失败的显示红色

### 多选模式测试
- [x] 批量扫描 → 导出面板显示所有切片
- [x] 执行导出 → 进度实时更新
- [x] 单个视频失败 → 其他视频继续导出
- [x] 错误报告 → 清晰列出失败任务及原因

### 边界场景测试
- [x] 生成切片后切换视频 → 队列清空
- [x] 导出中切换视频 → 状态清理
- [x] 磁盘空间不足 → 错误提示正确
- [x] 拔出硬盘 → 部分成功的切片状态保留

---

## 总结

本次修复共涉及 **8 个问题**，包括：
- **前端修复：** 5 个（ExportTab.vue 4个 + App.vue 1个）
- **后端修复：** 1 个（export-handler.ts）
- **UI 优化：** 2 个（进度显示 + 失败状态样式）

**核心改进：**
1. ✅ 单选/多选模式 UI 完全统一（切片粒度展示）
2. ✅ 导出进度实时同步（taskId 匹配修复）
3. ✅ 批量导出容错能力（Fail-Safe 模式）
4. ✅ 状态管理正确性（只读属性 + 状态保留）
5. ✅ 错误日志完整性（展开打印 + 错误聚合）
6. ✅ UI 视觉一致性（失败状态样式对齐）

**用户体验提升：**
- 🎯 切片列表展示清晰直观
- 🎯 导出进度实时可见
- 🎯 错误信息准确详细
- 🎯 部分成功结果保留
- 🎯 批量处理稳定可靠

---

**文档更新时间：** 2026-07-05  
**状态：** ✅ 所有修复已完成并验证通过
