<template>
  <div class="video-tool-page">
    <!-- 左侧 Sidebar -->
    <Sidebar />

    <!-- 中间 Workspace -->
    <main class="workspace">
      <!-- 上方：视频预览区 -->
      <VideoPlayer />

      <!-- 下方：时间轴区 -->
      <div class="timeline-area">
        <div class="timeline-header">
          <span class="vt-timecode">00:00:00:00</span>
          <span class="vt-secondary">时间轴占位区</span>
        </div>
        <div class="timeline-tracks">
          <div class="timeline-track">
            <div class="track-clip" style="width: 30%; margin-left: 10%;"></div>
            <div class="track-clip" style="width: 25%; margin-left: 5%;"></div>
          </div>
        </div>
      </div>
    </main>

    <!-- 右侧 Inspector -->
    <Inspector />
  </div>
</template>

<script setup lang="ts">
import Sidebar from './components/Sidebar.vue';
import VideoPlayer from './components/VideoPlayer.vue';
import Inspector from './components/Inspector.vue';
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

/* 右侧 Inspector */
.inspector {
  width: 340px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* VideoPlayer 组件占据 flex: 1 空间 */

/* 时间轴区 */
.timeline-area {
  height: 300px;
  flex-shrink: 0;
  background: var(--vt-bg-elevated);
  border: 1px solid var(--vt-border-strong);
  border-radius: var(--vt-radius-xl);
  padding: var(--vt-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-3);
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: var(--vt-space-3);
  font-size: 14px;
}

.timeline-tracks {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

.timeline-track {
  height: 48px;
  background: var(--vt-bg-soft);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-md);
  display: flex;
  align-items: center;
  padding: 0 var(--vt-space-2);
  gap: var(--vt-space-2);
}

.track-clip {
  height: 32px;
  background: var(--vt-primary-soft);
  border: 1px solid var(--vt-primary);
  border-radius: var(--vt-radius-sm);
}
</style>
