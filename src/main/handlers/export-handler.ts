import { ipcMain, dialog, BrowserWindow } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import path from 'node:path';
import fs from 'node:fs';
import { getFfmpegPath } from '../utils/ffmpeg-helper';
import { getFfprobePath } from '../utils/ffprobe-helper';
import type { ExportExecuteParams, ExportTask } from '../../types/export';

/**
 * 初始化 FFmpeg/FFprobe 路径（延迟到首次使用时）
 */
let ffmpegInitialized = false;
function ensureFfmpegPath() {
  if (!ffmpegInitialized) {
    const ffmpegPath = getFfmpegPath();
    const ffprobePath = getFfprobePath();
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    ffmpegInitialized = true;
    console.log('[Export Handler] FFmpeg 路径已设置:', ffmpegPath);
    console.log('[Export Handler] FFprobe 路径已设置:', ffprobePath);
  }
}

/**
 * 生成安全的文件名（移除特殊字符）
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * 确保输出目录存在
 */
function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * 检查磁盘空间是否充足
 * @param outputDir 输出目录
 * @param estimatedSizeBytes 预估文件大小（字节）
 * @throws 如果空间不足则抛出错误
 */
function checkDiskSpace(outputDir: string, estimatedSizeBytes: number): void {
  try {
    const stats = fs.statfsSync ? fs.statfsSync(outputDir) : null;
    if (!stats) {
      console.warn('[ExportHandler] 无法检测磁盘空间（fs.statfsSync 不可用），跳过检查');
      return;
    }

    const availableBytes = stats.bavail * stats.bsize;
    const requiredBytes = estimatedSizeBytes * 1.1; // 预留 10% 安全边界

    if (availableBytes < requiredBytes) {
      const availableGB = (availableBytes / (1024 ** 3)).toFixed(2);
      const requiredGB = (requiredBytes / (1024 ** 3)).toFixed(2);
      throw new Error(
        `目标磁盘空间不足：可用 ${availableGB} GB，需要约 ${requiredGB} GB\n` +
        `请清理磁盘空间或更换导出目录`
      );
    }

    const availableGB = (availableBytes / (1024 ** 3)).toFixed(2);
    console.log(`[ExportHandler] 磁盘空间检查通过：可用 ${availableGB} GB`);
  } catch (error) {
    // 如果是我们主动抛出的空间不足错误，直接向上传递
    if (error instanceof Error && error.message.includes('磁盘空间不足')) {
      throw error;
    }
    // 其他错误（如 API 不支持）只打印警告，不阻塞导出
    console.warn('[ExportHandler] 磁盘空间检查失败（将继续导出）:', error);
  }
}

/**
 * 解析可用于 FFmpeg 的源文件路径（macOS 上统一为文件系统原生路径）
 */
function resolveSourcePath(sourceFilePath: string): string {
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`源文件不存在: ${sourceFilePath}`);
  }
  return fs.realpathSync.native(sourceFilePath);
}

/**
 * 从 FFmpeg stderr 中提取真正的错误信息
 * @param stderr FFmpeg 完整输出
 * @returns 简化的、人类可读的错误信息
 */
function parseFFmpegError(stderr: string): string {
  const lines = stderr.trim().split('\n');

  // 查找真正的错误行（通常在最后，且包含错误关键词）
  const errorPatterns = [
    /No space left on device/i,
    /Operation not permitted/i,
    /Permission denied/i,
    /No such file or directory/i,
    /Invalid argument/i,
    /already exists/i,
    /Conversion failed/i,
    /Error /i,
  ];

  // 从后往前找第一个匹配的错误行
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        // 提取错误信息
        if (line.includes('No space left on device')) {
          return '磁盘空间不足，请清理目标磁盘后重试或更换导出目录';
        }
        if (line.includes('Operation not permitted')) {
          const filename = line.split(':')[0].trim();
          return `文件被占用或无权限操作: ${path.basename(filename)}（可能正在被其他程序使用，请关闭后重试）`;
        }
        if (line.includes('Permission denied')) {
          return '权限不足，无法写入目标文件';
        }
        if (line.includes('No such file or directory')) {
          return '源文件不存在或路径无效';
        }
        if (line.includes('already exists')) {
          return '目标文件已存在';
        }
        // 返回原始错误行（去除路径前缀）
        return line.replace(/^.*:\s*/, '');
      }
    }
  }

  // 如果没有找到明确的错误模式，返回最后几行（排除 FFmpeg 版本信息）
  const relevantLines = lines.filter(line =>
    !line.startsWith('ffmpeg version') &&
    !line.startsWith('built with') &&
    !line.startsWith('configuration:') &&
    !line.startsWith('lib') &&
    !line.startsWith('Input #') &&
    !line.startsWith('Output #') &&
    !line.startsWith('Stream #') &&
    !line.startsWith('Metadata:') &&
    !line.trim().startsWith('Duration:') &&
    line.trim().length > 0
  );

  return relevantLines.slice(-3).join(' ').trim() || '导出失败';
}

/**
 * 导出单个视频切片
 * @param sourceFilePath 源视频路径
 * @param outputPath 输出文件路径
 * @param startTime 起始时间（秒）
 * @param endTime 结束时间（秒）
 * @param quality 质量（10-100）
 * @param format 输出格式
 * @returns Promise<void>
 */
function exportSegment(
  sourceFilePath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
  quality: number,
  format: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureFfmpegPath();

    const duration = endTime - startTime;
    if (duration <= 0) {
      reject(new Error(`片段时间范围无效: ${startTime}s - ${endTime}s`));
      return;
    }

    const resolvedSource = resolveSourcePath(sourceFilePath);
    const command = ffmpeg(resolvedSource)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions(['-map', '0:v:0', '-map', '0:a:0?']);

    if (quality === 100) {
      // MP4 容器不支持直接拷贝 MOV 中常见的 PCM 音频，需保留视频流拷贝并转码音频
      if (format === 'mp4') {
        command.outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ]);
      } else {
        command.outputOptions(['-c', 'copy']);
      }
    } else {
      const crf = Math.round(28 - (quality / 100) * 10);
      command.outputOptions([
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '128k',
      ]);
      if (format === 'mp4') {
        command.outputOptions(['-movflags', '+faststart']);
      }
    }

    let stderr = '';

    command
      .output(outputPath)
      .on('stderr', (line) => {
        stderr += `${line}\n`;
      })
      .on('end', () => {
        try {
          if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
            reject(new Error(`导出结果为空文件: ${outputPath}`));
            return;
          }
          console.log(`[ExportHandler] 切片导出完成: ${outputPath}`);
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .on('error', (err) => {
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // 忽略清理失败
          }
        }

        // 完整的技术细节打印到控制台
        console.error(`[ExportHandler] 切片导出失败: ${outputPath}`);
        console.error('[ExportHandler] FFmpeg 错误对象:', err);
        if (stderr.trim()) {
          console.error('[ExportHandler] FFmpeg 完整输出:\n', stderr);
        }

        // 提取人类可读的错误信息
        const userFriendlyError = parseFFmpegError(stderr);
        reject(new Error(userFriendlyError));
      })
      .run();
  });
}

/**
 * 批量导出切片任务
 * @param task 导出任务
 * @param outputDir 输出目录
 * @param format 输出格式
 * @param quality 质量
 * @param mainWindow 主窗口（用于发送进度事件）
 */
async function exportSlicerTask(
  task: ExportTask,
  outputDir: string,
  format: string,
  quality: number,
  mainWindow: BrowserWindow
): Promise<void> {
  const { sourceFilePath, segments } = task.payload;

  if (!segments || segments.length === 0) {
    throw new Error('切片数组为空');
  }

  // 确保输出目录存在
  ensureOutputDir(outputDir);

  // 预估所需磁盘空间
  try {
    const sourceStats = fs.statSync(sourceFilePath);
    const sourceSize = sourceStats.size;

    // 计算切片总时长占比
    const totalDuration = segments.reduce((sum, seg) => sum + (seg.endTime - seg.startTime), 0);

    // 估算公式：
    // - 如果是无损导出（quality=100），约等于源文件大小 * 时长占比
    // - 如果是压缩导出，按比例缩减（quality < 100 通常能减少 30%-50%）
    const durationRatio = segments.length > 0 ? 1 : 0; // 简化：假设切片占满视频
    const qualityFactor = quality === 100 ? 1.0 : 0.7; // 压缩导出预估保留 70%
    const estimatedSize = sourceSize * durationRatio * qualityFactor * segments.length;

    checkDiskSpace(outputDir, estimatedSize);
  } catch (error) {
    // 如果是磁盘空间不足错误，直接抛出
    if (error instanceof Error && error.message.includes('磁盘空间不足')) {
      throw error;
    }
    // 其他错误（如源文件无法读取）记录警告但继续
    console.warn('[ExportHandler] 磁盘空间预检查失败（将继续导出）:', error);
  }

  // 获取源文件名（不含扩展名）
  const sourceBasename = path.basename(sourceFilePath, path.extname(sourceFilePath));

  // 逐个导出切片
  const failures: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    const outputFilename = sanitizeFilename(`${sourceBasename}_${segment.label}.${format}`);
    const outputPath = path.join(outputDir, outputFilename);

    console.log(
      `[ExportHandler] 开始导出切片 ${i + 1}/${segments.length}: ${segment.label}`,
      { sourceFilePath, outputPath, startTime: segment.startTime, endTime: segment.endTime }
    );

    try {
      await exportSegment(
        sourceFilePath,
        outputPath,
        segment.startTime,
        segment.endTime,
        quality,
        format
      );

      mainWindow.webContents.send('export-progress', {
        taskId: task.id,
        current: i + 1,
        total: segments.length,
        currentLabel: segment.label,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 完整的错误信息仅打印到控制台
      console.error(`[ExportHandler] 切片 ${segment.label} 导出失败:`, error);
      // 用户界面只显示简化的错误信息
      failures.push(`${segment.label}: ${message}`);
    }
  }

  if (failures.length > 0) {
    // 只在弹框中显示失败数量和简要信息，不包含 FFmpeg 技术细节
    const errorSummary = failures.map(f => `  • ${f}`).join('\n');
    throw new Error(
      `部分切片导出失败 (${failures.length}/${segments.length}):\n\n${errorSummary}\n\n详细错误信息已打印到控制台`
    );
  }

  console.log(`[ExportHandler] 任务导出完成: ${task.id}`);
}

let activeMainWindow: BrowserWindow | null = null;

/**
 * 更新导出 Handler 使用的主窗口引用
 * @param mainWindow 新创建的主窗口实例
 */
export function updateExportMainWindow(mainWindow: BrowserWindow) {
  activeMainWindow = mainWindow;
  console.log('[ExportHandler] 主窗口引用已更新');
}

/**
 * 注册导出相关 IPC Handlers（应用启动时调用一次）
 */
export function registerExportHandler() {
  console.log('[ExportHandler] 开始注册 IPC Handlers');

  // 选择输出目录
  ipcMain.handle('dialog:select-output-dir', async () => {
    const parentWindow = activeMainWindow ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(parentWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择输出目录',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // 执行导出
  ipcMain.handle('export:execute', async (_, params: ExportExecuteParams) => {
    try {
      console.log('[ExportHandler] 收到导出请求:', params);
      const { tasks, outputDir, format, quality } = params;

      // 参数验证
      if (!tasks || tasks.length === 0) {
        throw new Error('任务列表为空');
      }
      if (!outputDir || !fs.existsSync(outputDir)) {
        throw new Error('输出目录无效');
      }

      const mainWindow = activeMainWindow;
      if (!mainWindow) {
        throw new Error('主窗口未就绪');
      }

      // 逐个处理任务
      for (const task of tasks) {
        if (task.toolId === 'slicer') {
          await exportSlicerTask(task, outputDir, format, quality, mainWindow);
        } else {
          console.warn(`[ExportHandler] 未知工具类型: ${task.toolId}`);
        }
      }

      console.log('[ExportHandler] 所有任务导出完成');
      return { success: true };
    } catch (error) {
      console.error('[ExportHandler] 导出失败:', error);
      const message = error instanceof Error ? error.message : '导出失败';
      return { success: false, error: message };
    }
  });
}
