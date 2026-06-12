export interface Task<T> {
  id: string;
  execute: () => Promise<T>;
}

export class TaskQueue<T> {
  private queue: Task<T>[] = [];
  private isProcessing = false;
  private maxRetries = 3;

  constructor(
    private onProgress?: (current: number, total: number) => void,
    private onTaskComplete?: (taskId: string, result: T) => void,
    private onTaskError?: (taskId: string, error: Error) => void
  ) {}

  enqueue(task: Task<T>) {
    this.queue.push(task);
    console.log(`[TaskQueue] 任务入队: ${task.id}, 队列长度: ${this.queue.length}`);
  }

  async start() {
    if (this.isProcessing) {
      console.warn('[TaskQueue] 队列已在运行中');
      return;
    }

    this.isProcessing = true;
    const total = this.queue.length;
    let current = 0;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      current++;

      console.log(`[TaskQueue] 执行任务 ${current}/${total}: ${task.id}`);
      this.onProgress?.(current, total);

      try {
        const result = await task.execute();
        this.onTaskComplete?.(task.id, result);
      } catch (error) {
        console.error(`[TaskQueue] 任务失败: ${task.id}`, error);
        this.onTaskError?.(task.id, error as Error);
      }
    }

    this.isProcessing = false;
    console.log('[TaskQueue] 队列执行完成');
  }

  clear() {
    this.queue = [];
    console.log('[TaskQueue] 队列已清空');
  }

  get length() {
    return this.queue.length;
  }
}
