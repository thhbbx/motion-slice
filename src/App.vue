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
    <aside class="inspector">
      <div class="vt-panel inspector-panel">
        <div class="panel-header">
          <h2 class="vt-title">视频信息</h2>
        </div>
        <div class="panel-content">
          <div class="info-row">
            <span class="info-label vt-secondary">分辨率</span>
            <span class="info-value">1920 × 1080</span>
          </div>
          <div class="info-row">
            <span class="info-label vt-secondary">时长</span>
            <span class="info-value vt-timecode">00:02:34</span>
          </div>
          <div class="info-row">
            <span class="info-label vt-secondary">帧率</span>
            <span class="info-value">30 fps</span>
          </div>
          <div class="info-row">
            <span class="info-label vt-secondary">编码</span>
            <span class="info-value">H.264</span>
          </div>
        </div>

        <div class="panel-header" style="margin-top: var(--vt-space-6);">
          <h2 class="vt-title">晃动分析</h2>
        </div>
        <div class="panel-content">
          <div class="shake-placeholder vt-secondary">
            暂无晃动分析数据
          </div>
        </div>

        <div class="panel-actions">
          <button class="vt-button-primary">导出切片</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './components/Sidebar.vue';
import VideoPlayer from './components/VideoPlayer.vue';
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

/* Inspector 面板 */
.inspector-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--vt-space-4);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--vt-space-2) 0;
  font-size: 14px;
}

.info-label {
  font-size: 13px;
}

.info-value {
  font-weight: 500;
}

.shake-placeholder {
  padding: var(--vt-space-4);
  text-align: center;
  font-size: 13px;
}

.panel-actions {
  margin-top: auto;
  padding-top: var(--vt-space-4);
}

.panel-actions button {
  width: 100%;
}
</style>
