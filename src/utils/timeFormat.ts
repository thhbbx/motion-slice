/**
 * 时间格式化工具函数
 */

/**
 * 将秒数格式化为 HH:mm:ss 格式
 * @param seconds 秒数
 * @returns 格式化后的时间字符串
 */
export function formatTimecode(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/**
 * 将 HH:mm:ss 格式的时间码转换为秒数
 * @param timecode 时间码字符串，格式：HH:mm:ss 或 mm:ss
 * @returns 秒数
 */
export function parseTimecode(timecode: string): number {
  if (!timecode || typeof timecode !== 'string') return 0;

  const parts = timecode.split(':').map(p => parseInt(p, 10));

  if (parts.length === 3) {
    // HH:mm:ss
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    // mm:ss
    const [m, s] = parts;
    return m * 60 + s;
  }

  return 0;
}
