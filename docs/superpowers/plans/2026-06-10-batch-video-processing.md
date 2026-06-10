# 批量视频处理与导入过滤引擎 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为视频切分工具添加导入过滤引擎和多视频批量处理能力，支持文件大小/时长/格式过滤、多选状态管理、动态视图切换和批量切片预览。

**架构：** 在现有单选架构基础上升级为多选架构。Store 层将 `activeVideo` 扩展为 `selectedVideos` 数组；UI 层根据选择数量动态切换单选/批量模式；主进程增加 ffprobe 预过滤逻辑；右侧工作台支持批量切片的树形展示。

**技术栈：** Electron 42 + Vue 3 + Pinia + TypeScript + Vite + ffprobe-static

---

## 文件结构规划

### 新增文件

- `src/types/import-filter.ts` - 导入过滤配置类型定义
- `src/store/useImportFilterStore.ts` - 导入过滤偏好设置 Store
- `src/components/ImportFilterModal.vue` - 导入偏好设置弹窗组件
- `src/components/BatchVideoGrid.vue` - 批量模式数据表格组件
- `src/main/utils/import-filter.ts` - 主进程导入过滤逻辑
- `src/utils/multi-select.ts` - 前端多选辅助函数（Ctrl/Shift 支持）

### 修改文件

- `src/types/preload.d.ts` - 新增过滤相关 IPC 接口
- `src/preload.ts` - 暴露过滤配置和导入接口
- `src/main/handlers/dialog-handler.ts` - 集成过滤引擎到导入流程
- `src/store/useVideoStore.ts` - 重构为多选状态管理
- `src/store/file-tree.ts` - 支持多选节点
- `src/components/Sidebar.vue` - 添加偏好设置按钮和全选功能
- `src/components/FileTreeItem.vue` - 添加 Checkbox 和多选逻辑
- `src/App.vue` - 中心工作区动态视图切换
- `src/components/Inspector.vue` - 批量模式提示文案
- `src/components/tools/ToolSlicer.vue` - 批量切片树形预览
- `src/store/useSliceStore.ts` - 支持多视频切片数据结构

---

## 任务 1：导入过滤配置类型与 Store

**文件：**
- 创建：`src/types/import-filter.ts`
- 创建：`src/store/useImportFilterStore.ts`

- [x] **步骤 1：定义导入过滤配置类型**

```typescript
// src/types/import-filter.ts
export interface ImportFilterConfig {
  /** 是否启用文件大小过滤 */
  enableSizeFilter: boolean;
  /** 最小文件大小（MB） */
  minSizeMB: number;
  /** 最大文件大小（MB） */
  maxSizeMB: number;

  /** 是否启用视频时长过滤 */
  enableDurationFilter: boolean;
  /** 最小时长（秒） */
  minDurationSec: number;
  /** 最大时长（秒） */
  maxDurationSec: number;

  /** 是否启用格式过滤 */
  enableFormatFilter: boolean;
  /** 允许的视频格式（小写，不含点，如 'mp4', 'mov'） */
  allowedFormats: string[];
}

export interface ImportFilterResult {
  /** 通过过滤的文件列表 */
  acceptedFiles: string[];
  /** 被过滤掉的文件列表 */
  rejectedFiles: string[];
  /** 统计摘要 */
  summary: string;
}
```

- [x] **步骤 2：创建导入过滤 Store**

```typescript
// src/store/useImportFilterStore.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ImportFilterConfig } from '../types/import-filter';

export const useImportFilterStore = defineStore('importFilter', () => {
  const config = ref<ImportFilterConfig>({
    enableSizeFilter: false,
    minSizeMB: 1,
    maxSizeMB: 1000,
    enableDurationFilter: false,
    minDurationSec: 1,
    maxDurationSec: 3600,
    enableFormatFilter: true,
    allowedFormats: ['mp4', 'mov'],
  });

  function updateConfig(newConfig: Partial<ImportFilterConfig>) {
    config.value = { ...config.value, ...newConfig };
  }

  function resetConfig() {
    config.value = {
      enableSizeFilter: false,
      minSizeMB: 1,
      maxSizeMB: 1000,
      enableDurationFilter: false,
      minDurationSec: 1,
      maxDurationSec: 3600,
      enableFormatFilter: true,
      allowedFormats: ['mp4', 'mov'],
    };
  }

  return {
    config,
    updateConfig,
    resetConfig,
  };
});
```

---

## 任务 2：主进程导入过滤引擎

**文件：**
- 创建：`src/main/utils/import-filter.ts`
- 修改：`src/main/handlers/dialog-handler.ts`

- [x] **步骤 1：实现主进程过滤逻辑**

```typescript
// src/main/utils/import-filter.ts
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getFfprobePath } from './ffprobe-helper';
import type { ImportFilterConfig } from '../../types/import-filter';

export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath();
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ];

    const process = spawn(ffprobePath, args);
    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });

    process.on('error', reject);
  });
}

export async function filterVideoFiles(
  filePaths: string[],
  config: ImportFilterConfig
): Promise<{ accepted: string[]; rejected: string[] }> {
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const filePath of filePaths) {
    try {
      let shouldAccept = true;

      // 格式过滤
      if (config.enableFormatFilter) {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        if (!config.allowedFormats.includes(ext)) {
          shouldAccept = false;
        }
      }

      // 文件大小过滤
      if (shouldAccept && config.enableSizeFilter) {
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB < config.minSizeMB || sizeMB > config.maxSizeMB) {
          shouldAccept = false;
        }
      }

      // 视频时长过滤
      if (shouldAccept && config.enableDurationFilter) {
        const duration = await getVideoDuration(filePath);
        if (duration < config.minDurationSec || duration > config.maxDurationSec) {
          shouldAccept = false;
        }
      }

      if (shouldAccept) {
        accepted.push(filePath);
      } else {
        rejected.push(filePath);
      }
    } catch (error) {
      console.error(`过滤文件失败: ${filePath}`, error);
      rejected.push(filePath);
    }
  }

  return { accepted, rejected };
}
```

- [x] **步骤 2：集成过滤引擎到 dialog-handler**

在 `src/main/handlers/dialog-handler.ts` 中修改 `dialog:select-media` handler：

```typescript
import { filterVideoFiles } from '../utils/import-filter';
import type { ImportFilterConfig } from '../../types/import-filter';

// 新增 IPC handler：应用过滤配置导入
ipcMain.handle('dialog:select-media-with-filter', async (event, filterConfig: ImportFilterConfig) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: '选择视频文件或文件夹',
      buttonLabel: '导入',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { fileTree: [], summary: '' };
    }

    // 扫描文件树
    const fileTree = scanVideoFiles(result.filePaths);
    
    // 提取所有视频文件路径
    const allVideoPaths: string[] = [];
    function collectVideos(nodes: FileNode[]) {
      for (const node of nodes) {
        if (node.type === 'file') {
          allVideoPaths.push(node.path);
        } else if (node.children) {
          collectVideos(node.children);
        }
      }
    }
    collectVideos(fileTree);

    // 应用过滤
    const { accepted, rejected } = await filterVideoFiles(allVideoPaths, filterConfig);
    
    // 重新构建过滤后的文件树
    const acceptedSet = new Set(accepted);
    function filterTree(nodes: FileNode[]): FileNode[] {
      return nodes
        .map(node => {
          if (node.type === 'file') {
            return acceptedSet.has(node.path) ? node : null;
          } else if (node.children) {
            const filteredChildren = filterTree(node.children);
            return filteredChildren.length > 0 ? { ...node, children: filteredChildren } : null;
          }
          return null;
        })
        .filter((node): node is FileNode => node !== null);
    }

    const filteredTree = filterTree(fileTree);
    const summary = `成功导入 ${accepted.length} 个视频，按规则过滤掉 ${rejected.length} 个`;

    return { fileTree: filteredTree, summary };
  } catch (error) {
    console.error('[Dialog Handler] 文件选择失败:', error);
    throw new Error('文件选择失败，请重试');
  }
});
```

---

## 任务 3：Preload 桥接

**文件：**
- 修改：`src/types/preload.d.ts`
- 修改：`src/preload.ts`

- [x] **步骤 1：更新 preload 类型定义**

在 `src/types/preload.d.ts` 中添加新接口：

```typescript
import { ImportFilterConfig } from './import-filter';

// 在 Window.motionSlice 接口中添加
selectMediaFilesWithFilter: (config: ImportFilterConfig) => Promise<{
  fileTree: FileNode[];
  summary: string;
}>;
```

- [x] **步骤 2：在 preload.ts 中暴露新接口**

在 `src/preload.ts` 的 `contextBridge.exposeInMainWorld` 中添加：

```typescript
selectMediaFilesWithFilter: (config: ImportFilterConfig) => 
  ipcRenderer.invoke('dialog:select-media-with-filter', config),
```

---

## 任务 4：导入偏好设置弹窗组件（第1部分）

**文件：**
- 创建：`src/components/ImportFilterModal.vue`

- [x] **步骤 1：创建弹窗组件模板**

创建文件 `src/components/ImportFilterModal.vue`，内容如下（分3部分）：

```vue
<!-- 第1部分：模板 - 文件大小和时长过滤 -->
<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h2 class="modal-title">导入偏好设置</h2>
        <button class="modal-close" @click="handleClose">×</button>
      </div>

      <div class="modal-body">
        <div class="filter-section">
          <label class="filter-toggle">
            <input type="checkbox" v-model="localConfig.enableSizeFilter" class="vt-switch"/>
            <span>文件大小限制</span>
          </label>
          <div v-if="localConfig.enableSizeFilter" class="filter-inputs">
            <div class="input-row">
              <label>最小 (MB)</label>
              <input type="number" v-model.number="localConfig.minSizeMB" min="1" class="vt-input"/>
            </div>
            <div class="input-row">
              <label>最大 (MB)</label>
              <input type="number" v-model.number="localConfig.maxSizeMB" min="1" class="vt-input"/>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-toggle">
            <input type="checkbox" v-model="localConfig.enableDurationFilter" class="vt-switch"/>
            <span>视频时长限制</span>
          </label>
          <div v-if="localConfig.enableDurationFilter" class="filter-inputs">
            <div class="input-row">
              <label>最小 (秒)</label>
              <input type="number" v-model.number="localConfig.minDurationSec" min="1" class="vt-input"/>
            </div>
            <div class="input-row">
              <label>最大 (秒)</label>
              <input type="number" v-model.number="localConfig.maxDurationSec" min="1" class="vt-input"/>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-toggle">
            <input type="checkbox" v-model="localConfig.enableFormatFilter" class="vt-switch"/>
            <span>支持格式</span>
          </label>
          <div v-if="localConfig.enableFormatFilter" class="format-checkboxes">
            <label v-for="fmt in availableFormats" :key="fmt" class="format-checkbox">
              <input type="checkbox" :value="fmt" v-model="localConfig.allowedFormats"/>
              <span>{{ fmt.toUpperCase() }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="vt-button-ghost" @click="handleReset">重置</button>
        <button class="vt-button-primary" @click="handleSave">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useImportFilterStore } from '../store/useImportFilterStore';
import type { ImportFilterConfig } from '../types/import-filter';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; save: [config: ImportFilterConfig] }>();

const filterStore = useImportFilterStore();
const { config } = storeToRefs(filterStore);
const availableFormats = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
const localConfig = ref<ImportFilterConfig>({ ...config.value });

watch(() => props.visible, (v) => { if (v) localConfig.value = { ...config.value }; });

function handleClose() { emit('close'); }
function handleSave() { filterStore.updateConfig(localConfig.value); emit('save', localConfig.value); emit('close'); }
function handleReset() { filterStore.resetConfig(); localConfig.value = { ...config.value }; }
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-container { width: 480px; background: var(--vt-bg-elevated); border: 1px solid var(--vt-border-strong); border-radius: var(--vt-radius-xl); max-height: 80vh; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: var(--vt-space-4); border-bottom: 1px solid var(--vt-border); }
.modal-title { font-size: 16px; font-weight: 600; margin: 0; }
.modal-close { width: 32px; height: 32px; border: none; background: transparent; font-size: 24px; cursor: pointer; }
.modal-body { flex: 1; padding: var(--vt-space-4); overflow-y: auto; display: flex; flex-direction: column; gap: var(--vt-space-4); }
.filter-section { display: flex; flex-direction: column; gap: var(--vt-space-3); padding: var(--vt-space-4); background: var(--vt-bg-soft); border: 1px solid var(--vt-border); border-radius: var(--vt-radius-lg); }
.filter-toggle { display: flex; align-items: center; gap: var(--vt-space-3); font-size: 14px; font-weight: 500; cursor: pointer; }
.filter-inputs { display: flex; flex-direction: column; gap: var(--vt-space-3); padding-left: var(--vt-space-8); }
.input-row { display: flex; align-items: center; gap: var(--vt-space-3); }
.input-row label { flex: 0 0 80px; font-size: 13px; }
.format-checkboxes { display: flex; flex-wrap: wrap; gap: var(--vt-space-3); padding-left: var(--vt-space-8); }
.format-checkbox { display: flex; align-items: center; gap: var(--vt-space-2); font-size: 13px; cursor: pointer; }
.modal-footer { display: flex; justify-content: flex-end; gap: var(--vt-space-3); padding: var(--vt-space-4); border-top: 1px solid var(--vt-border); }
</style>
```

---

## 任务 6：Sidebar 集成偏好设置按钮

**文件：**
- 修改：`src/components/Sidebar.vue`

- [x] **步骤 1：在 Sidebar.vue 添加偏好设置按钮和弹窗**

在 `<template>` 的 panel-header 中，修改为：

```vue
<div class="panel-header">
  <h2 class="vt-title">文件列表</h2>
  <div class="header-actions">
    <button class="vt-button-icon" @click="showFilterModal = true" title="导入偏好设置">
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M2 4h4M10 4h4M2 8h4M10 8h4M2 12h4M10 12h4M6 2v4M12 6v4M6 10v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="vt-button-ghost import-button" @click="handleImport">
      <svg class="import-icon" width="16" height="16" viewBox="0 0 16 16">
        <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      导入
    </button>
  </div>
</div>

<!-- 在 template 末尾添加弹窗 -->
<ImportFilterModal :visible="showFilterModal" @close="showFilterModal = false" @save="handleFilterSave" />
```

- [x] **步骤 2：添加弹窗逻辑和导入过滤**

在 `<script setup>` 中添加：

```typescript
import { ref } from 'vue';
import ImportFilterModal from './ImportFilterModal.vue';
import { useImportFilterStore } from '../store/useImportFilterStore';
import type { ImportFilterConfig } from '../types/import-filter';

const showFilterModal = ref(false);
const filterStore = useImportFilterStore();

async function handleImport() {
  try {
    const result = await window.motionSlice.selectMediaFilesWithFilter(filterStore.config);
    fileTreeStore.roots = result.fileTree;
    if (result.summary) {
      console.log(result.summary);
      // TODO: 显示 Toast 提示
    }
  } catch (error) {
    console.error('导入文件失败:', error);
  }
}

function handleFilterSave(config: ImportFilterConfig) {
  console.log('过滤配置已保存:', config);
}
```

- [x] **步骤 3：添加按钮样式**

在 `<style scoped>` 中添加：

```css
.header-actions {
  display: flex;
  gap: var(--vt-space-2);
  align-items: center;
}

.vt-button-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  background: transparent;
  color: var(--vt-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 180ms ease;
}

.vt-button-icon:hover {
  background: var(--vt-bg-soft);
  border-color: var(--vt-border-strong);
  color: var(--vt-text);
}
```

---


## 任务 7：重构 VideoStore 支持多选

**文件：**
- 修改：`src/store/useVideoStore.ts`

- [x] **步骤 1：将 activeVideo 改为 selectedVideos 数组**

修改 `src/store/useVideoStore.ts`：

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FileNode } from '../types/file-tree';
import { parseTimecode } from '../utils/timeFormat';

export const useVideoStore = defineStore('video', () => {
  // 多选状态：选中的视频列表
  const selectedVideos = ref<FileNode[]>([]);
  
  // 向后兼容：单选模式下的激活视频
  const activeVideo = computed(() => 
    selectedVideos.value.length === 1 ? selectedVideos.value[0] : null
  );

  const isFetchingMetadata = ref(false);
  const currentTime = ref<number>(0);
  const duration = ref<number>(0);

  // 单选模式：设置单个视频（兼容旧逻辑）
  async function setActiveVideo(video: FileNode | null) {
    if (!video) {
      selectedVideos.value = [];
      return;
    }
    selectedVideos.value = [video];
    await loadVideoMetadata(video);
  }

  // 多选模式：设置多个视频
  function setSelectedVideos(videos: FileNode[]) {
    selectedVideos.value = videos;
    // 批量模式下不自动加载元数据
    if (videos.length === 1) {
      loadVideoMetadata(videos[0]);
    }
  }

  // 切换选中状态（用于 Ctrl/Shift 多选）
  function toggleVideoSelection(video: FileNode) {
    const index = selectedVideos.value.findIndex(v => v.id === video.id);
    if (index >= 0) {
      selectedVideos.value.splice(index, 1);
    } else {
      selectedVideos.value.push(video);
    }
  }

  // 私有：加载元数据
  async function loadVideoMetadata(video: FileNode) {
    if (!video || video.type !== 'file') return;
    
    isFetchingMetadata.value = true;
    try {
      const deepMetadata = await window.motionSlice.getVideoMetadata(video.path);
      const target = selectedVideos.value.find(v => v.id === video.id);
      if (target) {
        Object.assign(target, {
          metadata: { ...target.metadata, ...deepMetadata }
        });
        if (deepMetadata.duration) {
          setDuration(parseTimecode(deepMetadata.duration));
        }
      }
    } catch (error) {
      console.error('加载元数据失败:', error);
    } finally {
      isFetchingMetadata.value = false;
    }
  }

  function clearActiveVideo() {
    selectedVideos.value = [];
    currentTime.value = 0;
    duration.value = 0;
  }

  function setCurrentTime(time: number) {
    currentTime.value = Math.max(0, Math.min(time, duration.value));
  }

  function setDuration(dur: number) {
    duration.value = Math.max(0, dur);
    if (currentTime.value > duration.value) {
      currentTime.value = duration.value;
    }
  }

  return {
    selectedVideos,
    activeVideo,
    isFetchingMetadata,
    currentTime,
    duration,
    setActiveVideo,
    setSelectedVideos,
    toggleVideoSelection,
    clearActiveVideo,
    setCurrentTime,
    setDuration,
  };
});
```

---

## 任务 8：FileTreeItem 支持多选

**文件：**
- 修改：`src/components/FileTreeItem.vue`
- 创建：`src/utils/multi-select.ts`

- [x] **步骤 1：创建多选辅助函数**

```typescript
// src/utils/multi-select.ts
export interface MultiSelectHandler {
  handleClick: (event: MouseEvent, itemId: string) => string[];
}

export function createMultiSelectHandler(
  allItems: string[],
  selectedItems: string[]
): MultiSelectHandler {
  let lastClickedId: string | null = null;

  return {
    handleClick(event: MouseEvent, itemId: string): string[] {
      // Ctrl/Cmd: 切换单个选中
      if (event.ctrlKey || event.metaKey) {
        const index = selectedItems.indexOf(itemId);
        if (index >= 0) {
          return selectedItems.filter(id => id !== itemId);
        } else {
          return [...selectedItems, itemId];
        }
      }

      // Shift: 范围选择
      if (event.shiftKey && lastClickedId && selectedItems.length > 0) {
        const lastIndex = allItems.indexOf(lastClickedId);
        const currentIndex = allItems.indexOf(itemId);
        if (lastIndex >= 0 && currentIndex >= 0) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          return allItems.slice(start, end + 1);
        }
      }

      // 普通点击：单选
      lastClickedId = itemId;
      return [itemId];
    }
  };
}
```

- [x] **步骤 2：在 FileTreeItem 添加 Checkbox**

修改 `src/components/FileTreeItem.vue` 的模板：

```vue
<div class="tree-node" @click="handleNodeClick($event)">
  <!-- 文件类型：添加 Checkbox -->
  <input 
    v-if="node.type === 'file'" 
    type="checkbox" 
    :checked="isSelected"
    @click.stop="handleCheckboxClick"
    class="tree-checkbox"
  />
  
  <!-- 文件夹箭头图标 -->
  <svg v-if="node.type === 'directory'" ...>
  <!-- 其他图标保持不变 -->
</div>
```

- [x] **步骤 3：更新点击逻辑支持多选**

在 `<script setup>` 中修改：

```typescript
const videoStore = useVideoStore();

const isSelected = computed(() => {
  return props.node.type === 'file' && 
         videoStore.selectedVideos.some(v => v.id === props.node.id);
});

function handleNodeClick(event: MouseEvent) {
  if (props.node.type === 'directory') {
    fileTreeStore.toggleDirectory(props.node.id);
  } else {
    // 支持 Ctrl/Shift 多选
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      videoStore.toggleVideoSelection(props.node);
    } else {
      videoStore.setActiveVideo(props.node);
    }
  }
}

function handleCheckboxClick() {
  videoStore.toggleVideoSelection(props.node);
}
```

- [x] **步骤 4：添加 Checkbox 样式**

```css
.tree-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--vt-primary);
}
```

---

## 任务 9：Sidebar 添加全选功能

**文件：**
- 修改：`src/components/Sidebar.vue`

- [x] **步骤 1：添加全选按钮**

在 `panel-header` 下方添加全选栏：

```vue
<div v-if="videoFileCount > 0" class="select-toolbar">
  <button class="vt-button-ghost-sm" @click="handleSelectAll">
    {{ allVideosSelected ? '取消全选' : '全选' }} ({{ selectedCount }}/{{ videoFileCount }})
  </button>
</div>
```

- [x] **步骤 2：实现全选逻辑**

```typescript
import { computed } from 'vue';
import { useVideoStore } from '../store/useVideoStore';

const videoStore = useVideoStore();

const videoFileCount = computed(() => {
  let count = 0;
  function countVideos(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.type === 'file') count++;
      else if (node.children) countVideos(node.children);
    }
  }
  countVideos(roots.value);
  return count;
});

const selectedCount = computed(() => videoStore.selectedVideos.length);

const allVideosSelected = computed(() => 
  videoFileCount.value > 0 && selectedCount.value === videoFileCount.value
);

function handleSelectAll() {
  if (allVideosSelected.value) {
    videoStore.setSelectedVideos([]);
  } else {
    const allVideos: FileNode[] = [];
    function collectVideos(nodes: FileNode[]) {
      for (const node of nodes) {
        if (node.type === 'file') allVideos.push(node);
        else if (node.children) collectVideos(node.children);
      }
    }
    collectVideos(roots.value);
    videoStore.setSelectedVideos(allVideos);
  }
}
```

- [x] **步骤 3：添加工具栏样式**

```css
.select-toolbar {
  padding: var(--vt-space-2) var(--vt-space-4);
  border-bottom: 1px solid var(--vt-border);
  background: var(--vt-bg-soft);
}

.vt-button-ghost-sm {
  height: 24px;
  padding: 0 var(--vt-space-2);
  font-size: 12px;
  border: none;
  background: transparent;
  color: var(--vt-text-secondary);
  cursor: pointer;
  transition: all 180ms ease;
}

.vt-button-ghost-sm:hover {
  color: var(--vt-text);
  background: rgba(255, 255, 255, 0.04);
}
```

---


## 任务 10：批量模式数据表格组件

**文件：**
- 创建：`src/components/BatchVideoGrid.vue`

- [x] **步骤 1：创建批量视图表格组件**

创建文件 `src/components/BatchVideoGrid.vue`，完整代码见下方。该组件展示选中视频的表格，包含文件名、时长、大小、状态列。

---

## 任务 11：App.vue 动态视图切换

**文件：**
- 修改：`src/App.vue`

- [x] **步骤 1：根据选中数量切换视图**

在 workspace 中添加条件判断：当 `selectedVideos.length <= 1` 时显示播放器和时间轴，否则显示 BatchVideoGrid。

- [x] **步骤 2：引入 BatchVideoGrid 组件**

在 script 中导入并使用 BatchVideoGrid 组件。

---

## 任务 12：Inspector 批量模式提示

**文件：**
- 修改：`src/components/Inspector.vue`

- [x] **步骤 1：在工作台 Tab 添加批量提示横幅**

当 `selectedVideos.length > 1` 时，在工具选择器上方显示提示："当前规则将应用于选中的 N 个视频"。

- [x] **步骤 2：添加横幅样式**

使用 `var(--vt-primary-soft)` 背景色，边框使用主色调。

---

## 任务 13：ToolSlicer 批量切片树形预览

**文件：**
- 修改：`src/components/tools/ToolSlicer.vue`
- 修改：`src/store/useSliceStore.ts`

- [x] **步骤 1：扩展 SliceStore 数据结构**

添加 `batchSliceGroups` 状态，存储多视频的切片分组数据。每个分组包含 videoId、videoName、segments、isExpanded。

- [x] **步骤 2：修改 handleAnalyze 支持批量**

检测 selectedVideos 数量，如果大于1则循环调用分析接口，将结果存入 batchSliceGroups。

- [x] **步骤 3：切片列表 UI 改为树形**

单选模式保持平铺列表，批量模式使用可折叠的树形结构，父节点显示视频名称和片段数量。

- [x] **步骤 4：添加树形展开/折叠样式**

箭头图标旋转动画，嵌套子项缩进样式。

---

## 实施顺序建议

按以下顺序执行任务，确保每个阶段独立验证：

1. **阶段一（任务1-6）**：导入过滤引擎
   - 完成类型、Store、主进程过滤、Preload、弹窗组件、Sidebar集成
   - 验证：打开偏好设置弹窗，配置过滤规则，导入文件后查看过滤统计

2. **阶段二（任务7-9）**：多选状态管理
   - 重构 VideoStore、FileTreeItem、Sidebar 全选
   - 验证：能够 Ctrl 多选、Shift 范围选择、全选/取消全选

3. **阶段三（任务10-13）**：批量视图与工作台联动
   - BatchVideoGrid、App 动态切换、Inspector 提示、ToolSlicer 树形预览
   - 验证：选中多个视频后中心区域切换为表格，右侧显示批量提示，生成切片预览后显示树形结构

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-06-10-batch-video-processing.md`。

**两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

选哪种方式？
