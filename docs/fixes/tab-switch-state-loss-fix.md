# Tab 切换状态丢失问题修复

## 问题描述

用户在工作台 Tab 配置切片参数（如时长、大小、缓冲设置），切换到导出 Tab 设置输出目录后，再切回工作台 Tab 时，之前配置的所有信息都会被清空。

## 根本原因

`Inspector.vue` 使用 `v-if` 条件渲染 Tab 内容，导致切换 Tab 时组件被完全销毁和重建，所有内部 `ref`/`reactive` 状态都会重置为初始值。

## 解决方案对比

### 方案 A：`v-show` 替代 `v-if`（已放弃）

**优点**：
- 改动最小，只需修改 3 行代码
- 组件实例保持挂载，状态自动保留

**缺点**：
- 所有 Tab 组件同时挂载，增加内存开销
- 与原架构设计不符（原设计通过全局监听器 + 组件无状态化实现）
- 可能引入生命周期副作用

### 方案 B：状态提升到 Store（✅ 已采用）

**优点**：
- 符合 Vuex/Pinia 最佳实践
- 状态独立于组件生命周期，组件可随意卸载
- 未来可扩展配置预设、历史记录等功能
- 与现有架构一致（参考 commit 0a7023b 的设计思路）

**缺点**：
- 需要修改多个文件

## 实施细节

### 1. 新建 `useToolConfigStore`

创建 `src/store/useToolConfigStore.ts`，集中管理所有工具配置：

```typescript
export const useToolConfigStore = defineStore('toolConfig', () => {
  // 切片工具配置
  const slicerConfig = ref({
    enabledModes: { duration: true, size: true },
    durationUnit: 'minutes',
    durationDisplay: 20,
    sizeValue: 1024,
    useOverlapHandles: false,
    overlapDuration: 10.0
  });

  // 导出配置
  const exportConfig = ref({
    format: 'mp4',
    quality: 100,
    outputDir: ''
  });

  return { slicerConfig, exportConfig, ... };
});
```

### 2. 修改 `ToolSlicer.vue`

将原本的 `ref` 状态改为从 Store 读取：

```typescript
// 原代码
const durationDisplay = ref(20);

// 新代码
const { slicerConfig } = storeToRefs(toolConfigStore);
const durationDisplay = computed({
  get: () => slicerConfig.value.durationDisplay,
  set: (val) => { slicerConfig.value.durationDisplay = val; }
});
```

### 3. 修改 `ExportTab.vue`

同样从 Store 读取导出配置：

```typescript
// 原代码
const exportConfig = ref({ format: 'mp4', quality: 100, outputDir: '' });

// 新代码
const { exportConfig } = storeToRefs(toolConfigStore);
```

优化了 `onMounted` 逻辑，仅在 `outputDir` 为空时才获取默认路径（避免重复覆盖）。

## 变更文件

- ✨ `src/store/useToolConfigStore.ts`（新建）
- 🔧 `src/components/tools/ToolSlicer.vue`
- 🔧 `src/components/ExportTab.vue`

## 测试验证

1. 启动应用，导入视频
2. 在工作台 Tab 配置：
   - 切分模式：勾选"按时长"和"按大小"
   - 目标时长：30 分钟
   - 目标大小：2048 MB
   - 开启交叠缓冲：15s
3. 切换到导出 Tab，设置：
   - 输出格式：MOV
   - 视频质量：80%
   - 输出目录：自定义路径
4. 切回工作台 Tab
5. ✅ 验证所有配置都保留完整
6. 切回导出 Tab
7. ✅ 验证导出配置也完整保留

## 相关提交

- commit 0a7023b: 修复导出进度跨 Tab 同步问题（全局监听器方案）
- commit ff7d8d4: 重构统一导出面板并修复 8 个问题

---

**修复日期**: 2026-07-05  
**修复方式**: 状态提升到 Pinia Store
