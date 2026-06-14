import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 获取 FFmpeg 可执行文件路径
 * 开发环境：从 node_modules 读取
 * 生产环境：从 resources（extraResource）读取
 */
export function getFfmpegPath(): string {
  const platform = process.platform;
  const ffmpegFilename = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  let ffmpegPath: string;

  if (app.isPackaged) {
    // 生产环境：从 resources 目录读取（extraResource 模式）
    ffmpegPath = path.join(
      process.resourcesPath,
      'ffmpeg-static',
      ffmpegFilename
    );
  } else {
    // 开发环境：从项目根目录的 node_modules 读取
    const projectRoot = app.getAppPath();
    ffmpegPath = path.join(
      projectRoot,
      'node_modules',
      'ffmpeg-static',
      ffmpegFilename
    );

    console.log('[FFmpeg Helper] 开发环境路径:', ffmpegPath);
    console.log('[FFmpeg Helper] projectRoot:', projectRoot);
  }

  console.log('[getFfmpegPath] 计算路径:', ffmpegPath);
  console.log('[getFfmpegPath] 文件存在:', fs.existsSync(ffmpegPath));

  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg 未找到: ${ffmpegPath}`);
  }

  // macOS/Linux: 确保二进制文件有可执行权限
  if (platform !== 'win32') {
    try {
      const stats = fs.statSync(ffmpegPath);
      const hasExecutePermission = (stats.mode & fs.constants.S_IXUSR) !== 0;

      if (!hasExecutePermission) {
        console.warn('[getFfmpegPath] 文件缺少执行权限，尝试修复...');
        fs.chmodSync(ffmpegPath, 0o755);
        console.log('[getFfmpegPath] 已添加执行权限');
      }
    } catch (error) {
      console.error('[getFfmpegPath] 权限检查/修复失败:', error);
    }
  }

  return ffmpegPath;
}
