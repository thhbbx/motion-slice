# 交叠缓冲 (Overlap Handles) 算法说明

## 功能概述

交叠缓冲是专业非编软件（如 Premiere Pro、Final Cut Pro）中的标准功能，允许在切分视频时向切口**双向**延伸额外的冗余时间，便于后期制作转场效果。

## 算法原理

### 基础切分（无交叠）

假设视频总时长 180 秒，按 60 秒切分：

```
片段 1: [0s -------- 60s]
片段 2:              [60s -------- 120s]
片段 3:                           [120s -------- 180s]
```

### 应用交叠缓冲（1 秒）- 双向扩张

每个切片的边界**双向向外扩张** 1 秒：

```
片段 1: [0s ----------- 61s]
        ↑ 头部无法扩张    ↑ 尾部+1s

片段 2:           [59s ----------- 121s]
                  ↑ 头部-1s        ↑ 尾部+1s

片段 3:                      [119s ----------- 180s]
                             ↑ 头部-1s    ↑ 尾部无法扩张
```

**交叠区域：**
- 片段 1 和片段 2 在 59s-61s 之间交叠（2 秒）
- 片段 2 和片段 3 在 119s-121s 之间交叠（2 秒）

**关键特征：**
- 片段 1：只有尾部缓冲（headBuffer: 0s, tailBuffer: 1s）
- 片段 2：头尾都有缓冲（headBuffer: 1s, tailBuffer: 1s）
- 片段 3：只有头部缓冲（headBuffer: 1s, tailBuffer: 0s）

## 核心代码逻辑（双向扩张）

```typescript
// 原始逻辑切片范围（未扩张）
const logicalStart = currentTime;
const logicalEnd = currentTime + targetDuration;

// 初始化实际导出范围
let actualStart = logicalStart;
let actualEnd = logicalEnd;
let headBuffer = 0;
let tailBuffer = 0;

// 应用交叠缓冲：双向向外扩张
if (useOverlapHandles && overlapDuration > 0) {
  // 头部向左扩张（不能小于 0）
  const expandedStart = logicalStart - overlapDuration;
  actualStart = Math.max(0, expandedStart);
  headBuffer = logicalStart - actualStart; // 实际扩张量

  // 尾部向右扩张（不能超过总时长）
  const expandedEnd = logicalEnd + overlapDuration;
  actualEnd = Math.min(videoDuration, expandedEnd);
  tailBuffer = actualEnd - logicalEnd; // 实际扩张量
}

// 返回数据结构
return {
  id: `segment-${index}`,
  startTime: actualStart,
  endTime: actualEnd,
  label: `片段 ${index}`,
  headBuffer,  // 头部实际扩张时长
  tailBuffer,  // 尾部实际扩张时长
};
```

## 边界防护

### 视频开头（头部缓冲受限）
```
原始片段 1: [0s - 60s]
尝试扩张: [-1s - 61s]  ❌ 起始时间为负
边界修正: [0s - 61s]   ✅ headBuffer = 0s, tailBuffer = 1s
```

### 视频结尾（尾部缓冲受限）
```
原始片段 3: [120s - 180s]
尝试扩张: [119s - 181s]  ❌ 结束时间超出
边界修正: [119s - 180s]  ✅ headBuffer = 1s, tailBuffer = 0s
```

### 中间片段（双向完整扩张）
```
原始片段 2: [60s - 120s]
尝试扩张: [59s - 121s]  ✅ 双向都在范围内
最终结果: [59s - 121s]  ✅ headBuffer = 1s, tailBuffer = 1s
```

## 视觉反馈 - 专业 NLE 斜纹渲染

### DOM 结构（三段式）

每个切片分为三个区域：

```
┌──────────────────────────────────────────────┐
│ [左斜纹]    [纯色主体]    [右斜纹]           │
│  头部缓冲    逻辑切片      尾部缓冲           │
│  headBuffer  原始范围      tailBuffer        │
└──────────────────────────────────────────────┘
```

### CSS 斜纹图案（Hatched Pattern）

**废弃方案：** ~~使用 `mix-blend-mode` 混合模式~~（在深色背景下会导致色块不可见）

**当前方案：** 使用 `repeating-linear-gradient` 实现 45° 斜纹

```css
/* 左侧头部缓冲带 */
.slice-overlap-left {
  background:
    repeating-linear-gradient(
      45deg,
      rgba(139, 92, 246, 0.25) 0px,   /* 紫色线条 2px */
      rgba(139, 92, 246, 0.25) 2px,
      transparent 2px,                 /* 透明间隔 4px */
      transparent 6px
    ),
    rgba(88, 101, 242, 0.15);          /* 底色 */
  border-left: 2px solid rgba(139, 92, 246, 0.9);
  border-radius: 2px 0 0 2px;
}

/* 中间纯色主体 */
.slice-body {
  background: rgba(88, 101, 242, 0.4);
  border-top: 1px solid rgba(139, 92, 246, 0.3);
  border-bottom: 1px solid rgba(139, 92, 246, 0.3);
}

/* 右侧尾部缓冲带 */
.slice-overlap-right {
  background:
    repeating-linear-gradient(
      45deg,
      rgba(139, 92, 246, 0.25) 0px,
      rgba(139, 92, 246, 0.25) 2px,
      transparent 2px,
      transparent 6px
    ),
    rgba(88, 101, 242, 0.15);
  border-right: 2px solid rgba(139, 92, 246, 0.9);
  border-radius: 0 2px 2px 0;
}
```

**视觉参数：**
- 斜纹角度：45°
- 线条宽度：2px
- 线条间隔：4px（总周期 6px）
- 线条颜色：`rgba(139, 92, 246, 0.25)` → hover: `0.4` → active: `0.6`
- 底色：`rgba(88, 101, 242, 0.15)` → hover: `0.25` → active: `0.35`

### 宽度计算逻辑

```typescript
// 切片总时长
const totalDuration = slice.endTime - slice.startTime;

// 左侧斜纹带宽度
const headPercent = (slice.headBuffer / totalDuration) * 100;

// 中间纯色区宽度
const bodyDuration = totalDuration - slice.headBuffer - slice.tailBuffer;
const bodyPercent = (bodyDuration / totalDuration) * 100;

// 右侧斜纹带宽度
const tailPercent = (slice.tailBuffer / totalDuration) * 100;
```

### 实际渲染示例

```
时间轴：0s -------- 60s -------- 120s -------- 180s

片段 1: [████████████///]
        纯色主体    右斜纹
        (0-60s)    (60-61s)

片段 2:           [\\\████████████///]
                  左斜纹 纯色主体  右斜纹
                  (59-60s)(60-120s)(120-121s)

片段 3:                      [\\\████████]
                             左斜纹 纯色主体
                             (119-120s)(120-180s)

交叠区域：
  59-61s: 片段1右斜纹 + 片段2左斜纹（物理重叠）
  119-121s: 片段2右斜纹 + 片段3左斜纹（物理重叠）
```

### 悬停与激活状态

```css
/* 默认状态 */
.slice-body { background: rgba(88, 101, 242, 0.4); }
.slice-overlap-left/right { 
  background: 斜纹(0.25) + 底色(0.15);
  border: 2px solid rgba(139, 92, 246, 0.9);
}

/* 悬停状态 - 整个切片（三段）同时高亮 */
.slice-block:hover .slice-body { background: rgba(88, 101, 242, 0.55); }
.slice-block:hover .slice-overlap-* { 
  background: 斜纹(0.4) + 底色(0.25);
  border-color: rgba(139, 92, 246, 1);
}

/* 激活状态 - 最高层级 */
.slice-block.active .slice-body { background: rgba(88, 101, 242, 0.7); }
.slice-block.active .slice-overlap-* { 
  background: 斜纹(0.6) + 底色(0.35);
  border-color: rgba(139, 92, 246, 1);
}
```

## 参数约束

- **缓冲时长范围：** 0.0 - 5.0 秒
- **步长：** 0.1 秒
- **默认值：** 1.0 秒
- **精度：** 保留 2 位小数

## 使用场景

1. **转场效果：** 交叠区域提供素材用于淡入淡出、交叉溶解等转场
2. **精确剪辑：** 后期可以微调切点位置而不丢失画面
3. **音频混合：** 音频轨道可以在交叠区域做淡入淡出，避免突兀
4. **容错空间：** 为剪辑师提供更多调整余地

## 与智能断句的区别

| 特性 | 智能断句 | 交叠缓冲 |
|------|---------|---------|
| 目标 | 在静音处切分，避免打断对话 | 在切口两端延伸冗余时间 |
| 实现 | 需要音频分析（FFmpeg silencedetect） | 纯数学计算，无需分析 |
| 切点位置 | 动态调整（寻找静音点） | 固定切点，仅扩张边界 |
| 片段交叠 | 不交叠 | 必然交叠 |
| 扩张方向 | 单向或不扩张 | **双向扩张（头部+尾部）** |
| 适用场景 | 对话类视频 | 所有需要后期转场的视频 |

## 技术实现清单

- [x] 类型定义更新 (`src/types/slice.ts`) - 新增 `headBuffer` 和 `tailBuffer` 字段
- [x] UI 组件重构 (`src/components/tools/ToolSlicer.vue`) - 替换智能断句为交叠缓冲
- [x] 主进程算法实现 (`src/main/handlers/slice-handler.ts`) - **双向扩张逻辑**
- [x] 时间轴视觉渲染 (`src/components/Timeline.vue`) - **三段式 DOM + 双向斜纹**
- [x] 边界防护逻辑 - 头部和尾部独立计算实际扩张量
- [x] 参数验证
- [x] 专业 NLE 斜纹图案 - 废弃混合模式，使用 `repeating-linear-gradient`

## 测试验收

1. ✅ 开启交叠缓冲开关
2. ✅ 调整滑块到不同数值（0.5s, 1.0s, 2.0s）
3. ✅ 生成切片预览
4. ✅ 时间轴上色块发生物理重叠
5. ✅ **第一个切片：只有右侧斜纹**
6. ✅ **中间切片：左右两侧都有斜纹**
7. ✅ **最后切片：只有左侧斜纹**
8. ✅ 边界情况：开头和结尾不超出范围
9. ✅ 斜纹边界锐利，无模糊渐变
10. ✅ 悬停时整个切片（三段）同时高亮

## 已知问题与优化

### 已修复的问题

1. **❌ 单向扩张问题（已修复）**
   - 问题：之前只在尾部扩张，中间片段头部没有缓冲
   - 修复：实现双向扩张，头部和尾部独立计算

2. **❌ 混合模式不可见（已修复）**
   - 问题：`mix-blend-mode: multiply` 在深色背景下导致色块变黑
   - 修复：使用 `repeating-linear-gradient` 实现斜纹图案

3. **❌ 渐变模糊边界（已修复）**
   - 问题：渐变效果与专业 NLE 的锐利边界不符
   - 修复：使用三段式 DOM 结构，边界绝对锐利

## 设计理念

本实现严格遵循专业非编软件（Premiere Pro、DaVinci Resolve）的交叠缓冲标准：

1. **双向扩张**：头部和尾部同时向外扩张，而非单向
2. **独立计算**：头部和尾部缓冲量独立计算，受边界限制时互不影响
3. **视觉语言**：使用斜纹（Hatched）图案而非渐变，符合行业标准
4. **精确边界**：斜纹边界锐利，精确对应物理时间
5. **工业质感**：克制的配色、精准的间距、专业的交互反馈
