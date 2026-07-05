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
    // 主进程发送的 event.taskId 格式：
    // - 单选模式: 'slicer-videoPath'
    // - 多选模式: 'export-videoId'

    // 前端 queueItems 的 taskId 格式：
    // - 单选模式: 'slicer-videoPath-segment-0', 'slicer-videoPath-segment-1', ...
    // - 多选模式: 'videoPath-slice-0', 'videoPath-slice-1', ...

    // 尝试匹配方式：
    // 1. 单选模式：根据 event.taskId 前缀 + event.current 索引匹配
    if (event.taskId.startsWith('slicer-')) {
      // 单选模式：找到当前正在处理的切片（根据 current 索引）
      const segmentTaskId = `${event.taskId}-segment-${event.current - 1}`;
      const currentSegment = exportStore.queueItems.find(
        item => item.taskId === segmentTaskId
      );

      if (currentSegment) {
        // 标记当前切片为已完成
        currentSegment.status = 'success';
        currentSegment.progress = 100;

        // 如果还有下一个切片，标记为处理中
        if (event.current < event.total) {
          const nextSegmentTaskId = `${event.taskId}-segment-${event.current}`;
          const nextSegment = exportStore.queueItems.find(
            item => item.taskId === nextSegmentTaskId
          );
          if (nextSegment) {
            nextSegment.status = 'processing';
          }
        }

        console.log('[App] 单选模式进度更新:', {
          completed: event.current,
          total: event.total,
          currentLabel: event.currentLabel
        });
        return;
      }
    }

    // 2. 批量模式：根据 videoPath + sliceLabel 匹配
    if (event.taskId.startsWith('export-')) {
      const videoPath = event.taskId.replace(/^export-/, '');
      const matchingItem = exportStore.queueItems.find(
        item => item.videoPath === videoPath && item.sliceLabel === event.currentLabel
      );

      if (matchingItem) {
        matchingItem.status = 'success';
        matchingItem.progress = 100;
        matchingItem.currentIndex = event.current;
        matchingItem.totalCount = event.total;
        console.log('[App] 批量模式进度更新:', event.currentLabel);
        return;
      }
    }

    console.warn('[App] 未找到匹配的队列项:', {
      taskId: event.taskId,
      currentLabel: event.currentLabel,
      current: event.current,
      total: event.total
    });
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
