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
    /Could not find tag for codec/i,
    /codec not currently supported in container/i,
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
        // PCM 音频不兼容 MP4 容器
        if (line.includes('Could not find tag for codec') && line.includes('pcm')) {
          return '源视频包含 PCM 音频，MP4 容器不支持。建议：(1) 导出为 MOV 格式保持无损，或 (2) 将质量调整到 99 以下自动转码为 AAC';
        }
        // 其他编解码器不兼容
        if (line.includes('Could not find tag for codec') || line.includes('codec not currently supported')) {
          return '源视频的音频/视频编码与目标容器不兼容。建议：(1) 更换导出格式（MOV/AVI），或 (2) 将质量调整到 99 以下自动转码';
        }
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
 * 计算相对路径（用于保留目录层级）
 */
function calculateRelativePath(sourceFilePath: string, rootDir?: string): string {
  if (!rootDir) {
    // 场景 1：勾选单个文件，直接返回文件名
    return path.basename(sourceFilePath, path.extname(sourceFilePath));
  }

  // 场景 2：勾选目录，提取相对路径
  const normalizedSource = path.normalize(sourceFilePath);
  const normalizedRoot = path.normalize(rootDir);

  if (normalizedSource.startsWith(normalizedRoot)) {
    const relativePath = path.relative(normalizedRoot, path.dirname(normalizedSource));
    const fileName = path.basename(sourceFilePath, path.extname(sourceFilePath));
    return path.join(path.basename(normalizedRoot), relativePath, fileName);
  }

  // 兜底：无法匹配时返回文件名
  console.warn('[ExportHandler] 根目录不匹配，退回到平铺模式', {
    source: normalizedSource,
    root: normalizedRoot
  });
  return path.basename(sourceFilePath, path.extname(sourceFilePath));
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

    // 如果格式为 'auto'，自动使用源视频的扩展名
    let actualFormat = format;
    if (format === 'auto') {
      const sourceExt = path.extname(sourceFilePath).toLowerCase().slice(1); // 移除开头的点
      actualFormat = sourceExt || 'mp4'; // 默认回退到 mp4
      console.log(`[ExportHandler] 自动检测格式: ${sourceExt} (源文件: ${path.basename(sourceFilePath)})`);
    }

    const duration = endTime - startTime;
    if (duration <= 0) {
      reject(new Error(`片段时间范围无效: ${startTime}s - ${endTime}s`));
      return;
    }

    const resolvedSource = resolveSourcePath(sourceFilePath);
    const command = ffmpeg(resolvedSource)
      .setStartTime(startTime)
      .setDuration(duration);

    // 根据输出格式选择流映射策略
    if (actualFormat === 'mp4') {
      // MP4 容器限制：只映射视频和音频流，避免不兼容的流类型（如 timecode）导致报错
      command.outputOptions(['-map', '0:v', '-map', '0:a']);
    } else {
      // MOV/AVI 等格式兼容性好：映射所有流（保留字幕、时间码、元数据等）
      // 真正的切分工具：不干涉内容，完整保留原始流结构
      command.outputOptions(['-map', '0']);
    }

    if (quality === 100) {
      // 无损模式：所有流直接拷贝，不做任何转码
      // 切分工具的本质是时间维度的裁剪，保持原始编码格式
      command.outputOptions(['-c', 'copy']);
      if (actualFormat === 'mp4') {
        command.outputOptions(['-movflags', '+faststart']);
      }
    } else {
      // 压缩模式：视频和音频重新编码
      const crf = Math.round(28 - (quality / 100) * 10);
      command.outputOptions([
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '128k',
      ]);

      // 尝试保留其他流（字幕、数据流等），但如果容器不支持会自动跳过
      if (actualFormat !== 'mp4') {
        // MOV/AVI：尝试拷贝其他流（字幕、时间码等）
        command.outputOptions(['-c:s', 'copy', '-c:d', 'copy']);
      }

      if (actualFormat === 'mp4') {
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
  const { sourceFilePath, segments, rootDir } = task.payload;

  if (!segments || segments.length === 0) {
    throw new Error('切片数组为空');
  }

  // 计算相对路径
  const outputSubPath = calculateRelativePath(sourceFilePath, rootDir);
  const outputDirPath = path.join(outputDir, path.dirname(outputSubPath));

  // 创建子目录结构（递归创建）
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
    console.log('[ExportHandler] 创建输出目录:', outputDirPath);
  }

  const baseFileName = path.basename(outputSubPath);

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

  // 逐个导出切片
  const failures: string[] = [];

  // 如果格式为 'auto'，自动使用源视频的扩展名
  let actualFormat = format;
  if (format === 'auto') {
    const sourceExt = path.extname(sourceFilePath).toLowerCase().slice(1); // 移除开头的点
    actualFormat = sourceExt || 'mp4'; // 默认回退到 mp4
    console.log(`[ExportHandler] 自动检测格式: ${actualFormat} (源文件: ${path.basename(sourceFilePath)})`);
  }

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    const outputFilename = sanitizeFilename(`${baseFileName}_${segment.label}.${actualFormat}`);
    const outputPath = path.join(outputDirPath, outputFilename);

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
        actualFormat
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

      // 逐个处理任务（Fail-Safe 模式：一个失败不影响其他任务）
      const batchErrors: string[] = [];

      for (const task of tasks) {
        try {
          if (task.toolId === 'slicer') {
            await exportSlicerTask(task, outputDir, format, quality, mainWindow);
          } else {
            console.warn(`[ExportHandler] 未知工具类型: ${task.toolId}`);
            batchErrors.push(`任务 ${task.title || task.id} 失败: 未知工具类型 ${task.toolId}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[ExportHandler] 任务 ${task.id} 导出失败:`, error);
          batchErrors.push(`${task.title || task.id} 失败: ${errorMessage}`);
          // 继续处理下一个任务
          continue;
        }
      }

      // 判断是否有失败任务
      if (batchErrors.length > 0) {
        const errorSummary = batchErrors.map((err, index) => `  ${index + 1}. ${err}`).join('\n');
        console.error(`[ExportHandler] 批量导出存在部分失败 (${batchErrors.length}/${tasks.length}):\n${errorSummary}`);
        return {
          success: false,
          error: `批量导出存在部分失败 (${batchErrors.length}/${tasks.length}):\n\n${errorSummary}`
        };
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
