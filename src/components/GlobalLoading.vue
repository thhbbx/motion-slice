<template>
  <Transition name="fade">
    <div v-if="appStore.isImporting" class="global-loading">
      <div class="loading-backdrop" @click.self="handleBackdropClick"></div>
      <div class="loading-content">
        <div class="loading-spinner">
          <svg class="spinner-ring" viewBox="0 0 50 50">
            <circle class="spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="3"></circle>
          </svg>
        </div>
        <div class="loading-message">{{ appStore.importingMessage }}</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useAppStore } from '../store/useAppStore';

const appStore = useAppStore();

// 调试：监听状态变化
watch(() => appStore.isImporting, (newVal) => {
  console.log('[GlobalLoading] isImporting 状态变化:', newVal);
  if (newVal) {
    console.log('[GlobalLoading] Loading 组件应该显示了');
  } else {
    console.log('[GlobalLoading] Loading 组件应该隐藏了');
  }
});

function handleBackdropClick() {
  // 防止用户点击背景关闭（导入过程不可中断）
  console.log('[GlobalLoading] 导入过程中，请稍候...');
}
</script>

<style scoped>
/* 全局加载遮罩层 */
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 深色毛玻璃背景 */
.loading-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 加载内容容器 */
.loading-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--vt-space-4);
  padding: var(--vt-space-8);
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-xl);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
}

/* 动态 Spinner */
.loading-spinner {
  width: 64px;
  height: 64px;
  position: relative;
}

.spinner-ring {
  width: 100%;
  height: 100%;
  animation: rotate 2s linear infinite;
}

.spinner-path {
  stroke: var(--vt-primary);
  stroke-linecap: round;
  stroke-dasharray: 90, 150;
  stroke-dashoffset: 0;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}

/* 加载文字 */
.loading-message {
  font-size: 14px;
  font-weight: 500;
  color: var(--vt-text-secondary);
  letter-spacing: 0.02em;
}

/* 过渡动效 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 300ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active .loading-content,
.fade-leave-active .loading-content {
  transition: transform 300ms ease, opacity 300ms ease;
}

.fade-enter-from .loading-content {
  transform: scale(0.95);
  opacity: 0;
}

.fade-leave-to .loading-content {
  transform: scale(0.95);
  opacity: 0;
}
</style>
