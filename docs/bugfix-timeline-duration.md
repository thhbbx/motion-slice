# Bug 修复报告：时间轴无法读取视频长度

## 问题描述
- 时间码显示 `00:00:00 / 00:00:00`
- 播放指针不跟随视频播放移动
- 缩略图轨显示"加载中..."

## 根因分析

### 数据流追踪
1. **VideoPlayer.vue** (✅ 正常)
   - `videoElement.duration` 返回 `number` 类型（秒数）
   - 通过 `setDuration(videoElement.duration)` 正确同步

2. **useVideoStore.ts** (❌ 类型不匹配)
   - `deepMetadata.duration` 是 `string` 类型（格式：`"HH:mm:ss"`）
   - 调用 `setDuration("00:05:30")` 传入字符串
   - `setDuration` 函数中 `dur > 0` 判断失败（字符串不是数字）
   - 结果：`duration.value = 0`

3. **Timeline.vue** (❌ 除零错误)
   - `playheadPosition = (currentTime / 0) * 100%` → `NaN`
   - 播放指针位置计算错误，无法显示

### 类型定义冲突
```typescript
// src/types/file-tree.ts
export interface VideoMetadata {
  duration: string; // ❌ 字符串格式：HH:mm:ss
}

// src/store/useVideoStore.ts
const duration = ref<number>(0); // ✅ 数字格式：秒数
```

## 修复方案

### 1. 创建时间格式转换工具 (`src/utils/timeFormat.ts`)
```typescript
// 将 HH:mm:ss 转换为秒数
export function parseTimecode(timecode: string): number {
  const parts = timecode.split(':').map(p => parseInt(p, 10));
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  return 0;
}

// 将秒数格式化为 HH:mm:ss
export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}
```

### 2. 修复 Store 中的类型转换 (`src/store/useVideoStore.ts`)
```typescript
import { parseTimecode } from '../utils/timeFormat';

// 在 setActiveVideo 中
if (deepMetadata.duration) {
  // 将字符串格式转换为秒数
  const durationInSeconds = parseTimecode(deepMetadata.duration);
  setDuration(durationInSeconds);
}
```

### 3. 重构 Timeline 组件 (`src/components/Timeline.vue`)
```typescript
import { formatTimecode } from '../utils/timeFormat';

// 移除内联的 formatTime 函数，使用工具函数
const formattedCurrentTime = computed(() => formatTimecode(currentTime.value));
const formattedDuration = computed(() => formatTimecode(duration.value));
```

## 修复验证

### 逻辑验证
```
输入: "00:05:30" (5分30秒)
parseTimecode("00:05:30") = 0*3600 + 5*60 + 30 = 330 秒 ✓

修复前: setDuration("00:05:30") → duration = 0 ❌
修复后: setDuration(330) → duration = 330 ✓
```

### 编译验证
```bash
npm run lint
# ✓ 无 TypeScript 错误
# ✓ 无 ESLint 警告
```

## 预期效果

修复后应该能够：
1. ✅ 时间码正确显示（如 `00:00:05 / 00:05:30`）
2. ✅ 播放指针随视频播放实时移动
3. ✅ 点击时间轴能够准确跳转
4. ✅ 视频切换时状态正确重置

## 修改文件清单

1. **新建**: `src/utils/timeFormat.ts` - 时间格式转换工具
2. **修改**: `src/store/useVideoStore.ts` - 添加类型转换逻辑
3. **修改**: `src/components/Timeline.vue` - 使用工具函数

## 后续建议

1. **类型安全改进**: 考虑在 `VideoMetadata` 接口中添加 `durationSeconds?: number` 字段，避免重复转换
2. **单元测试**: 为 `parseTimecode` 和 `formatTimecode` 添加单元测试
3. **错误处理**: 在 `parseTimecode` 中添加更严格的输入验证

---

**修复时间**: 2026-05-21
**修复方法**: 系统化调试（Systematic Debugging）
**根因定位**: 数据流追踪 + 类型不匹配分析
