# Worker 线程隔离方案设计文档

**日期**: 2026-06-23  
**问题**: 大文件切片分析时主进程内存溢出崩溃  
**解决方案**: Worker 线程池隔离 FFprobe 任务

---

## 问题诊断

### 崩溃现场

**错误日志**:
```
<--- Last few GCs --->
[13336:00007BEC0022C000] 56296 ms: Scavenge (during sweeping) 3973.0 (3982.1) -> 3973.0 (3989.1) MB
[13336:00007BEC0022C000] 59447 ms: Incremental Mark-Compact (reduce) 3973.1 (3989.4) -> 3973.1 (3975.4) MB
[13336:0622/235408.029:ERROR:electron\shell\common\node_bindings.cc:187] OOM error in V8: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

**触发场景**:
- 用户选择了 2 个目录（共 6 个视频文件，总大小约 5GB）
- 系统自动扫描并解析每个视频的元数据（调用 6 次 ffprobe）
- 用户点击"生成切片预览"，主进程尝试第 7 次 ffprobe 调用
- 主进程 V8 堆内存累积到 **4GB**（接近默认上限），无法分配新空间
- 应用崩溃

**根本原因**:
1. **内存累积未释放**: 每次 `execFile()` 调用产生的 stdout/stderr 缓冲区（`maxBuffer: 10MB`）和 JSON 解析中间对象在主进程堆中累积
2. **GC 无法回收**: V8 的垃圾回收器无法及时释放这些大对象，导致堆空间持续增长
3. **缺乏隔离机制**: 所有 ffprobe 任务在同一个 V8 堆空间中执行，没有进程级隔离

---

## 架构设计

### 核心思想

将所有 **计算密集型 + 内存密集型** 的 ffprobe 任务从主进程迁移到独立的 Worker 线程中执行。每个 Worker 线程拥有独立的 V8 堆空间（默认 4GB 上限），任务完成后线程终止，堆内存彻底释放。

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Main Process (主进程)                          │
│  - 窗口管理                                                        │
│  - IPC 路由                                                        │
│  - Worker 线程池调度                                               │
│  - 应用退出协调（before-quit 钩子）                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         WorkerPoolManager (线程池管理器)                    │  │
│  │                                                             │  │
│  │  - 维护 N 个可复用 Worker（默认 N=3）                       │  │
│  │  - 任务队列 + 负载均衡                                      │  │
│  │  - 健康监控（超时检测、崩溃恢复）                            │  │
│  │  - 生命周期管理（空闲超时自动销毁）                          │  │
│  │  - 优雅关闭协调（广播 shutdown 信号）                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                    │
│         ▼                 ▼                 ▼                    │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐               │
│  │ Worker 1 │      │ Worker 2 │      │ Worker 3 │               │
│  │          │      │          │      │          │               │
│  │ 独立堆   │      │ 独立堆   │      │ 独立堆   │               │
│  │ 4GB 上限 │      │ 4GB 上限 │      │ 4GB 上限 │               │
│  │          │      │          │      │          │               │
│  │ FFprobe  │      │ FFprobe  │      │ FFprobe  │               │
│  │  Task    │      │  Task    │      │  Task    │               │
│  │          │      │          │      │          │               │
│  │ 持有子进程│      │ 持有子进程│      │ 持有子进程│               │
│  │ 引用     │      │ 引用     │      │ 引用     │               │
│  └──────────┘      └──────────┘      └──────────┘               │
│       ↓                  ↓                  ↓                    │
│  收到 shutdown 信号时：                                           │
│  1. 终止 ffprobe 子进程（childProcess.kill()）                   │
│  2. 返回 shutdown-ack 确认                                        │
│  3. 退出 Worker（process.exit(0)）                                │
│  4. 堆内存彻底释放                                                │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
渲染进程                主进程                    Worker 线程池
   │                     │                             │
   │  IPC: analyze      │                             │
   │─────────────────→  │                             │
   │                    │  submitTask(filePath)       │
   │                    │──────────────────────────→ │
   │                    │                             │ [Worker 1 空闲]
   │                    │                             │ 执行 execFile(ffprobe)
   │                    │                             │ 保存 ChildProcess 引用
   │                    │                             │ 解析 JSON
   │                    │                             │
   │                    │  ← return metadata          │
   │                    │←───────────────────────────│
   │  ← IPC response    │                             │
   │←──────────────────│                             │
   │                    │                             │ [Worker 1 空闲]
   │                    │                             │ 清空子进程引用
   │                    │                             │
   │  [应用退出]        │                             │
   │                    │  broadcast shutdown         │
   │                    │──────────────────────────→ │
   │                    │                             │ 所有 Worker 收到信号
   │                    │                             │ 终止 ffprobe 子进程
   │                    │  ← shutdown-ack (x3)        │
   │                    │←───────────────────────────│
   │                    │  [等待所有确认]              │
   │                    │  [销毁线程池]                │
   │                    │  [应用安全退出]              │
```

---

## 核心组件规格

### 1. FFprobeWorker（Worker 线程脚本）

**文件路径**: `src/main/workers/ffprobe-worker.ts`

**职责**:
- 在独立的 V8 堆空间中执行单个 ffprobe 任务
- 调用 `execFile(ffprobe, [filePath])` 获取视频元数据
- **保持底层子进程引用**：必须保留 `execFile()` 返回的 `ChildProcess` 实例，用于强制终止卡死的 ffprobe 进程
- 解析 JSON 并返回结构化数据
- 处理错误并返回失败消息
- **响应优雅关闭信号**：接收 `shutdown` 消息时，主动终止正在执行的 ffprobe 子进程并退出

**接口定义**:

```typescript
// 输入消息（从主进程接收）
interface WorkerTaskMessage {
  type: 'ffprobe-task' | 'shutdown';  // 新增 shutdown 类型
  taskId: string;           // 任务唯一 ID
  filePath: string;         // 视频文件绝对路径
  ffprobePath: string;      // ffprobe 可执行文件路径
}

// 输出消息（发送给主进程）
interface WorkerResultMessage {
  type: 'success' | 'error' | 'shutdown-ack';  // 新增 shutdown-ack 类型
  taskId: string;
  data?: VideoMetadata;     // 成功时返回元数据
  error?: string;           // 失败时返回错误信息
}

// VideoMetadata 类型（与现有定义一致）
interface VideoMetadata {
  size: string;             // 格式化后的文件大小（如 "778.0 MB"）
  duration: string;         // 格式化后的时长（如 "00:20:00"）
  resolution: string;       // 分辨率（如 "1920x1080"）
  fps: string;              // 帧率（如 "50 fps"）
  videoCodec: string;       // 视频编码（如 "h264"）
  audioCodec: string;       // 音频编码（如 "aac"）
  bitrate: string;          // 码率（如 "5.4 Mbps"）
  createdAt: string;        // 文件创建时间（如 "2026-06-22 23:20"）
}
```

**实现要点**:
- 使用 `parentPort.on('message')` 监听任务和关闭信号
- 复用现有的格式化函数（`formatFileSize`, `formatDuration` 等）
- 使用 `execFile()` 替代 `fluent-ffmpeg`（减少依赖）
- **底层子进程引用管理**：
  ```typescript
  let currentChildProcess: ChildProcess | null = null;
  
  parentPort.on('message', (msg: WorkerTaskMessage) => {
    if (msg.type === 'shutdown') {
      // 强制终止正在执行的 ffprobe 子进程
      if (currentChildProcess) {
        currentChildProcess.kill('SIGKILL');  // Windows 使用 'SIGKILL'，Linux/macOS 使用 'SIGTERM'
      }
      parentPort.postMessage({ type: 'shutdown-ack', taskId: msg.taskId });
      process.exit(0);
      return;
    }
    
    // 执行任务时保存子进程引用
    currentChildProcess = execFile(ffprobePath, args, (err, stdout) => {
      currentChildProcess = null;  // 任务完成后清空引用
      // ... 处理结果
    });
  });
  ```
- **Why**：仅靠 `worker.terminate()` 无法杀死底层的 C++ 子进程。必须显式调用 `childProcess.kill()` 才能释放被锁定的视频文件句柄，防止出现僵尸进程。
- 超时控制：单个任务最长 30 秒，超时自动终止
- 错误处理：捕获所有异常并返回可读错误消息

**生命周期**:
```
启动 → 监听消息 → 执行任务 → 返回结果 → 等待下一个任务 → 收到 shutdown 信号 → 终止子进程 → 退出
```

---

### 2. WorkerPoolManager（线程池管理器）

**文件路径**: `src/main/workers/worker-pool-manager.ts`

**职责**:
- 维护一个固定大小的 Worker 线程池（默认 3 个）
- 接收 ffprobe 任务请求，分配给空闲 Worker
- 任务队列管理（Worker 全忙时自动排队）
- 健康监控（检测 Worker 崩溃、超时，自动重启）
- **优雅关闭协调**：应用退出时向所有 Worker 广播 `shutdown` 信号，等待确认后销毁线程池
- 生命周期管理（应用退出时销毁所有 Worker）

**类接口**:

```typescript
interface WorkerPoolConfig {
  maxWorkers: number;       // 最大 Worker 数量（默认 3）
  taskTimeout: number;      // 单个任务超时时间（毫秒，默认 30000）
  idleTimeout: number;      // Worker 空闲超时时间（毫秒，默认 60000）
}

class WorkerPoolManager {
  constructor(config?: Partial<WorkerPoolConfig>);
  
  /**
   * 提交单个 ffprobe 任务
   * @param filePath 视频文件路径
   * @returns Promise<VideoMetadata>
   */
  submitTask(filePath: string): Promise<VideoMetadata>;
  
  /**
   * 批量提交 ffprobe 任务（并发控制）
   * @param filePaths 视频文件路径数组
   * @param onProgress 进度回调（可选）
   * @returns Promise<VideoMetadata[]>
   */
  submitBatch(
    filePaths: string[], 
    onProgress?: (current: number, total: number) => void
  ): Promise<VideoMetadata[]>;
  
  /**
   * 优雅关闭线程池（应用退出时调用）
   * 向所有 Worker 发送 shutdown 信号，等待确认后销毁
   * @param timeout 等待超时时间（毫秒，默认 5000）
   * @returns Promise<void>
   */
  async shutdown(timeout?: number): Promise<void>;
  
  /**
   * 强制销毁线程池（紧急情况使用）
   * 立即终止所有 Worker，不等待确认
   */
  destroy(): void;
  
  /**
   * 获取线程池状态（用于调试）
   */
  getStatus(): {
    totalWorkers: number;
    activeWorkers: number;
    queuedTasks: number;
  };
}
```

**内部数据结构**:

```typescript
interface WorkerState {
  worker: Worker;           // Worker 线程实例
  isBusy: boolean;          // 是否正在执行任务
  currentTaskId: string | null;  // 当前任务 ID
  currentChildProcess: ChildProcess | null;  // 当前执行的 ffprobe 子进程引用（用于强制终止）
  lastActiveTime: number;   // 最后活跃时间戳
}

interface PendingTask {
  taskId: string;
  filePath: string;
  resolve: (data: VideoMetadata) => void;
  reject: (error: Error) => void;
  submittedAt: number;      // 提交时间戳
}
```

**核心逻辑**:

1. **Worker 创建与复用**:
   - 初始化时创建 `maxWorkers` 个 Worker
   - Worker 完成任务后标记为空闲，等待下一个任务
   - 空闲超过 `idleTimeout` 后自动销毁（保留至少 1 个 Worker）

2. **任务分配策略**:
   - 有空闲 Worker：立即分配任务
   - 无空闲 Worker：任务入队，等待下一个空闲 Worker

3. **超时处理**:
   - 每个任务设置 `taskTimeout` 定时器
   - 超时后执行两步终止流程：
     1. **先杀死底层子进程**：通过 Worker 通信获取 `ChildProcess` 引用并调用 `kill()`
     2. **再终止 Worker**：调用 `worker.terminate()` 清理 Worker 线程
   - 重新创建新 Worker 补充线程池
   - 任务 Promise 返回超时错误
   - **Why**：仅调用 `worker.terminate()` 只能终止 Worker 的 JavaScript 层，无法杀死已启动的 ffprobe C++ 子进程。必须先显式杀死子进程，否则会出现僵尸进程锁定视频文件。

4. **崩溃恢复**:
   - 监听 Worker 的 `error` 和 `exit` 事件
   - Worker 退出时检查是否有正在执行的任务
   - 如有正在执行的任务，尝试通过操作系统 API 终止可能残留的 ffprobe 进程（通过 PID 追踪）
   - 崩溃时自动创建新 Worker 替换
   - 当前任务返回失败，排队任务不受影响

5. **优雅关闭机制（Poison Pill）**:
   - 应用退出时（`app.on('before-quit')`）调用 `shutdown()` 方法
   - 向所有 Worker 广播 `{ type: 'shutdown' }` 消息
   - 每个 Worker 收到信号后：
     1. 停止接收新任务
     2. 终止当前正在执行的 ffprobe 子进程（调用 `childProcess.kill()`）
     3. 返回 `{ type: 'shutdown-ack' }` 确认消息
     4. 调用 `process.exit(0)` 退出
   - 主进程等待所有 Worker 确认（最长等待 5 秒）
   - 所有 Worker 退出后才允许应用关闭
   - **Why**：防止应用退出瞬间出现文件损坏或未捕获异常。确保所有底层子进程彻底清理完毕。

6. **批量任务优化**:
   - `submitBatch()` 内部使用 `Promise.allSettled()`
   - 并发控制：同时最多 `maxWorkers` 个任务执行
   - 单个任务失败不影响其他任务

**Why?: 为什么选择这些设计决策？**

| 决策                      | 原因                                                                 |
|---------------------------|----------------------------------------------------------------------|
| **固定线程池（3 个）**    | 平衡 CPU 利用率和磁盘 I/O 竞争。ffprobe 是 CPU + I/O 混合任务，3 个 Worker 可充分利用多核 CPU，同时避免过多并发导致磁盘瓶颈。 |
| **空闲超时销毁**          | 节省系统资源。视频扫描是偶发操作，长时间无任务时自动回收 Worker。    |
| **超时强制终止**          | 防止卡死任务占用线程池。某些损坏的视频文件可能导致 ffprobe 无限等待。 |
| **Promise 封装**          | 简化调用方代码。调用者无需关心 Worker 通信细节，直接 `await` 结果。 |
| **崩溃自动恢复**          | 提升鲁棒性。即使 Worker 意外崩溃，线程池仍能继续服务。               |
| **保持子进程引用**        | 仅 `worker.terminate()` 无法杀死底层 C++ 进程。必须持有 `ChildProcess` 引用并调用 `kill()` 才能彻底清理，防止僵尸进程锁定文件。 |
| **Poison Pill 优雅关闭**  | 防止应用退出时出现文件损坏或未捕获异常。广播 `shutdown` 信号确保所有底层资源（子进程、文件句柄）彻底释放。 |
| **ESM 标准 Worker 加载**  | 避免手动拼接 `app.isPackaged` 路径的脆弱做法。使用 `new URL(..., import.meta.url)` 让 Vite 自动处理开发/生产环境路径映射。 |

---

### 3. 现有代码重构

#### 3.1 metadata-handler.ts

**修改前**:
```typescript
async function parseVideoMetadata(filePath: string): Promise<VideoMetadata> {
  // 主进程直接调用 execFile(ffprobe)
  execFile(ffprobePath, args, { maxBuffer: 10MB }, (err, stdout) => {
    // 解析 JSON，累积内存
  });
}
```

**修改后**:
```typescript
import { getWorkerPoolManager } from '../workers/worker-pool-manager';

async function parseVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const pool = getWorkerPoolManager();
  return pool.submitTask(filePath);  // 委托给 Worker 线程池
}
```

**Why**: 
- 最小化代码修改，保持接口不变
- 调用方无需感知底层 Worker 机制
- 主进程堆内存不再累积 ffprobe 输出

#### 3.2 slice-handler.ts

**修改前**:
```typescript
async function getVideoDuration(filePath: string): Promise<number> {
  // 主进程直接调用 execFile(ffprobe)
  execFile(ffprobePath, args, { maxBuffer: 10MB }, (err, stdout) => {
    const duration = parseFloat(stdout.trim());
    resolve(duration);
  });
}
```

**修改后**:
```typescript
import { getWorkerPoolManager } from '../workers/worker-pool-manager';

async function getVideoDuration(filePath: string): Promise<number> {
  const pool = getWorkerPoolManager();
  const metadata = await pool.submitTask(filePath);
  
  // 从格式化的时长字符串（"00:20:00"）解析为秒数
  const [h, m, s] = metadata.duration.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}
```

**Why**:
- 复用 Worker 池，避免重复调用 ffprobe
- 从完整元数据中提取时长，减少 ffprobe 调用次数

#### 3.3 video-scanner.ts（批量扫描器）

**修改前**:
```typescript
// 并发解析 6 个视频（所有任务在主进程堆中执行）
const metadataPromises = videos.map(v => parseVideoMetadata(v.path));
const results = await Promise.all(metadataPromises);
```

**修改后**:
```typescript
import { getWorkerPoolManager } from '../workers/worker-pool-manager';

const pool = getWorkerPoolManager();
const filePaths = videos.map(v => v.path);

// 批量提交，线程池内部控制并发
const results = await pool.submitBatch(filePaths, (current, total) => {
  console.log(`[video-scanner] 解析进度: ${current}/${total}`);
  event.sender.send('scan-progress', { current, total });
});
```

**Why**:
- 线程池内部限制并发数为 3，避免同时创建 6 个 Worker
- 内置进度回调，简化进度上报逻辑
- 单个视频解析失败不影响其他视频（`Promise.allSettled`）

---

## 技术实现细节

### 4.1 Worker 线程通信机制

Node.js Worker 线程使用 **消息传递（Message Passing）** 模型，通过 `postMessage()` 和 `on('message')` 通信。

**主进程 → Worker**:
```typescript
const worker = new Worker('./ffprobe-worker.js');
worker.postMessage({
  type: 'ffprobe-task',
  taskId: 'task-123',
  filePath: 'E:\\video.mp4',
  ffprobePath: 'D:\\ffprobe.exe'
});
```

**Worker → 主进程**:
```typescript
// 在 ffprobe-worker.ts 中
import { parentPort } from 'worker_threads';

parentPort.postMessage({
  type: 'success',
  taskId: 'task-123',
  data: { size: '778 MB', duration: '00:20:00', ... }
});
```

**数据序列化**:
- 传递的对象会被 **结构化克隆（Structured Clone）**
- 支持 JSON 可序列化的类型（对象、数组、字符串、数字、布尔值、null）
- 不支持函数、Symbol、DOM 对象

### 4.2 Vite 构建配置与 Worker 路径加载

Worker 线程脚本需要单独打包为独立的 JS 文件，并在运行时正确加载。

#### 4.2.1 使用现代 ESM 标准语法（推荐）

**Worker 创建（在 WorkerPoolManager 中）**:
```typescript
import { Worker } from 'worker_threads';

// 使用 ESM 标准的 import.meta.url 动态解析路径
// Vite 会在构建时自动处理这个语法
const worker = new Worker(
  new URL('../workers/ffprobe-worker.ts', import.meta.url)
);
```

**Why 选择这种方式**:
- ✅ **构建工具自动处理**：Vite 会自动识别 `new URL(..., import.meta.url)` 语法，在开发环境和生产环境中生成正确的路径
- ✅ **避免相对路径地狱**：无需手动判断 `app.isPackaged` 或拼接 `process.resourcesPath`
- ✅ **符合 ESM 标准**：这是 Node.js 官方推荐的 Worker 加载方式（Node.js 12+ 支持）
- ✅ **类型安全**：TypeScript 可以正确解析 `import.meta.url` 类型

#### 4.2.2 配置 Vite 支持 Worker 线程

**修改 `vite.main.config.ts`**:
```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@workers': path.resolve(__dirname, 'src/main/workers'),
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        // 确保 Worker 文件输出到正确位置
        chunkFileNames: 'chunks/[name]-[hash].js'
      }
    }
  },
  worker: {
    format: 'es',  // 使用 ESM 格式
    rollupOptions: {
      output: {
        entryFileNames: 'workers/[name].js'  // Worker 文件输出到 workers 子目录
      }
    }
  }
});
```

**Why 使用 Vite 的 `worker` 配置**:
- Vite 5+ 内置了对 Worker 线程的支持
- 使用 `new URL(..., import.meta.url)` 时，Vite 会自动将 Worker 文件打包到独立的 chunk
- 无需手动配置多入口，构建工具自动处理依赖关系

#### 4.2.3 开发环境 vs 生产环境

使用 `new URL(..., import.meta.url)` 后，路径解析在两种环境下的表现：

**开发环境**:
```
new URL('../workers/ffprobe-worker.ts', import.meta.url)
→ file:///D:/projects/motion-slice/.vite/build/workers/ffprobe-worker.js
```

**生产环境（ASAR 打包后）**:
```
new URL('../workers/ffprobe-worker.ts', import.meta.url)
→ file:///C:/Users/xxx/AppData/Local/motion-slice/resources/app.asar/workers/ffprobe-worker.js
```

Vite 和 Electron 会自动处理这些路径转换，无需手动干预。

#### 4.2.4 避免的反模式（不推荐）

**❌ 错误做法：手动拼接路径**
```typescript
// 脆弱且容易出错
function getWorkerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', '.vite', 'build', 'ffprobe-worker.js');
  } else {
    return path.join(__dirname, 'ffprobe-worker.js');
  }
}

const worker = new Worker(getWorkerPath());
```

**为什么不推荐**:
- ❌ 路径硬编码，Vite 更新后可能失效
- ❌ 需要手动维护开发/生产双套逻辑
- ❌ ASAR 路径可能因 Electron Forge 配置不同而变化
- ❌ 无法利用 Vite 的自动优化（代码分割、Tree Shaking）

#### 4.2.5 Electron Forge 配置

确保 Forge 配置支持 Worker 文件打包：

**`forge.config.ts`**:
```typescript
export default {
  packagerConfig: {
    asar: {
      unpack: '**/*.node',  // 原生模块解包
    }
  },
  // Worker 文件会被自动打包到 ASAR 中，无需特殊配置
};
```

**Why Worker 文件可以留在 ASAR 内**:
- Worker 脚本是纯 JavaScript，不涉及原生二进制
- Node.js 可以直接从 ASAR 内加载 JS 文件
- 只有原生模块（`.node`）和外部可执行文件（ffprobe）需要解包

### 4.3 错误处理策略

| 错误场景                  | 处理方式                                                                 |
|---------------------------|--------------------------------------------------------------------------|
| **文件不存在**            | Worker 返回 `{ type: 'error', error: '文件路径无效或文件不存在' }`      |
| **ffprobe 执行失败**      | 捕获 `execFile` 错误，返回 `{ type: 'error', error: 'ffprobe 解析失败: ...' }` |
| **JSON 解析失败**         | 捕获 `JSON.parse` 异常，返回 `{ type: 'error', error: 'ffprobe 输出解析失败' }` |
| **Worker 崩溃**           | 主进程检测到 `worker.on('exit')`，重建 Worker，当前任务返回失败        |
| **任务超时（> 30 秒）**   | 主进程先杀死 ffprobe 子进程（`childProcess.kill()`），再终止 Worker（`worker.terminate()`），重建新 Worker，任务返回超时错误 |
| **堆内存不足（OOM）**     | Worker 自动终止，主进程检测到退出事件，重建 Worker                      |
| **僵尸进程残留**          | Worker 退出前必须调用 `childProcess.kill()` 终止底层 ffprobe 进程      |
| **应用异常退出**          | `app.on('before-quit')` 触发优雅关闭，广播 `shutdown` 信号，等待所有 Worker 确认后退出 |

**错误传播链**:
```
Worker 内部异常 
  → Worker 捕获并返回 error 消息 
  → WorkerPoolManager 接收 
  → Promise.reject(new Error(...)) 
  → 调用方的 catch 块处理
```

**子进程终止优先级**:
```
1. 正常完成：任务完成后自动清空 currentChildProcess 引用
2. 任务超时：主进程通过 Worker 通信发送终止指令 → Worker 调用 childProcess.kill()
3. Worker 崩溃：主进程检测到退出事件，通过操作系统 API 查找并终止残留进程
4. 应用退出：广播 shutdown 信号 → 所有 Worker 主动终止子进程
```

### 4.4 性能优化点

1. **Worker 复用**:
   - 避免频繁创建/销毁线程（每次创建需要 10-50ms）
   - 空闲 Worker 保持存活 60 秒，应对突发任务

2. **并发控制**:
   - 固定线程池大小（3 个），避免过多并发导致系统资源竞争
   - 任务队列缓冲突发请求

3. **ffprobe 路径缓存**:
   - 主进程初始化时计算一次 ffprobe 路径
   - 通过消息传递给每个 Worker，避免重复计算

4. **内存回收**:
   - 每个任务完成后，Worker 内部的 `stdout` 缓冲区和 JSON 对象在 Worker 堆中释放
   - 即使主进程 GC 未触发，Worker 的堆空间也不会影响主进程

---

## 预期效果

### 内存占用对比

| 场景                          | 当前（主进程执行）      | 优化后（Worker 线程池）  |
|-------------------------------|------------------------|--------------------------|
| 单个 777MB 视频切片分析       | 主进程堆 +200MB        | Worker 堆 +200MB（任务完成后释放） |
| 扫描 6 个视频（5GB 总量）     | 主进程堆累积 4GB，崩溃  | 并发 3 个 Worker，峰值 600MB |
| 批量分析 50 个视频            | 不可用（必崩溃）       | 队列化处理，内存稳定 < 1GB |

### 性能提升

| 指标                          | 当前表现                | 优化后表现              |
|-------------------------------|------------------------|-------------------------|
| **主进程响应性**              | ffprobe 阻塞主线程      | 主线程永不阻塞          |
| **单视频解析耗时**            | ~500ms                 | ~500ms（无变化）        |
| **6 个视频并发解析耗时**      | ~3 秒（如果不崩溃）     | ~1.5 秒（3 个并发）     |
| **应用崩溃率**                | 高（大文件必崩溃）      | 零（内存隔离）          |

### 用户体验改善

- ✅ **消除崩溃**：大文件场景不再导致应用崩溃
- ✅ **界面流畅**：视频扫描期间界面不卡顿
- ✅ **批量处理**：支持同时分析 50+ 个视频
- ✅ **进度可见**：批量任务显示实时进度

---

## 实现步骤

### Phase 1: Worker 脚本实现（约 1 小时）
1. 创建 `src/main/workers/ffprobe-worker.ts`
2. 实现消息监听和 ffprobe 调用逻辑
3. 复用现有格式化函数
4. 添加错误处理和超时控制

### Phase 2: 线程池管理器（约 1.5 小时）
1. 创建 `src/main/workers/worker-pool-manager.ts`
2. 实现 Worker 创建、复用、销毁逻辑
3. 实现任务队列和负载均衡
4. 添加健康监控和崩溃恢复
5. 实现优雅关闭机制（`shutdown()` 方法）
6. 导出单例工厂函数

### Phase 3: 主进程退出钩子集成（约 0.5 小时）
1. 在 `src/main.ts` 中注册 `app.on('before-quit')` 钩子
2. 实现优雅关闭流程：
   ```typescript
   import { getWorkerPoolManager } from './workers/worker-pool-manager';
   
   app.on('before-quit', async (event) => {
     // 阻止立即退出
     event.preventDefault();
     
     try {
       console.log('[Main] 应用退出中，正在关闭 Worker 线程池...');
       const pool = getWorkerPoolManager();
       
       // 等待所有 Worker 优雅关闭（最长 5 秒）
       await pool.shutdown(5000);
       
       console.log('[Main] Worker 线程池已安全关闭');
     } catch (error) {
       console.error('[Main] Worker 关闭超时，强制退出:', error);
       // 超时后强制销毁
       const pool = getWorkerPoolManager();
       pool.destroy();
     } finally {
       // 允许应用真正退出
       app.quit();
     }
   });
   ```
3. 验证应用退出时无残留进程（使用任务管理器检查）

### Phase 4: 现有代码重构（约 1 小时）
1. 修改 `metadata-handler.ts` 的 `parseVideoMetadata()`
2. 修改 `slice-handler.ts` 的 `getVideoDuration()`
3. 修改 `video-scanner.ts` 的批量扫描逻辑
4. 确保所有调用方无需修改代码

### Phase 5: 构建配置（约 0.5 小时）
1. 修改 `vite.main.config.ts` 添加 Worker 配置
2. 在 WorkerPoolManager 中使用 `new Worker(new URL(..., import.meta.url))`
3. 测试开发环境和打包后的 Worker 加载

### Phase 6: 测试验证（约 1.5 小时）
1. **单视频测试**：777MB 视频切片分析，验证内存不增长
2. **批量测试**：扫描 10 个大视频，验证并发控制和内存隔离
3. **压力测试**：连续分析 50 个视频，验证无崩溃
4. **错误测试**：损坏视频、不存在文件，验证错误处理
5. **子进程清理测试**：
   - 任务执行中强制关闭应用，检查是否有残留 ffprobe 进程
   - 使用任务管理器（Windows）或 `ps aux | grep ffprobe`（Linux/macOS）验证
6. **超时终止测试**：模拟超时场景，验证子进程是否被正确终止
7. **性能测试**：对比优化前后的解析耗时

**总计**: 约 5.5 小时开发 + 1.5 小时测试 = **7 小时**

---

## 风险与缓解

| 风险                          | 缓解措施                                                                 |
|-------------------------------|--------------------------------------------------------------------------|
| **Worker 线程兼容性**         | Node.js 12+ 和 Electron 4+ 原生支持，无兼容性问题                        |
| **打包后 Worker 路径错误**    | 使用 `new URL(..., import.meta.url)` 标准语法，Vite 自动处理路径映射    |
| **Worker 启动开销**           | 线程池复用机制，单次启动后可处理多个任务                                 |
| **任务超时导致用户体验差**    | 设置合理的超时时间（30 秒），并在 UI 显示超时提示                        |
| **线程池配置不合理**          | 提供可配置的 `maxWorkers` 参数，可根据用户机器性能动态调整               |
| **僵尸进程锁定视频文件**      | Worker 内保持 `ChildProcess` 引用，超时/崩溃/退出时显式调用 `kill()` 终止 |
| **应用异常退出导致进程残留**  | 注册 `app.on('before-quit')` 钩子，广播 `shutdown` 信号，等待所有 Worker 确认后退出 |
| **Worker 崩溃时子进程残留**   | 主进程检测到 Worker 退出时，通过操作系统 API 清理可能残留的子进程        |
| **Vite 构建配置复杂**         | 使用 ESM 标准的 `import.meta.url`，简化构建配置，无需手动多入口设置      |

---

## 后续扩展

这套 Worker 线程池架构可以扩展到其他计算密集型任务：

1. **视频晃动识别**：将帧差分析迁移到 Worker
2. **视频转码预处理**：FFmpeg 转码前的格式检测
3. **大文件 MD5 校验**：文件哈希计算
4. **视频帧提取**：批量提取关键帧
5. **AI 模型推理**：集成 ONNX Runtime 进行本地推理

**设计原则**：任何可能阻塞主线程或消耗大量内存的任务，都应该迁移到 Worker 线程。
