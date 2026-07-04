/**
 * 路径格式化工具
 * 用于在批量视频列表中显示父目录路径
 */

import path from 'path-browserify';

/**
 * 从完整路径中提取父目录路径（最后 N 层）
 * @param fullPath 完整文件路径
 * @param depth 保留的目录层级数（默认 2）
 * @returns 格式化的父目录路径（如 "项目1/素材A/"）
 */
export function extractParentPath(fullPath: string, depth: number = 2): string {
  if (!fullPath) return '';

  // Windows 路径使用反斜杠，需要统一处理
  const normalizedPath = fullPath.replace(/\\/g, '/');
  const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));

  if (!dirPath) {
    return ''; // 根目录文件
  }

  const parts = dirPath.split('/').filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  // 取最后 N 层目录
  const relevantParts = parts.slice(-depth);
  return relevantParts.join('/') + '/';
}

/**
 * 格式化路径以适应 UI 显示（带截断）
 * @param fullPath 完整文件路径
 * @param maxLength 最大显示长度（字符数）
 * @returns 格式化后的路径（如 "项目1/.../素材A/"）
 */
export function formatPathForDisplay(fullPath: string, maxLength: number = 30): string {
  const extracted = extractParentPath(fullPath, 2);

  if (extracted.length <= maxLength) {
    return extracted;
  }

  // 路径过长时，保留首尾，中间用 ... 替代
  const parts = extracted.split('/').filter(Boolean);
  if (parts.length > 2) {
    return `${parts[0]}/.../${parts[parts.length - 1]}/`;
  }

  return extracted;
}

/**
 * 从根目录开始显示完整相对路径
 * @param fullPath 完整文件路径
 * @param rootDir 根目录路径（可选）
 * @param maxLength 最大显示长度（字符数）
 * @returns 从根目录开始的相对路径
 */
export function formatPathFromRoot(fullPath: string, rootDir?: string, maxLength: number = 35): string {
  if (!rootDir) {
    // 没有根目录，使用默认的最后 2 层显示
    return formatPathForDisplay(fullPath, maxLength);
  }

  // 计算从根目录到文件的相对路径
  const normalizedSource = fullPath.replace(/\\/g, '/');
  const normalizedRoot = rootDir.replace(/\\/g, '/');

  if (!normalizedSource.startsWith(normalizedRoot)) {
    // 无法匹配，退回到默认显示
    return formatPathForDisplay(fullPath, maxLength);
  }

  // 提取相对路径（包含根目录名称）
  const rootName = normalizedRoot.split('/').filter(Boolean).pop() || '';
  const relativePath = normalizedSource.substring(normalizedRoot.length).replace(/^\/+/, '');
  const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/'));

  if (!dirPath) {
    // 文件直接在根目录下
    return `${rootName}/`;
  }

  const fullDisplayPath = `${rootName}/${dirPath}/`;

  // 如果路径过长，智能压缩
  if (fullDisplayPath.length > maxLength) {
    const parts = dirPath.split('/').filter(Boolean);
    const maxLastPartLength = 12; // 末层目录名最多显示 12 个字符

    if (parts.length === 1) {
      // 只有一层子目录，截断目录名
      const truncatedDir = parts[0].length > maxLastPartLength
        ? parts[0].substring(0, maxLastPartLength) + '...'
        : parts[0];
      return `${rootName}/${truncatedDir}/`;
    } else if (parts.length === 2) {
      // 两层子目录，截断最后一层
      const lastPart = parts[1];
      const truncatedLast = lastPart.length > maxLastPartLength
        ? lastPart.substring(0, maxLastPartLength) + '...'
        : lastPart;
      return `${rootName}/${parts[0]}/${truncatedLast}/`;
    } else {
      // 多层目录，使用 首层/.../末层 格式
      const lastPart = parts[parts.length - 1];
      const truncatedLast = lastPart.length > maxLastPartLength
        ? lastPart.substring(0, maxLastPartLength) + '...'
        : lastPart;
      return `${rootName}/${parts[0]}/.../${truncatedLast}/`;
    }
  }

  return fullDisplayPath;
}
