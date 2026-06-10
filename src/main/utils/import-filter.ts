import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getFfprobePath } from './ffprobe-helper';
import type { ImportFilterConfig } from '../../types/import-filter';

export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath();
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ];

    const process = spawn(ffprobePath, args);
    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });

    process.on('error', reject);
  });
}

export async function filterVideoFiles(
  filePaths: string[],
  config: ImportFilterConfig
): Promise<{ accepted: string[]; rejected: string[] }> {
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const filePath of filePaths) {
    try {
      let shouldAccept = true;

      if (config.enableFormatFilter) {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        if (!config.allowedFormats.includes(ext)) {
          shouldAccept = false;
        }
      }

      if (shouldAccept && config.enableSizeFilter) {
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB < config.minSizeMB || sizeMB > config.maxSizeMB) {
          shouldAccept = false;
        }
      }

      if (shouldAccept && config.enableDurationFilter) {
        const duration = await getVideoDuration(filePath);
        if (duration < config.minDurationSec || duration > config.maxDurationSec) {
          shouldAccept = false;
        }
      }

      if (shouldAccept) {
        accepted.push(filePath);
      } else {
        rejected.push(filePath);
      }
    } catch (error) {
      console.error(`过滤文件失败: ${filePath}`, error);
      rejected.push(filePath);
    }
  }

  return { accepted, rejected };
}
