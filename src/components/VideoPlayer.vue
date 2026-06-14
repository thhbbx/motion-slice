<template>
  <div class="video-player">
    <!-- 有视频时显示播放器 -->
    <div v-if="activeVideo" class="video-stage">
      <video
        ref="videoElement"
        class="video-element"
        :src="videoSrc"
        controls
        @loadedmetadata="handleVideoLoaded"
        @timeupdate="handleTimeUpdate"
        @error="handleVideoError"
      />
    </div>

    <!-- 无视频时显示空状态 -->
    <div v-else class="empty-state">
      <div class="empty-icon">🎬</div>
      <div class="empty-text vt-secondary">未选择视频</div>
      <div class="empty-hint vt-muted">从左侧文件列表选择视频文件</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from '../store/useVideoStore';

const videoStore = useVideoStore();
const { activeVideo, currentTime, duration } = storeToRefs(videoStore);

const videoElement = ref<HTMLVideoElement | null>(null);

// 计算属性：视频源路径（Electron 需要 file:// 协议）
const videoSrc = computed(() => {
  if (!activeVideo.value) return '';
  const path = activeVideo.value.path;

  // 跨平台路径处理
  // 1. Windows: D:\path\to\video.mp4 -> file:///D:/path/to/video.mp4
  // 2. macOS/Linux: /Users/path/to/video.mp4 -> file:///Users/path/to/video.mp4
  // 3. URL 编码处理中文和特殊字符

  let normalizedPath = path;

  // Windows: 反斜杠转正斜杠
  if (path.includes('\\')) {
    normalizedPath = path.replace(/\\/g, '/');
  }

  // 确保以 / 开头（Windows 路径需要添加）
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }

  // URL 编码路径组件（保留 /）
  const encodedPath = normalizedPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  return `file://${encodedPath}`;
});

// 视频加载完成
function handleVideoLoaded() {
  console.log('视频加载成功:', activeVideo.value?.name, '时长:', videoElement.value?.duration);
  // 同步视频总时长到 Store
  if (videoElement.value) {
    videoStore.setDuration(videoElement.value.duration);
  }
}

// 视频加载错误
function handleVideoError(event: Event) {
  console.error('视频加载失败:', activeVideo.value?.path, event);
}

// 播放器 timeupdate 事件：同步播放进度到 Store
function handleTimeUpdate() {
  if (videoElement.value) {
    videoStore.setCurrentTime(videoElement.value.currentTime);
  }
}

// 监听视频切换，重置播放器
watch(activeVideo, (newVideo, oldVideo) => {
  // 只在视频真正切换时重置（包括从有到无、从无到有、从 A 到 B）
  if (oldVideo !== newVideo) {
    if (videoElement.value) {
      videoElement.value.currentTime = 0;
    }
    videoStore.setCurrentTime(0);
    // duration 由 loadedmetadata 事件负责设置，此处不需要重置为 0
  }
});

// 防抖标志：防止 Store -> 播放器 -> Store 的循环更新
const isSeekingFromStore = ref<boolean>(false);

// 监听 Store 的 currentTime 变化，同步到播放器（用户点击时间轴时触发）
watch(currentTime, (newTime) => {
  if (!videoElement.value || isSeekingFromStore.value) return;

  // 计算差值，只有当差值 > 0.1 秒时才认为是用户主动 seek
  const diff = Math.abs(videoElement.value.currentTime - newTime);

  if (diff > 0.1) {
    isSeekingFromStore.value = true;
    videoElement.value.currentTime = newTime;

    setTimeout(() => {
      isSeekingFromStore.value = false;
    }, 100);
  }
});
</script>

<style scoped>
.video-player {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vt-bg);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-xl);
  overflow: hidden;
}

.video-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vt-bg);
  padding: var(--vt-space-4);
}

.video-element {
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--vt-radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--vt-space-8);
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: var(--vt-space-4);
  opacity: 0.2;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: var(--vt-space-2);
}

.empty-hint {
  font-size: 13px;
}
</style>
