# 元数据前置水合架构修复

> **状态：✅ 已完成** | 日期：2026-06-13

---

## 问题诊断

### Bug 1: 列表时长闪烁（Lazy Loading 陷阱）
**表现：** 刚导入视频时，列表显示的时长不准确（随机假数据）。只有当用户点击该视频行触发聚焦后，列表的时长才会突然更新为真实值，导致 UI 闪烁。

**截图示意：**
```
导入后立即：
  video1.mp4  00:02:45  1920x1080  (假数据)
  
点击后：
  video1.mp4  00:08:32  3840x2160  (真实数据，突变闪烁)
```

---

### Bug 2: 批量模式属性面板空白（Hydration 断层）
**表现：** 多选批量模式下，如果某个视频没有被用户单独点击过，右侧【属性】面板中关于它的高级信息（帧率、编码、码率等）全部显示为 `--`（缺省值）。

**截图示意：**
```
批量选中 3 个视频：
  - video1.mp4(被点击过) → 属性面板完整显示
  - video2.mp4 (未点击过)  → 帧率: --, 编码: --, 码率: --
  - video3.mp4 (未点击过)  → 帧率: --, 编码: --, 码率: --
```

---

## 根因分析

### 架构缺陷：懒加载（Lazy Loading）时机错误

**原有流程：**
```
用户导入文件
  ↓
dialog-handler.ts: scanVideoFiles() (同步快速扫描)
  ↓
video-scanner.ts: generateMockMetadata() (随机假数据)
  ↓
渲染进程显示列表 (假时长、假分辨率)
  ↓
用户点击某个视频
  ↓
FileTreeItem.vue: handleNodeClick()
  ↓
videoStore.setActiveVideo()
  ↓
videoStore.loadVideoMetadata() (调用 ffprobe 真实解析)
  ↓
Object.assign(target.metadata, deepMetadata) (覆盖更新)
  ↓
UI 突然刷新 (时长从 00:02:45 跳到 00:08:32)
```

**关键问题：**
1. **单一事实来源被打破**：metadata 有两个数据源（假数据 + 真实数据），违反 Single Source of Truth
2. **懒加载触发点错误**：元数据解析被绑定在"点击事件"上，而不是"导入生命周期"
3. **批量模式盲区**：多选时只有 `focusedVideo` 会触发解析，其他视频永远停留在假数据状态

---

## 修复方案：前置水合（Eager Hydration）

### 新架构：导入时统一解析

```
用户导入文件
  ↓
dialog-handler.ts: scanVideoFilesAsync() (异步扫描 + 水合)
  ↓
video-scanner.ts:
  阶段1: scanDirectoryRecursive() (同步快速扫描文件结构)
  阶段2: hydrateMetadata() (并发异步解析元数据)
    ↓
    Promise.allSettled([
      parseVideoMetadata(video1.path),
      parseVideoMetadata(video2.path),
      parseVideoMetadata(video3.path),
      ...
    ])
    ↓
    回填完整元数据到节点引用
  ↓
渲染进程显示列表 (真实时长、真实分辨率，无闪烁)
  ↓
用户点击视频 / 多选批量
  ↓
属性面板直接读取 metadata (已经完整)
```

**核心改进：**
- **单一数据源**：metadata 只有一个来源（导入时解析）
- **前置异步解析**：导入流程统一负责元数据水合，点击事件只负责切换状态
- **并发性能优化**：使用 `Promise.allSettled` 并发解析所有视频，单个失败不影响全局

---

## 代码修改清单

### 1. `metadata-handler.ts` - 导出解析函数

**修改：** 将 `parseVideoMetadata` 从私有函数改为导出函数

```typescript
// ❌ 修改前
async function parseVideoMetadata(filePath: string): Promise<VideoMetadata> {

// ✅ 修改后
export async function parseVideoMetadata(filePath: string): Promise<VideoMetadata> {
```

**原因：** 供其他模块（video-scanner）调用

---

### 2. `video-scanner.ts` - 实现前置水合

**修改 1：移除假数据生成器**
```typescript
// ❌ 删除
function generateMockMetadata(filePath: string): VideoMetadata {
  const durations = ['00:01:23', '00:05:12', '00:02:45'];
  // ... 随机选择
}
```

**修改 2：扫描时占位，稍后填充**
```typescript
// 文件节点先返回不带元数据的结构
return {
  id: dirPath,
  name,
  path: dirPath,
  type: 'file',
  metadata: undefined, // 占位，等待后续填充
};
```

**新增：并发水合函数**
```typescript
async function hydrateMetadata(fileTree: FileNode[]): Promise<void> {
  const videoNodes = collectVideoNodes(fileTree);
  console.log(`发现 ${videoNodes.length} 个视频，启动并发解析`);

  await Promise.allSettled(
    videoNodes.map(async (node) => {
      try {
        const metadata = await parseVideoMetadata(node.path);
        node.metadata = metadata; // 直接修改引用回填
        console.log(`✅ ${node.name} 解析完成`);
      } catch (error) {
        console.error(`❌ ${node.name} 解析失败:`, error);
        // 解析失败时保留基础占位符，避免 UI 崩溃
        node.metadata = {
          size: '-- MB',
          duration: '--:--:--',
          resolution: '--',
        };
      }
    })
  );
}
```

**新增：异步扫描接口**
```typescript
export async function scanVideoFilesAsync(paths: string[]): Promise<FileNode[]> {
  // 阶段 1: 同步快速扫描文件树结构
  const results: FileNode[] = [];
  for (const filePath of paths) {
    const node = scanDirectoryRecursive(filePath);
    if (node) {
      const prunedNode = pruneEmptyDirectories(node);
      if (prunedNode) results.push(prunedNode);
    }
  }

  // 阶段 2: 异步并发解析元数据（前置水合）
  await hydrateMetadata(results);

  return results;
}
```

---

### 3. `dialog-handler.ts` - 使用异步扫描

**修改前：**
```typescript
const fileTree = scanVideoFiles(result.filePaths); // 同步，返回假数据
```

**修改后：**
```typescript
const fileTree = await scanVideoFilesAsync(result.filePaths); // 异步，真实元数据
```

**影响范围：**
- `dialog:select-media` handler
- `dialog:select-media-with-filter` handler

---

### 4. `useVideoStore.ts` - 移除懒加载逻辑

**删除 1：`loadVideoMetadata()` 函数**
```typescript
// ❌ 删除整个函数（30 行代码）
async function loadVideoMetadata(video: FileNode) {
  isFetchingMetadata.value = true;
  try {
    const deepMetadata = await window.motionSlice.getVideoMetadata(video.path);
    const target = selectedVideos.value.find(v => v.id === video.id);
    if (target) {
      Object.assign(target, { metadata: { ...target.metadata, ...deepMetadata } });
      // ...
    }
  } finally {
    isFetchingMetadata.value = false;
  }
}
```

**修改 2：简化状态设置函数**
```typescript
// ❌ 修改前
async function setActiveVideo(video: FileNode | null) {
  selectedVideos.value = [video];
  await loadVideoMetadata(video); // 懒加载
}

// ✅ 修改后
async function setActiveVideo(video: FileNode | null) {
  selectedVideos.value = [video];
  // 元数据已在导入时预加载，直接使用
  if (video.metadata?.duration) {
    setDuration(parseTimecode(video.metadata.duration));
  }
}
```

**同理修改：** `setSelectedVideos()` 函数

---

## 验收标准

### 功能验收
- [x] **导入即准确**：导入视频后，列表立即显示真实时长、分辨率，无占位符
- [x] **点击无闪烁**：点击视频行时，列表信息不发生任何变化（已经是真实数据）
- [x] **批量属性完整**：多选 3 个视频（一个都不点击），属性面板显示所有视频的完整元数据
- [x] **并发不阻塞**：导入 10 个视频时，后台并发解析，不卡死主线程

### 性能验收
- [x] **并发解析**：使用 `Promise.allSettled` 而非串行，10 个视频解析时间 ≈ 单个最慢视频的时间
- [x] **容错健壮**：单个视频解析失败（损坏文件）不影响其他视频的导入
- [x] **日志完整**：控制台清晰显示每个视频的解析状态（✅ 成功 / ❌ 失败）

---

## 架构收益

### 1. 单一事实来源（Single Source of Truth）
- **修复前**：metadata 有两个数据源（假数据 + 懒加载真数据），导致状态不一致
- **修复后**：metadata 只有一个来源（导入时解析），保证数据一致性

### 2. 职责分离（Separation of Concerns）
- **修复前**：点击事件既负责切换状态，又负责触发元数据解析（职责混淆）
- **修复后**：导入流程负责数据加载，点击事件纯粹负责状态切换（清晰分工）

### 3. 用户体验提升
- **消除闪烁**：导入后列表数据立即准确，点击无突变
- **批量可用**：多选模式下所有视频属性完整，无需逐个点击"激活"
- **感知速度**：虽然导入时间略长（真实解析），但用户感知为"正在加载"，而非"数据错误后更正"

### 4. 可维护性
- **代码减少**：删除 `loadVideoMetadata()` 和相关调用（~40 行代码）
- **逻辑简化**：视频选择不再触发副作用（异步元数据加载），纯同步状态切换

---

## 后续优化方向

### 1. 渐进式加载（Progressive Loading）
**场景：** 导入 100 个视频时，全部解析完才显示列表，用户等待时间较长

**优化方案：**
- 解析完一个视频，立即更新列表（增量渲染）
- 使用 IPC 进度事件流式传输解析进度

**实现参考：**
```typescript
// 主进程：边解析边通知
for (const videoNode of videoNodes) {
  const metadata = await parseVideoMetadata(videoNode.path);
  event.sender.send('import:metadata-ready', { id: videoNode.id, metadata });
}

// 渲染进程：实时更新列表
window.motionSlice.onImportMetadataReady((data) => {
  const node = findNodeById(data.id);
  node.metadata = data.metadata;
});
```

### 2. 元数据缓存（Metadata Cache）
**场景：** 用户重复导入同一视频，每次都重新解析浪费时间

**优化方案：**
- 使用文件路径 + 修改时间 (mtime) 作为缓存 key
- 在主进程维护 LRU 缓存（最近 100 个视频元数据）

**实现参考：**
```typescript
const metadataCache = new Map<string, { mtime: number, metadata: VideoMetadata }>();

function getCacheKey(filePath: string): string {
  const stats = fs.statSync(filePath);
  return `${filePath}:${stats.mtimeMs}`;
}
```

### 3. 缩略图预生成（Thumbnail Preload）
**扩展：** 在解析元数据的同时，生成视频缩略图（首帧截图）

**收益：** 列表显示视频预览图，进一步提升专业感

---

## 技术参考

### W3C Media Fragments URI
用于视频精确 Seek，已在预览播放器中使用：
```html
<source :src="`file://${videoPath}#t=${startTime}`" type="video/mp4">
```

### Promise.allSettled vs Promise.all
- `Promise.all`：任一 Promise reject 则整体 reject（不适合批量解析）
- `Promise.allSettled`：等待所有 Promise settled，区分成功/失败（适合容错场景）

### Vue 3 响应式陷阱
- `ref(new Map())`：Map.set() 不触发响应式
- `reactive<Record<string, T>>({})`：对象属性赋值触发响应式

---

**文档版本：** v1.0  
**最后更新：** 2026-06-13  
**维护者：** MotionSlice 开发团队
