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
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useVideoStore } from './store/useVideoStore';
import Sidebar from './components/Sidebar.vue';
import VideoPlayer from './components/VideoPlayer.vue';
import Inspector from './components/Inspector.vue';
import Timeline from './components/Timeline.vue';
import BatchVideoGrid from './components/BatchVideoGrid.vue';

const videoStore = useVideoStore();
const { selectedVideos } = storeToRefs(videoStore);
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
