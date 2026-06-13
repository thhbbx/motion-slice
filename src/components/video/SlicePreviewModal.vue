<template>
  <Teleport to="body">
    <div v-if="isVisible" class="slice-preview-modal" @click="handleClose">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <div class="header-info">
            <span class="modal-title">{{ sliceLabel }}</span>
            <span class="time-range">{{ formatTime(startTime) }} - {{ formatTime(endTime) }}</span>
          </div>
          <button class="btn-close" @click="handleClose">✕</button>
        </div>
        <div class="video-container">
          <video
            ref="videoElement"
            class="preview-video"
            controls
            @loadedmetadata="handleVideoReady"
            @timeupdate="handleTimeUpdate"
          >
            <source :src="`file://${videoPath}#t=${startTime}`" type="video/mp4">
          </video>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatTimecode } from '../../utils/timeFormat';

const props = defineProps<{
  isVisible: boolean;
  videoPath: string;
  sliceLabel: string;
  startTime: number;
  endTime: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const videoElement = ref<HTMLVideoElement | null>(null);

watch(() => props.isVisible, (visible) => {
  if (!visible && videoElement.value) {
    videoElement.value.pause();
  }
});

function handleVideoReady() {
  if (videoElement.value) {
    videoElement.value.currentTime = props.startTime;
    videoElement.value.play().catch(() => {
      // 自动播放失败，用户需手动点击
    });
  }
}

function handleTimeUpdate() {
  if (videoElement.value && videoElement.value.currentTime >= props.endTime) {
    videoElement.value.pause();
    videoElement.value.currentTime = props.startTime;
  }
}

function handleClose() {
  emit('close');
}

function formatTime(seconds: number) {
  return formatTimecode(seconds);
}
</script>

<style scoped>
.slice-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(20px) saturate(180%);
  animation: fadeIn 200ms ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: rgba(20, 20, 24, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--vt-radius-xl);
  width: 90%;
  max-width: 1200px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6),
              0 0 0 0.5px rgba(255, 255, 255, 0.04);
  animation: slideUp 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes slideUp {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.01em;
  line-height: 1.3;
  margin: 0;
}

.time-range {
  font-size: 11px;
  font-family: var(--vt-font-mono);
  color: rgba(255, 255, 255, 0.35);
  font-weight: 500;
  line-height: 1.4;
  margin: 0;
}

.btn-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--vt-radius-sm);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 180ms ease;
  font-size: 16px;
  flex-shrink: 0;
}

.btn-close:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
  color: rgba(239, 68, 68, 0.95);
  transform: scale(1.05);
}

.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  padding: var(--vt-space-6);
  overflow: hidden;
}

.preview-video {
  width: 100%;
  height: 100%;
  max-height: calc(90vh - 120px);
  object-fit: contain;
  outline: none;
  border-radius: var(--vt-radius-md);
}
</style>
