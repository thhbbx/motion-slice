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

  if (isPackaged) {
    // 生产环境：从 asar.unpacked 读取
    const unpackedPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
    const ffmpegPath = path.join(
      unpackedPath,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );

    if (!fs.existsSync(ffmpegPath)) {
      throw new Error(`FFmpeg 未找到: ${ffmpegPath}`);
    }

    return ffmpegPath;
  } else {
    // 开发环境：使用 app.getAppPath() 获取项目根目录
    const projectRoot = app.getAppPath();
    const ffmpegPath = path.join(
      projectRoot,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );

    console.log('[FFmpeg Helper] 开发环境路径:', ffmpegPath);
    console.log('[FFmpeg Helper] projectRoot:', projectRoot);

    if (!fs.existsSync(ffmpegPath)) {
      throw new Error(`FFmpeg 未找到: ${ffmpegPath}`);
    }

    return ffmpegPath;
  }
}
