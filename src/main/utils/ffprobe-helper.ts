import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 获取 ffprobe 可执行文件路径
 * 兼容开发环境和生产环境（ASAR 打包后）
 */
export function getFfprobePath(): string {
  // 在 Windows 上，ffprobe 位于 node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe
  // 在 macOS 上，位于 node_modules/ffprobe-static/bin/darwin/x64/ffprobe
  // 在 Linux 上，位于 node_modules/ffprobe-static/bin/linux/x64/ffprobe

  const platform = process.platform;
  const arch = process.arch;

  let ffprobeFilename = 'ffprobe';
  if (platform === 'win32') {
    ffprobeFilename = 'ffprobe.exe';
  }

  // 构建相对于项目根目录的路径
  let basePath: string;

  if (app.isPackaged) {
    // 生产环境：从 app.asar.unpacked 中读取
    basePath = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
  } else {
    // 开发环境：从项目根目录读取
    // __dirname 在 Vite 构建后指向 .vite/build，需要回退到项目根目录
    basePath = path.join(__dirname, '..', '..');
  }

  const ffprobePath = path.join(
    basePath,
    'node_modules',
    'ffprobe-static',
    'bin',
    platform,
    arch,
    ffprobeFilename
  );

  console.log('[getFfprobePath] 计算路径:', ffprobePath);
  console.log('[getFfprobePath] 文件存在:', fs.existsSync(ffprobePath));

  return ffprobePath;
}
