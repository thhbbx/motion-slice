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
 * 解析可用于 FFmpeg 的源文件路径（macOS 上统一为文件系统原生路径）
 */
function resolveSourcePath(sourceFilePath: string): string {
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`源文件不存在: ${sourceFilePath}`);
  }
  return fs.realpathSync.native(sourceFilePath);
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
        const detail = stderr.trim();
        console.error(`[ExportHandler] 切片导出失败: ${outputPath}`, err);
        if (detail) {
          console.error('[ExportHandler] FFmpeg stderr:', detail);
        }
        reject(new Error(detail || err.message || '导出失败'));
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
      console.error(`[ExportHandler] 切片 ${segment.label} 导出失败:`, error);
      failures.push(`${segment.label}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`部分切片导出失败 (${failures.length}/${segments.length}):\n${failures.join('\n')}`);
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
