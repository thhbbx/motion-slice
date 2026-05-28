import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 获取 FFmpeg 可执行文件路径
 * 开发环境：从 node_modules 读取
 * 生产环境：从 app.asar.unpacked 读取
 */
export function getFfmpegPath(): string {
  const isPackaged = app.isPackaged;

  let ffmpegPath: string;

  if (isPackaged) {
    // 生产环境：从 asar.unpacked 读取
    const unpackedPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
    ffmpegPath = path.join(
      unpackedPath,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
  } else {
    // 开发环境：使用 app.getAppPath() 获取项目根目录
    const projectRoot = app.getAppPath();
    ffmpegPath = path.join(
      projectRoot,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );

    console.log('[FFmpeg Helper] 开发环境路径:', ffmpegPath);
    console.log('[FFmpeg Helper] projectRoot:', projectRoot);
  }

  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg 未找到: ${ffmpegPath}`);
  }

  // macOS/Linux: 确保二进制文件有可执行权限
  if (process.platform !== 'win32') {
    try {
      const stats = fs.statSync(ffmpegPath);
      // 检查是否有执行权限（owner execute bit）
      const hasExecutePermission = (stats.mode & fs.constants.S_IXUSR) !== 0;

      if (!hasExecutePermission) {
        console.warn('[getFfmpegPath] 文件缺少执行权限，尝试修复...');
        // 添加执行权限：0o755 = rwxr-xr-x
        fs.chmodSync(ffmpegPath, 0o755);
        console.log('[getFfmpegPath] 已添加执行权限');
      }
    } catch (error) {
      console.error('[getFfmpegPath] 权限检查/修复失败:', error);
    }
  }

  return ffmpegPath;
}
