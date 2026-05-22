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

/**
 * 将秒数格式化为刻度尺标签（智能省略前导零）
 * 规则：
 * - 小于 60 秒：返回 "Xs"（如 "5s", "30s"）
 * - 小于 1 小时：返回 "mm:ss"（如 "01:30", "05:00"）
 * - 大于等于 1 小时：返回 "H:mm:ss"（如 "1:05:30", "2:00:00"）
 * @param seconds 秒数
 * @returns 格式化后的刻度标签
 */
export function formatRulerLabel(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0s';

  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h === 0) {
    // mm:ss 格式
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // H:mm:ss 格式（小时不补零）
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
