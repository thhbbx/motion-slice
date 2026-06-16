<template>
  <div class="video-tool-page">
    <Sidebar />

    <main class="workspace">
      <template v-if="selectedVideos.length <= 1">
        <VideoPlayer />
        <div class="timeline-area">
          <Timeline />
        </div>
      </template>

      <BatchVideoGrid v-else :videos="selectedVideos" />
    </main>

    <Inspector />

    <!-- 全局加载遮罩 -->
    <GlobalLoading />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useVideoStore } from './store/useVideoStore';
import { useExportStore } from './store/useExportStore';
import Sidebar from './components/Sidebar.vue';
import VideoPlayer from './components/VideoPlayer.vue';
import Inspector from './components/Inspector.vue';
import Timeline from './components/Timeline.vue';
import BatchVideoGrid from './components/BatchVideoGrid.vue';
import GlobalLoading from './components/GlobalLoading.vue';

const videoStore = useVideoStore();
const { selectedVideos } = storeToRefs(videoStore);

const exportStore = useExportStore();

// 全局 IPC 导出进度监听器（不会因 Tab 切换而卸载）
onMounted(() => {
  window.motionSlice.onExportProgress((event) => {
    // 尝试三种匹配方式：
    // 1. 直接匹配 taskId（单选模式：slicer-videoPath）
    let matchingItem = exportStore.queueItems.find(
      item => item.taskId === event.taskId
    );

    let isSingleMode = false; // 是否为单选模式

    // 2. 批量模式：event.taskId 格式是 export-videoPath，提取 videoPath 后根据 sliceLabel 匹配
    if (!matchingItem && event.taskId.startsWith('export-')) {
      const videoPath = event.taskId.replace(/^export-/, '');
      matchingItem = exportStore.queueItems.find(
        item => item.videoPath === videoPath && item.sliceLabel === event.currentLabel
      );
    } else if (matchingItem) {
      isSingleMode = true; // 单选模式
    }

    if (!matchingItem) {
      console.warn('[App] 未找到匹配的队列项:', { taskId: event.taskId, currentLabel: event.currentLabel });
      return;
    }

    if (isSingleMode) {
      // 单选模式：一个任务包含多个切片，根据 current/total 计算进度
      matchingItem.status = event.current === event.total ? 'success' : 'processing';
      matchingItem.progress = event.total > 0 ? Math.round((event.current / event.total) * 100) : 0;
      matchingItem.currentIndex = event.current;
      matchingItem.totalCount = event.total;
    } else {
      // 批量模式：每个切片是独立的队列项，收到进度事件 = 该切片已完成
      matchingItem.status = 'success';
      matchingItem.progress = 100;
      matchingItem.currentIndex = event.current;
      matchingItem.totalCount = event.total;
    }
  });
});

onUnmounted(() => {
  window.motionSlice.offExportProgress();
});
</script>

<style scoped>
/* 根节点全屏约束 */
.video-tool-page {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  padding: var(--vt-space-4);
  gap: var(--vt-space-4);
  box-sizing: border-box;
}

/* 中间 Workspace */
.workspace {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  overflow: hidden;
}

/* VideoPlayer 组件占据 flex: 1 空间 */

/* 时间轴区 */
.timeline-area {
  height: 180px;
  flex-shrink: 0;
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-xl);
  padding: var(--vt-space-4);
  overflow: hidden;
}
</style>
