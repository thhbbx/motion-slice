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
        <!-- 未来实现：时间刻度标记 -->
      </div>

      <!-- 轨道 2：缩略图主轨 -->
      <div class="track track-filmstrip">
        <span class="track-placeholder vt-muted">视频缩略图带 (加载中...)</span>
      </div>

      <!-- 轨道 3：分析标记轨（预留占位） -->
      <div class="track track-analysis">
        <!-- 未来实现：晃动检测标记 -->
      </div>

      <!-- 轨道 4：切片输出轨（预留占位） -->
      <div class="track track-slices">
        <!-- 未来实现：切片区间块 -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';
import { formatTimecode } from '../utils/timeFormat';

const videoStore = useVideoStore();
const { currentTime, duration } = storeToRefs(videoStore);

const tracksContainer = ref<HTMLDivElement | null>(null);

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
  height: 24px;
  background: var(--vt-bg-elevated);
}

/* 轨道 2：缩略图主轨 */
.track-filmstrip {
  height: 60px;
  background: var(--vt-bg);
}

.track-placeholder {
  font-size: 12px;
  user-select: none;
}

/* 轨道 3：分析标记轨（预留） */
.track-analysis {
  height: 24px;
  background: var(--vt-bg-soft);
}

/* 轨道 4：切片输出轨（预留） */
.track-slices {
  height: 24px;
  background: var(--vt-bg-soft);
}
</style>
