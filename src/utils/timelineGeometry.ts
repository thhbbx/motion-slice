export const TIMELINE_HEADER_WIDTH = 60;
export const TIMELINE_CONTENT_PADDING = 16;

export interface TimelineMetrics {
  headerWidth: number;
  paddingLeft: number;
  paddingRight: number;
}

export const timelineMetrics: TimelineMetrics = {
  headerWidth: TIMELINE_HEADER_WIDTH,
  paddingLeft: TIMELINE_CONTENT_PADDING,
  paddingRight: TIMELINE_CONTENT_PADDING,
};

export function clampTimelineRatio(currentTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0;

  return Math.max(0, Math.min(1, currentTime / duration));
}

export function getPlayheadPosition(currentTime: number, duration: number): string {
  const ratio = clampTimelineRatio(currentTime, duration);

  // 播放指针现在在独立的 .playhead-overlay 中
  // 该层已经通过 left: 60px 避开了表头，并有 padding: 0 16px 与轨道对齐
  // 因此这里只需要返回纯粹的时间百分比即可
  return `${ratio * 100}%`;
}

export function getSeekRatio(offsetX: number, containerWidth: number, metrics = timelineMetrics): number | null {
  const contentWidth = containerWidth - metrics.headerWidth - metrics.paddingLeft - metrics.paddingRight;
  const contentStart = metrics.headerWidth + metrics.paddingLeft;
  const contentEnd = contentStart + contentWidth;

  if (contentWidth <= 0 || offsetX < metrics.headerWidth || offsetX > containerWidth) {
    return null;
  }

  if (offsetX <= contentStart) return 0;
  if (offsetX >= contentEnd) return 1;

  return Math.max(0, Math.min(1, (offsetX - contentStart) / contentWidth));
}
