# UI 改进实现计划

**规格文档**: `docs/superpowers/specs/2026-07-04-ui-improvements-design.md`  
**状态**: ✅ 已完成

---

## 任务概述

实现四个 UI/UX 改进：
1. 全局滚动条样式优化
2. 批量视频列表路径显示
3. 导出路径层级保留
4. 导出队列路径显示与布局优化

---

## 实现步骤

### ✅ 任务 1：全局滚动条样式

**目标**: 统一应用滚动条样式，采用 macOS 风格（细窄、浮动式、半透明）

**步骤**:
1. ✅ 在 `src/styles/global.css` 添加全局滚动条样式
2. ✅ 配置 WebKit 滚动条属性：
   - 宽度：6px
   - 轨道：透明
   - 滑块：半透明白色、圆角 3px
   - 悬停效果：增强不透明度

**验证**:
- ✅ 批量视频列表滚动条样式生效
- ✅ 导出队列滚动条样式生效
- ✅ 悬停时滑块颜色加深

---

### ✅ 任务 2：批量视频列表路径显示

**目标**: 在文件名后显示父目录路径，解决重名文件无法区分的问题

**步骤**:
1. ✅ 创建 `src/utils/pathFormat.ts`
   - ✅ 实现 `extractParentPath()` - 提取最后 N 层父目录
   - ✅ 实现 `formatPathForDisplay()` - 压缩超长路径
   - ✅ 实现 `formatPathFromRoot()` - 从根目录开始显示完整相对路径

2. ✅ 修改 `src/components/BatchVideoGrid.vue`
   - ✅ 导入 `formatPathFromRoot`
   - ✅ 添加 `getParentPath()` 函数（调用 `formatPathFromRoot(fullPath, rootDir, 80)`）
   - ✅ 模板中添加路径显示：`<span class="video-parent-path">📁 {{ getParentPath(video.path) }}</span>`
   - ✅ 添加 `title` 属性显示完整路径

3. ✅ 添加样式
   - ✅ `.video-parent-path` 样式：等宽字体、灰色、11px、max-width: 500px
   - ✅ 添加 `text-overflow: ellipsis` 省略超长部分
   - ✅ 添加 `display: inline-block` 确保宽度限制生效

**验证**:
- ✅ 重名文件显示不同路径
- ✅ 路径从根目录开始显示
- ✅ 超长路径智能压缩
- ✅ 鼠标悬停显示完整路径

---

### ✅ 任务 3：导出路径层级保留

**目标**: 导出时保留从根目录开始的完整相对路径

**步骤**:
1. ✅ 修改 `src/main/export/ExportHandler.ts`
   - ✅ 读取 `task.payload.rootDir`
   - ✅ 计算相对路径：`path.relative(rootDir, sourceFilePath)`
   - ✅ 获取根目录名称
   - ✅ 构建输出路径：`path.join(outputDir, rootName, relativePath)`
   - ✅ 创建多层目录：`fs.mkdirSync(path.dirname(finalPath), { recursive: true })`

**验证**:
- ✅ 选择 `项目1` 作为根目录
- ✅ 导出 `项目1/素材/文件.mov`
- ✅ 输出为 `Downloads/项目1/素材/文件.mov`
- ✅ 目录结构完整保留

---

### ✅ 任务 4：导出队列路径显示与布局优化

**目标**: 优化导出队列的路径显示和布局，解决路径超出、布局混乱问题

**步骤**:

#### 4.1 路径显示优化
1. ✅ 修改 `src/components/export/BatchExportQueue.vue`
   - ✅ 导入 `formatPathFromRoot`
   - ✅ 添加 `getParentPath()` 函数（调用 `formatPathFromRoot(fullPath, rootDir, 35)`）
   - ✅ 删除旧的 `truncateFileName()` 函数

2. ✅ 修改模板结构
   - ✅ 路径换行显示：
     ```vue
     <div class="task-info">
       <div class="task-name-line">
         <span class="task-name">{{ task.videoName }} - {{ task.sliceLabel }}</span>
         <span class="task-status">{{ statusText(task.status) }}</span>
       </div>
       <div class="task-path-line">
         <span class="task-parent-path">📁 {{ getParentPath(task.videoPath) }}</span>
       </div>
     </div>
     ```

#### 4.2 布局优化
3. ✅ 修改样式
   - ✅ `.queue-list` 改为固定高度 `height: 400px`
   - ✅ 移除 `flex: 1` 和 `min-height: 0`
   - ✅ 固定区域添加 `flex-shrink: 0`：
     - `.queue-summary`
     - `.output-dir-selector`
     - `.queue-progress`
     - `.export-actions`

#### 4.3 路径样式优化
4. ✅ 添加省略号样式
   - ✅ `.task-path-line` 添加 `width: 100%`、`overflow: hidden`、`display: block`
   - ✅ `.task-parent-path` 添加：
     - `max-width: 100%`
     - `overflow: hidden`
     - `text-overflow: ellipsis`
     - `white-space: nowrap`
     - `display: inline-block`
   - ✅ 添加右侧内边距：`padding-right: var(--vt-space-2)`

**验证**:
- ✅ 队列固定 400px 高度
- ✅ 内容超出时显示滚动条
- ✅ 按钮区域始终可见
- ✅ 路径换行显示
- ✅ 路径超出时显示省略号
- ✅ 路径右侧有边距，不紧贴滚动条
- ✅ 鼠标悬停显示完整路径

---

## 统一路径显示逻辑

### 核心实现：`formatPathFromRoot()` 函数

**位置**: `src/utils/pathFormat.ts`

**功能**:
```typescript
export function formatPathFromRoot(
  fullPath: string, 
  rootDir?: string, 
  maxLength: number = 35
): string
```

**压缩算法**:
1. 如果没有根目录，退回到 `formatPathForDisplay()`
2. 计算从根目录到文件的相对路径
3. 根据路径层级智能压缩：
   - 单层：截断目录名
   - 两层：保留首层，截断末层
   - 多层：`根目录/首层/.../末层/`
4. 末层目录名最多 12 字符，超出截断

**使用场景**:
- `BatchVideoGrid.vue`: `maxLength = 80`（空间充裕）
- `BatchExportQueue.vue`: `maxLength = 35`（空间较窄）

---

## 文件修改清单

### 新增文件
- ✅ `src/utils/pathFormat.ts` - 路径格式化工具

### 修改文件
1. ✅ `src/styles/global.css` - 全局滚动条样式
2. ✅ `src/components/BatchVideoGrid.vue` - 批量视频列表路径显示
3. ✅ `src/components/export/BatchExportQueue.vue` - 导出队列优化
4. ✅ `src/main/export/ExportHandler.ts` - 导出路径层级保留

---

## 测试验证清单

### 功能测试
- ✅ 滚动条样式在所有滚动容器中生效
- ✅ 批量视频列表正确显示路径
- ✅ 重名文件可通过路径区分
- ✅ 导出保留完整目录结构
- ✅ 导出队列路径正确显示
- ✅ 导出队列布局规整，按钮始终可见

### 边缘测试
- ✅ 超长路径（50+ 字符）正确压缩
- ✅ 深层嵌套目录（5+ 层）正确处理
- ✅ 中文路径正确显示
- ✅ 特殊字符路径（空格、括号）正确处理
- ✅ 路径超出时显示省略号

---

## 实施顺序

所有任务已按以下顺序完成：

1. ✅ **任务 1**（全局滚动条样式）- 基础样式，影响最小
2. ✅ **任务 2**（批量视频列表路径）- 依赖 `pathFormat.ts`
3. ✅ **任务 3**（导出路径层级）- 独立功能，不依赖前两个
4. ✅ **任务 4**（导出队列优化）- 依赖 `pathFormat.ts`，最后完成

---

## 回归测试

完成所有任务后进行的回归测试：

- ✅ 批量视频列表功能正常
- ✅ 切片预览功能正常
- ✅ 导出功能正常
- ✅ 路径显示在各种场景下正确
- ✅ 滚动条样式在所有组件中一致
- ✅ 无 UI 布局错乱
- ✅ 无性能问题

---

## 已知问题与优化建议

### 已解决问题
- ✅ 批量视频列表路径压缩过度 → 增加 maxLength 到 80
- ✅ 导出队列路径超出 → 添加 CSS 省略号
- ✅ 导出队列布局混乱 → 固定高度并添加 flex-shrink: 0
- ✅ 路径右侧紧贴滚动条 → 添加 padding-right

### 后续优化建议
1. **路径压缩优化**
   - 考虑中文字符宽度（占 2 个字符位）
   - 动态计算压缩点

2. **交互增强**
   - 点击路径复制到剪贴板
   - 点击路径在文件管理器中打开

3. **导出自定义**
   - 允许用户选择是否保留层级
   - 支持导出目录结构模板
