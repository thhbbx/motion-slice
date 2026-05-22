<template>
  <div class="timeline-container">
    <!-- 时间轴头部：时间码显示 -->
    <div class="timeline-header">
      <span class="vt-timecode">{{ formattedCurrentTime }}</span>
      <span class="vt-secondary"> / </span>
      <span class="vt-timecode vt-muted">{{ formattedDuration }}</span>
    </div>

    <!-- 时间轴主体：四轨层叠 + 播放指针 -->
    <div
      ref="tracksContainer"
      class="timeline-tracks-container"
      @click="handleSeek"
    >
      <!-- 播放指针 -->
      <div class="playhead" :style="{ left: playheadPosition }">
        <div class="playhead-handle"></div>
        <div class="playhead-line"></div>
      </div>

      <!-- 轨道 1：刻度尺轨 -->
      <div class="track track-ruler">
        <div
          v-for="tick in timelineTicks"
          :key="tick.time"
          class="ruler-tick"
          :class="{ 'ruler-tick-major': tick.isMajor }"
          :style="{ left: `${tick.position}%` }"
        >
          <div class="ruler-tick-line"></div>
          <span v-if="tick.isMajor" class="ruler-tick-label">{{ tick.label }}</span>
        </div>
      </div>

      <!-- 轨道 2：缩略图主轨 -->
      <div class="track track-filmstrip" :class="{ 'filmstrip-loading': isThumbnailsLoading }">
        <!-- 动态进度反馈 -->
        <div v-if="isThumbnailsLoading" class="filmstrip-progress-overlay">
          <span class="progress-text">正在提取视频帧... {{ thumbProgress }}%</span>
        </div>

        <!-- 缩略图带（渐进式渲染） -->
        <div v-if="thumbnails.length > 0" class="filmstrip-images">
          <img
            v-for="(thumb, index) in thumbnails"
            :key="index"
            :src="thumb"
            class="filmstrip-frame"
            alt="Video thumbnail"
          />
        </div>

        <!-- 空状态 -->
        <span v-if="!isThumbnailsLoading && thumbnails.length === 0" class="track-placeholder vt-muted">
          未加载视频
        </span>
      </div>

      <!-- 轨道 3：分析标记轨（预留占位） -->
      <div class="track track-analysis">
        <!-- 未来实现：晃动检测标记 -->
      </div>

      <!-- 轨道 4：切片输出轨 -->
      <div class="track track-slices">
        <div class="track-label">切片</div>
        <div class="track-content">
          <div
            v-for="slice in previewSlices"
            :key="slice.id"
            class="slice-block"
            :class="{ active: slice.id === activeSliceId }"
            :style="getSliceStyle(slice.startTime, slice.endTime)"
            :title="`${slice.label}: ${slice.startTime.toFixed(2)}s - ${slice.endTime.toFixed(2)}s`"
            @click="handleSliceBlockClick(slice.id, slice.startTime)"
          >
            <span class="slice-block-label">{{ slice.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 任务 4-6：隐藏的 video 和 canvas 元素用于缩略图生成 -->
    <!-- 使用 position: absolute + opacity: 0 替代 display: none，避免浏览器节流 -->
    <video
      ref="hiddenVideoElement"
      style="position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none;"
      muted
      playsinline
      preload="auto"
      crossorigin="anonymous"
    ></video>
    <canvas
      ref="hiddenCanvasElement"
      style="position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none;"
    ></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';
import { useSliceStore } from '../store/useSliceStore';
import { formatTimecode, formatRulerLabel } from '../utils/timeFormat';

const videoStore = useVideoStore();
const { currentTime, duration, activeVideo } = storeToRefs(videoStore);

const sliceStore = useSliceStore();
const { previewSlices, activeSliceId } = storeToRefs(sliceStore);

const tracksContainer = ref<HTMLDivElement | null>(null);

// 任务 4-6：缩略图生成相关状态
const hiddenVideoElement = ref<HTMLVideoElement | null>(null);
const hiddenCanvasElement = ref<HTMLCanvasElement | null>(null);
const thumbnails = ref<string[]>([]);
const isThumbnailsLoading = ref(false);
const thumbProgress = ref(0);

// 步骤 1：定义时间轴刻度接口
interface TimelineTick {
  time: number;        // 时间点（秒）
  position: number;    // 水平位置（百分比 0-100）
  isMajor: boolean;    // 是否为主刻度
  label: string;       // 显示标签（仅主刻度有值）
}

// 计算属性：格式化的当前时间
const formattedCurrentTime = computed(() => formatTimecode(currentTime.value));

// 计算属性：格式化的总时长
const formattedDuration = computed(() => formatTimecode(duration.value));

// 计算属性：播放指针位置（百分比）
const playheadPosition = computed(() => {
  if (duration.value === 0) return '0%';
  const percentage = (currentTime.value / duration.value) * 100;
  return `${Math.min(100, Math.max(0, percentage))}%`;
});

// 点击时间轴定位
function handleSeek(event: MouseEvent) {
  if (!tracksContainer.value || duration.value === 0) return;

  const rect = tracksContainer.value.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const percentage = offsetX / rect.width;
  const seekTime = percentage * duration.value;

  videoStore.setCurrentTime(seekTime);
}

/**
 * 计算切片在时间轴上的位置和宽度
 */
function getSliceStyle(startTime: number, endTime: number) {
  const videoDuration = videoStore.duration;
  if (!videoDuration || videoDuration <= 0) return { left: '0%', width: '0%' };

  // 确保时间值在有效范围内
  const safeStartTime = Math.max(0, Math.min(startTime, videoDuration));
  const safeEndTime = Math.max(safeStartTime, Math.min(endTime, videoDuration));

  const leftPercent = (safeStartTime / videoDuration) * 100;
  const widthPercent = ((safeEndTime - safeStartTime) / videoDuration) * 100;

  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
  };
}

/**
 * 点击切片块
 */
function handleSliceBlockClick(sliceId: string, startTime: number) {
  sliceStore.setActiveSlice(sliceId);
  videoStore.setCurrentTime(startTime);
}

// 步骤 2：计算主刻度间隔
function calculateMajorTickInterval(totalDuration: number): number {
  // 候选步长（秒）：1s, 5s, 10s, 30s, 1min, 5min, 10min, 30min, 1h
  const candidates = [1, 5, 10, 30, 60, 300, 600, 1800, 3600];

  // 目标：主刻度数量在 10-20 个之间
  for (const step of candidates) {
    const count = totalDuration / step;
    if (count >= 10 && count <= 20) {
      return step;
    }
  }

  // 边界处理：视频过短或过长时返回首尾候选值
  return totalDuration < 10 ? candidates[0] : candidates[candidates.length - 1];
}

// 步骤 3：计算时间轴刻度
const timelineTicks = computed<TimelineTick[]>(() => {
  if (duration.value === 0) return [];

  const ticks: TimelineTick[] = [];
  const majorInterval = calculateMajorTickInterval(duration.value);
  const minorInterval = majorInterval / 4;

  const tickCount = Math.ceil(duration.value / minorInterval) + 1;
  for (let i = 0; i < tickCount; i++) {
    const currentTime = i * minorInterval;
    if (currentTime > duration.value) break;

    const isMajor = Math.abs(currentTime % majorInterval) < 0.001;
    ticks.push({
      time: currentTime,
      position: (currentTime / duration.value) * 100,
      isMajor,
      label: isMajor ? formatRulerLabel(currentTime) : '',
    });
  }

  return ticks;
});

// 任务 4-6：单帧捕获辅助函数（带超时保护）
async function seekAndCapture(video: HTMLVideoElement, targetTime: number): Promise<string> {
  const canvas = hiddenCanvasElement.value;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 限制 Canvas 分辨率：宽度固定 160px，高度按比例计算
  const targetWidth = 160;
  const aspectRatio = video.videoHeight / video.videoWidth;
  const targetHeight = Math.round(targetWidth * aspectRatio);

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // 使用 Promise.race 添加 2000ms 超时保护（延长超时时间，减少警告）
  return Promise.race([
    new Promise<string>((resolve, reject) => {
      let isResolved = false;

      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };

      const onSeeked = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        try {
          // 绘制当前帧到 canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // 转换为 base64 JPEG（质量 0.5 降低体积）
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          resolve(dataUrl);
        } catch (error) {
          console.error('[Timeline] Canvas 绘制失败:', error);
          reject(error);
        }
      };

      const onError = (e: Event) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.error('[Timeline] Video seek 错误:', e);
        reject(new Error('Video seek error'));
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });

      // 跳转到指定时间
      video.currentTime = targetTime;
    }),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        // 超时后静默返回占位符，不打印警告（减少控制台噪音）
        resolve('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
      }, 2000);
    })
  ]);
}

// 任务 4-6：视频帧捕获函数（已废弃，使用 seekAndCapture 替代）
async function captureVideoFrame(video: HTMLVideoElement, time: number): Promise<string> {
  return seekAndCapture(video, time);
}

// 任务 4-6：等待视频元数据加载完成（带超时保护）
async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  console.log('[Timeline] 开始等待 Metadata...');

  // 如果已经加载完元数据，直接返回
  if (video.readyState >= 1) {
    console.log('[Timeline] Metadata 已就绪 (readyState >= 1)');
    return Promise.resolve();
  }

  // 使用 Promise.race 添加 5000ms 超时保护
  let timeoutId: number | null = null;
  let isResolved = false;

  return Promise.race([
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };

      const onLoaded = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.log('[Timeline] Metadata 加载成功');
        resolve();
      };

      const onError = (e: Event) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.error('[Timeline] Metadata 加载失败:', e);
        reject(new Error('Failed to load video metadata'));
      };

      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    }),
    new Promise<void>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        console.error('[Timeline] Metadata 加载超时 (5000ms)');
        reject(new Error('Metadata loading timeout after 5000ms'));
      }, 5000);
    })
  ]);
}

// 任务 4-6：生成缩略图函数
async function generateThumbnails(videoPath: string) {
  const video = hiddenVideoElement.value;
  if (!video || duration.value === 0) return;

  console.log('[Timeline] 开始生成缩略图:', videoPath);

  isThumbnailsLoading.value = true;
  thumbnails.value = [];
  thumbProgress.value = 0;

  try {
    // 设置视频源
    video.src = videoPath;

    // 【任务 1】强制媒体引擎加载
    console.log('[Timeline] 强制调用 video.load()');
    video.load();

    // 等待视频元数据加载完成（修复首次加载竞态问题）
    await waitForMetadata(video);

    // 确保视频尺寸有效
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error('Invalid video dimensions');
    }

    console.log('[Timeline] 视频尺寸:', video.videoWidth, 'x', video.videoHeight);

    // 计算缩略图数量（每 5 秒一张，最少 10 张，最多 50 张）
    const interval = 5;
    let count = Math.ceil(duration.value / interval);
    count = Math.max(10, Math.min(50, count));

    const actualInterval = duration.value / count;
    console.log('[Timeline] 计划生成', count, '张缩略图，间隔:', actualInterval.toFixed(2), 's');

    // 渐进式渲染：逐帧生成并实时推入数组
    for (let i = 0; i < count; i++) {
      const time = i * actualInterval;

      try {
        // 【任务 2】使用带超时保护的 seekAndCapture
        const frameData = await seekAndCapture(video, time);

        // 立即推入数组，触发 UI 实时渲染
        thumbnails.value.push(frameData);

        // 更新进度百分比（确保进度条始终前进）
        thumbProgress.value = Math.round(((i + 1) / count) * 100);

        // 强制让出主线程：确保浏览器有时间重绘 DOM
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));
      } catch (err) {
        // 【任务 2】即使当前帧失败，也要继续循环并推进进度
        console.error('[Timeline] 抽帧失败:', err);

        // 推入占位符，保持缩略图数量一致
        thumbnails.value.push('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

        // 进度条必须继续前进
        thumbProgress.value = Math.round(((i + 1) / count) * 100);
      }
    }

    console.log('[Timeline] 缩略图生成完成，共', thumbnails.value.length, '张');
  } catch (error) {
    console.error('[Timeline] 缩略图生成失败:', error);
    thumbnails.value = [];
  } finally {
    isThumbnailsLoading.value = false;
    thumbProgress.value = 0;
  }
}

// 任务 4-6：监听 activeVideo 变化，触发缩略图生成
watch(activeVideo, async (newVideo, oldVideo) => {
  // 立即重置状态，让 UI 瞬间切出"未加载视频"
  thumbnails.value = [];
  isThumbnailsLoading.value = true;
  thumbProgress.value = 0;

  // 必须等待 DOM 更新，确保隐藏 video 的 src 已被 Vue 绑定
  await nextTick();

  if (newVideo?.path) {
    // 【修复】必须 await，否则异步错误无法被捕获
    await generateThumbnails(newVideo.path);
  } else {
    isThumbnailsLoading.value = false;
  }
});
</script>

<style scoped>
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
  height: 100%;
}

/* 时间轴头部 */
.timeline-header {
  display: flex;
  align-items: center;
  gap: var(--vt-space-2);
  font-size: 14px;
  padding: 0 var(--vt-space-2);
}

/* 时间轴主体容器 */
.timeline-tracks-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  cursor: pointer;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
}

/* 播放指针 */
.playhead {
  position: absolute;
  top: 0;
  height: 100%;
  width: 2px;
  z-index: 50;
  pointer-events: none;
}

.playhead-handle {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--vt-danger);
}

.playhead-line {
  position: absolute;
  top: 8px;
  left: 0;
  width: 2px;
  height: calc(100% - 8px);
  background: var(--vt-danger);
}

/* 轨道通用样式 */
.track {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--vt-border);
}

.track:last-child {
  border-bottom: none;
}

/* 轨道 1：刻度尺轨 */
.track-ruler {
  position: relative;
  height: 24px;
  background: var(--vt-bg-elevated);
}

.ruler-tick {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.ruler-tick-line {
  width: 1px;
  background: var(--vt-border);
}

/* 次刻度：短线 */
.ruler-tick:not(.ruler-tick-major) .ruler-tick-line {
  height: 4px;
  margin-top: 4px;
  opacity: 0.4;
}

/* 主刻度：长线 + 标签 */
.ruler-tick-major .ruler-tick-line {
  height: 8px;
  background: var(--vt-border-strong);
}

.ruler-tick-label {
  margin-top: 2px;
  font-size: 10px;
  font-family: var(--vt-font-mono);
  color: var(--vt-muted);
  white-space: nowrap;
  user-select: none;
}

/* 轨道 2：缩略图主轨 */
.track-filmstrip {
  position: relative;
  height: 60px;
  background: var(--vt-bg);
  overflow: hidden;
}

/* 加载中的 Shimmer 扫光动画 */
.filmstrip-loading {
  background: linear-gradient(
    90deg,
    var(--vt-bg) 0%,
    var(--vt-bg-soft) 50%,
    var(--vt-bg) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 进度覆盖层 */
.filmstrip-progress-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.progress-text {
  font-size: 12px;
  font-family: var(--vt-font-mono);
  font-weight: 500;
  color: var(--vt-primary);
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.3);
  letter-spacing: 0.05em;
}

.track-placeholder {
  font-size: 12px;
  user-select: none;
}

/* 任务 4-6：缩略图带样式 */
.filmstrip-images {
  display: flex;
  width: 100%;
  height: 100%;
}

.filmstrip-frame {
  flex: 1;
  height: 100%;
  object-fit: cover;
  border-right: 1px solid var(--vt-border);
}

.filmstrip-frame:last-child {
  border-right: none;
}

/* 轨道 3：分析标记轨（预留） */
.track-analysis {
  height: 24px;
  background: var(--vt-bg-soft);
}

/* 轨道 4：切片输出轨 */
.track-slices {
  position: relative;
  height: 32px;
  background: var(--vt-bg-soft);
}

.track-label {
  position: absolute;
  left: -52px;
  top: 0;
  width: 48px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--vt-muted);
  background: var(--vt-bg-elevated);
  border-right: 1px solid var(--vt-border);
  user-select: none;
  z-index: 1;
}

.track-content {
  position: relative;
  width: 100%;
  height: 100%;
}

.slice-block {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(88, 101, 242, 0.3);
  backdrop-filter: blur(4px);
  border-left: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.16s ease;
  display: flex;
  align-items: center;
  overflow: hidden;
  box-sizing: border-box;
}

.slice-block:hover {
  background: rgba(88, 101, 242, 0.5);
  z-index: 10;
}

.slice-block.active {
  background: rgba(88, 101, 242, 0.7);
  border-top: 1px solid rgba(139, 92, 246, 0.6);
  border-bottom: 1px solid rgba(139, 92, 246, 0.6);
  z-index: 20;
}

.slice-block-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  padding-left: 6px;
  text-align: left;
  width: 100%;
}

.slice-block.active .slice-block-label {
  color: white;
  font-weight: 600;
}
</style>
