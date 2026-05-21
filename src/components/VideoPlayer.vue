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
const { activeVideo } = storeToRefs(videoStore);

const videoElement = ref<HTMLVideoElement | null>(null);

// 计算属性：视频源路径（Electron 需要 file:// 协议）
const videoSrc = computed(() => {
  if (!activeVideo.value) return '';
  const path = activeVideo.value.path;
  // Windows 路径转换：D:\path\to\video.mp4 -> file://D:/path/to/video.mp4
  const normalizedPath = path.replace(/\\/g, '/');
  return `file://${normalizedPath}`;
});

// 视频加载完成
function handleVideoLoaded() {
  console.log('视频加载成功:', activeVideo.value?.name);
}

// 视频加载错误
function handleVideoError(event: Event) {
  console.error('视频加载失败:', activeVideo.value?.path, event);
}

// 监听视频切换，重置播放器
watch(activeVideo, (newVideo) => {
  if (videoElement.value && newVideo) {
    videoElement.value.currentTime = 0;
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
