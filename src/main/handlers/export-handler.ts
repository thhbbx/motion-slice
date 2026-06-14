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
 * 导出单个视频切片
 * @param sourceFilePath 源视频路径
 * @param outputPath 输出文件路径
 * @param startTime 起始时间（秒）
 * @param endTime 结束时间（秒）
 * @param quality 质量（10-100）
 * @returns Promise<void>
 */
function exportSegment(
  sourceFilePath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
  quality: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 确保 FFmpeg 路径已初始化
    ensureFfmpegPath();

    const duration = endTime - startTime;

    const command = ffmpeg(sourceFilePath)
      .setStartTime(startTime)
      .setDuration(duration);

    // 根据质量选择编码策略
    if (quality === 100) {
      // 质量 100：使用流拷贝，无损极速切割
      command.outputOptions([
        '-c copy',  // 流拷贝，不重新编码
      ]);
    } else {
      // 质量 < 100：使用 libx264 编码，CRF 压制
      const crf = Math.round(28 - (quality / 100) * 10);
      command.outputOptions([
        '-c:v libx264',        // 视频编码器
        `-crf ${crf}`,         // 质量控制
        '-preset fast',        // 编码速度预设
        '-c:a aac',            // 音频编码器
        '-b:a 128k',           // 音频码率
      ]);
    }

    command
      .output(outputPath)
      .on('end', () => {
        console.log(`[ExportHandler] 切片导出完成: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`[ExportHandler] 切片导出失败: ${outputPath}`, err);
        reject(new Error(`导出失败: ${err.message}`));
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
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    try {
      // 生成输出文件名
      const outputFilename = sanitizeFilename(`${sourceBasename}_${segment.label}.${format}`);
      const outputPath = path.join(outputDir, outputFilename);

      console.log(`[ExportHandler] 开始导出切片 ${i + 1}/${segments.length}: ${segment.label}`);

      // 发送进度事件到渲染进程
      mainWindow.webContents.send('export-progress', {
        taskId: task.id,
        current: i + 1,
        total: segments.length,
        currentLabel: segment.label,
      });

      // 执行导出
      await exportSegment(
        sourceFilePath,
        outputPath,
        segment.startTime,
        segment.endTime,
        quality
      );
    } catch (error) {
      console.error(`[ExportHandler] 切片 ${segment.label} 导出失败:`, error);
      // 继续处理下一个切片，不中断整个流程
      // 或者选择抛出错误中断流程：throw error;
    }
  }

  console.log(`[ExportHandler] 任务导出完成: ${task.id}`);
}

/**
 * 注册导出相关 IPC Handlers
 */
export function registerExportHandler(mainWindow: BrowserWindow) {
  // 选择输出目录
  ipcMain.handle('dialog:select-output-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
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
      throw error;
    }
  });
}
