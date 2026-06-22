import { Worker } from 'worker_threads';
import * as path from 'node:path';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { WorkerTaskMessage, WorkerResultMessage, VideoMetadata } from '../../types/worker';

// 配置接口
export interface WorkerPoolConfig {
  maxWorkers: number;
  taskTimeout: number;
  idleTimeout: number;
}

// Worker 状态
interface WorkerState {
  worker: Worker;
  isBusy: boolean;
  currentTaskId: string | null;
  lastActiveTime: number;
  timeout?: NodeJS.Timeout;
}

// 待处理任务
interface PendingTask {
  taskId: string;
  filePath: string;
  resolve: (data: VideoMetadata) => void;
  reject: (error: Error) => void;
  submittedAt: number;
}

// 默认配置
const DEFAULT_CONFIG: WorkerPoolConfig = {
  maxWorkers: 3,
  taskTimeout: 30000,
  idleTimeout: 60000
};

export class WorkerPoolManager {
  private config: WorkerPoolConfig;
  private workers: WorkerState[] = [];
  private taskQueue: PendingTask[] = [];
  private activeTasks = new Map<string, PendingTask>();
  private ffprobePath: string;
  private taskIdCounter = 0;
  private isShuttingDown = false;

  constructor(config?: Partial<WorkerPoolConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ffprobePath = getFfprobePath();
    console.log(`[WorkerPoolManager] 初始化线程池，maxWorkers=${this.config.maxWorkers}`);
  }

  // 获取线程池状态
  getStatus() {
    return {
      totalWorkers: this.workers.length,
      activeWorkers: this.workers.filter(w => w.isBusy).length,
      queuedTasks: this.taskQueue.length
    };
  }

  private createWorker(): WorkerState {
    console.log(`[WorkerPoolManager] 创建新 Worker`);

    // 将 Worker 代码作为字符串内联，避免文件路径问题
    const workerCode = `
      const { parentPort } = require('worker_threads');
      const { execFile } = require('node:child_process');
      const fs = require('node:fs');

      let currentChildProcess = null;

      function formatFileSize(bytes) {
        if (bytes < 1024) return bytes.toFixed(0) + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      }

      function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }

      function formatFrameRate(rFrameRate) {
        if (!rFrameRate) return '30 fps';
        if (rFrameRate.includes('/')) {
          const parts = rFrameRate.split('/');
          const fps = Number(parts[0]) / Number(parts[1]);
          return (fps % 1 === 0 ? fps : fps.toFixed(2)) + ' fps';
        }
        return parseFloat(rFrameRate) + ' fps';
      }

      function formatBitrate(bps) {
        if (bps < 1000) return bps + ' bps';
        if (bps < 1000000) return (bps / 1000).toFixed(0) + ' Kbps';
        return (bps / 1000000).toFixed(1) + ' Mbps';
      }

      function handleShutdown(taskId) {
        console.log('[FFprobeWorker] 收到 shutdown 信号');
        if (currentChildProcess) {
          try {
            currentChildProcess.kill(process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM');
          } catch (error) {
            console.error('[FFprobeWorker] 终止子进程失败:', error);
          }
          currentChildProcess = null;
        }
        parentPort.postMessage({ type: 'shutdown-ack', taskId });
        process.exit(0);
      }

      parentPort.on('message', (msg) => {
        if (msg.type === 'shutdown') {
          handleShutdown(msg.taskId);
          return;
        }

        if (msg.type === 'ffprobe-task') {
          const { taskId, filePath, ffprobePath } = msg;

          if (!filePath || !ffprobePath) {
            parentPort.postMessage({ type: 'error', taskId, error: '缺少必需参数' });
            return;
          }

          if (!fs.existsSync(filePath)) {
            parentPort.postMessage({ type: 'error', taskId, error: '文件不存在' });
            return;
          }

          const stats = fs.statSync(filePath);
          const args = ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath];

          currentChildProcess = execFile(ffprobePath, args,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
            (err, stdout) => {
              currentChildProcess = null;

              if (err) {
                parentPort.postMessage({ type: 'error', taskId, error: 'ffprobe 执行失败: ' + err.message });
                return;
              }

              try {
                const metadata = JSON.parse(stdout);
                const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
                const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');

                if (!videoStream) {
                  parentPort.postMessage({ type: 'error', taskId, error: '未找到视频流' });
                  return;
                }

                const result = {
                  size: formatFileSize(stats.size),
                  duration: formatDuration(parseFloat(metadata.format?.duration || '0')),
                  resolution: videoStream.width + 'x' + videoStream.height,
                  fps: formatFrameRate(videoStream.r_frame_rate || '30/1'),
                  videoCodec: videoStream.codec_name || 'unknown',
                  audioCodec: audioStream ? audioStream.codec_name : '无',
                  bitrate: formatBitrate(parseInt(metadata.format?.bit_rate || '0', 10)),
                  createdAt: stats.birthtime.toLocaleString('zh-CN', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                  }).replace(/\\//g, '-')
                };

                parentPort.postMessage({ type: 'success', taskId, data: result });
              } catch (parseError) {
                parentPort.postMessage({ type: 'error', taskId, error: 'JSON 解析失败' });
              }
            }
          );
        }
      });

      console.log('[FFprobeWorker] Worker 已启动');
    `;

    const worker = new Worker(workerCode, { eval: true });

    const workerState: WorkerState = {
      worker,
      isBusy: false,
      currentTaskId: null,
      lastActiveTime: Date.now()
    };

    // 监听 Worker 消息
    worker.on('message', (msg: WorkerResultMessage) => {
      this.handleWorkerMessage(workerState, msg);
    });

    // 监听 Worker 错误
    worker.on('error', (error: Error) => {
      console.error(`[WorkerPoolManager] Worker 错误:`, error);
      this.handleWorkerCrash(workerState, error);
    });

    // 监听 Worker 退出
    worker.on('exit', (code) => {
      console.log(`[WorkerPoolManager] Worker 退出，code=${code}`);
      if (code !== 0 && !this.isShuttingDown) {
        this.handleWorkerCrash(workerState, new Error(`Worker 异常退出，code=${code}`));
      }
    });

    this.workers.push(workerState);
    return workerState;
  }

  private ensureWorkers(): void {
    while (this.workers.length < this.config.maxWorkers) {
      this.createWorker();
    }
  }

  private getIdleWorker(): WorkerState | null {
    return this.workers.find(w => !w.isBusy) || null;
  }

  submitTask(filePath: string): Promise<VideoMetadata> {
    if (this.isShuttingDown) {
      return Promise.reject(new Error('线程池正在关闭中'));
    }

    const taskId = `task-${++this.taskIdCounter}`;
    console.log(`[WorkerPoolManager] 提交任务 ${taskId}: ${filePath}`);

    return new Promise((resolve, reject) => {
      const task: PendingTask = {
        taskId,
        filePath,
        resolve,
        reject,
        submittedAt: Date.now()
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // 确保有足够的 Worker
    this.ensureWorkers();

    // 分配任务给空闲 Worker
    while (this.taskQueue.length > 0) {
      const idleWorker = this.getIdleWorker();
      if (!idleWorker) break;

      const task = this.taskQueue.shift()!;
      this.assignTaskToWorker(idleWorker, task);
    }
  }

  private assignTaskToWorker(workerState: WorkerState, task: PendingTask): void {
    workerState.isBusy = true;
    workerState.currentTaskId = task.taskId;
    workerState.lastActiveTime = Date.now();

    console.log(`[WorkerPoolManager] 分配任务 ${task.taskId} 给 Worker`);

    // 保存活跃任务
    this.activeTasks.set(task.taskId, task);

    // 设置超时定时器
    const timeout = setTimeout(() => {
      this.handleTaskTimeout(workerState, task);
    }, this.config.taskTimeout);

    // 保存超时定时器引用
    workerState.timeout = timeout;

    // 发送任务消息给 Worker
    const msg: WorkerTaskMessage = {
      type: 'ffprobe-task',
      taskId: task.taskId,
      filePath: task.filePath,
      ffprobePath: this.ffprobePath
    };

    workerState.worker.postMessage(msg);
  }

  private handleWorkerMessage(workerState: WorkerState, msg: WorkerResultMessage): void {
    const { type, taskId, data, error } = msg;

    // 清除超时定时器
    if (workerState.timeout) {
      clearTimeout(workerState.timeout);
      workerState.timeout = undefined;
    }

    // 查找对应的任务
    const task = this.activeTasks.get(taskId);

    if (type === 'success' && data) {
      console.log(`[WorkerPoolManager] 任务 ${taskId} 成功完成`);
      task?.resolve(data);
    } else if (type === 'error') {
      console.error(`[WorkerPoolManager] 任务 ${taskId} 失败: ${error}`);
      task?.reject(new Error(error || '未知错误'));
    } else if (type === 'shutdown-ack') {
      console.log(`[WorkerPoolManager] Worker 确认 shutdown: ${taskId}`);
      // shutdown 处理在 shutdown() 方法中完成
      return;
    }

    // 从活跃任务中移除
    this.activeTasks.delete(taskId);

    // 标记 Worker 为空闲
    workerState.isBusy = false;
    workerState.currentTaskId = null;
    workerState.lastActiveTime = Date.now();

    // 继续处理队列中的任务
    this.processQueue();
  }

  private handleTaskTimeout(workerState: WorkerState, task: PendingTask): void {
    console.error(`[WorkerPoolManager] 任务 ${task.taskId} 超时`);

    // 从活跃任务中移除
    this.activeTasks.delete(task.taskId);

    // 拒绝任务
    task.reject(new Error(`任务超时（>${this.config.taskTimeout}ms）`));

    // 终止 Worker 并重建
    try {
      workerState.worker.terminate();
    } catch (error) {
      console.error(`[WorkerPoolManager] 终止 Worker 失败:`, error);
    }

    // 从池中移除并重建
    const index = this.workers.indexOf(workerState);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    if (!this.isShuttingDown) {
      this.createWorker();
      this.processQueue();
    }
  }

  private handleWorkerCrash(workerState: WorkerState, error: Error): void {
    console.error(`[WorkerPoolManager] Worker 崩溃:`, error);

    // 处理当前任务失败
    if (workerState.currentTaskId) {
      const task = this.activeTasks.get(workerState.currentTaskId);
      if (task) {
        this.activeTasks.delete(workerState.currentTaskId);
        task.reject(new Error(`Worker 崩溃: ${error.message}`));
      }
    }

    // 清除超时定时器
    if (workerState.timeout) {
      clearTimeout(workerState.timeout);
    }

    // 从池中移除
    const index = this.workers.indexOf(workerState);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    // 重建 Worker
    if (!this.isShuttingDown) {
      this.createWorker();
      this.processQueue();
    }
  }

  async shutdown(timeout: number = 5000): Promise<void> {
    if (this.isShuttingDown) {
      console.warn(`[WorkerPoolManager] 线程池已在关闭中`);
      return;
    }

    this.isShuttingDown = true;
    console.log(`[WorkerPoolManager] 开始优雅关闭，等待 ${this.workers.length} 个 Worker...`);

    const shutdownPromises = this.workers.map((workerState, index) => {
      return new Promise<void>((resolve) => {
        const taskId = `shutdown-${index}`;

        // 设置超时
        const timer = setTimeout(() => {
          console.warn(`[WorkerPoolManager] Worker ${index} 关闭超时，强制终止`);
          try {
            workerState.worker.terminate();
          } catch (error) {
            console.error(`[WorkerPoolManager] 强制终止 Worker 失败:`, error);
          }
          resolve();
        }, timeout);

        // 监听 shutdown-ack
        const messageHandler = (msg: WorkerResultMessage) => {
          if (msg.type === 'shutdown-ack' && msg.taskId === taskId) {
            clearTimeout(timer);
            workerState.worker.off('message', messageHandler);
            console.log(`[WorkerPoolManager] Worker ${index} 已确认 shutdown`);
            resolve();
          }
        };

        workerState.worker.on('message', messageHandler);

        // 发送 shutdown 信号
        const msg: WorkerTaskMessage = {
          type: 'shutdown',
          taskId
        };
        workerState.worker.postMessage(msg);
      });
    });

    await Promise.all(shutdownPromises);

    // 清空所有状态
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks.clear();

    console.log(`[WorkerPoolManager] 线程池已优雅关闭`);
  }

  destroy(): void {
    console.log(`[WorkerPoolManager] 强制销毁线程池`);
    this.isShuttingDown = true;

    for (const workerState of this.workers) {
      try {
        workerState.worker.terminate();
      } catch (error) {
        console.error(`[WorkerPoolManager] 终止 Worker 失败:`, error);
      }
    }

    this.workers = [];
    this.taskQueue = [];
    this.activeTasks.clear();
  }

  async submitBatch(
    filePaths: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<VideoMetadata[]> {
    console.log(`[WorkerPoolManager] 批量提交 ${filePaths.length} 个任务`);

    const promises = filePaths.map((filePath, index) => {
      return this.submitTask(filePath)
        .then((result) => {
          onProgress?.(index + 1, filePaths.length);
          return result;
        })
        .catch((error) => {
          console.error(`[WorkerPoolManager] 批量任务 ${index} 失败:`, error);
          onProgress?.(index + 1, filePaths.length);
          return null;
        });
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is VideoMetadata => r !== null);
  }
}

// 单例实例
let poolInstance: WorkerPoolManager | null = null;

export function getWorkerPoolManager(config?: Partial<WorkerPoolConfig>): WorkerPoolManager {
  if (!poolInstance) {
    poolInstance = new WorkerPoolManager(config);
  }
  return poolInstance;
}
