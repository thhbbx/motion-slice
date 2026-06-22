import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * 获取 ffprobe 可执行文件路径
 * 兼容开发环境和生产环境（extraResource 打包模式）
 */
export function getFfprobePath(): string {
  const platform = process.platform;
  const arch = process.arch;

  let ffprobeFilename = 'ffprobe';
  if (platform === 'win32') {
    ffprobeFilename = 'ffprobe.exe';
  }

  let ffprobePath: string;

  if (app.isPackaged) {
    // 生产环境：从 resources 目录读取（extraResource 模式）
    // process.resourcesPath 指向 app.asar 所在的 resources 目录
    ffprobePath = path.join(
      process.resourcesPath,
      'ffprobe-static',
      'bin',
      platform,
      arch,
      ffprobeFilename
    );
  } else {
    // 开发环境：从项目根目录的 node_modules 读取
    const projectRoot = app.getAppPath();
    ffprobePath = path.join(
      projectRoot,
      'node_modules',
      'ffprobe-static',
      'bin',
      platform,
      arch,
      ffprobeFilename
    );
  }

  console.log('[getFfprobePath] 计算路径:', ffprobePath);
  console.log('[getFfprobePath] 文件存在:', fs.existsSync(ffprobePath));

  if (!fs.existsSync(ffprobePath)) {
    throw new Error(`ffprobe 未找到: ${ffprobePath}`);
  }

  // macOS/Linux: 确保二进制文件有可执行权限
  if (platform !== 'win32') {
    try {
      const stats = fs.statSync(ffprobePath);
      const hasExecutePermission = (stats.mode & fs.constants.S_IXUSR) !== 0;

      if (!hasExecutePermission) {
        console.warn('[getFfprobePath] 文件缺少执行权限，尝试修复...');
        fs.chmodSync(ffprobePath, 0o755);
        console.log('[getFfprobePath] 已添加执行权限');
      }
    } catch (error) {
      console.error('[getFfprobePath] 权限检查/修复失败:', error);
    }
  }

  return ffprobePath;
}
