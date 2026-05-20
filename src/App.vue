<template>
  <div class="video-tool-page">
    <div class="layout-container">
      <!-- 左侧 Sidebar -->
      <aside class="sidebar">
        <div class="vt-panel sidebar-panel">
          <div class="panel-header">
            <h2 class="vt-title">文件列表</h2>
          </div>
          <div class="panel-content">
            <div class="vt-card file-card">
              <div class="card-title">video_sample_01.mp4</div>
              <div class="card-meta vt-secondary">1920x1080 · 00:02:34</div>
            </div>
            <div class="vt-card file-card">
              <div class="card-title">video_sample_02.mp4</div>
              <div class="card-meta vt-secondary">3840x2160 · 00:05:12</div>
            </div>
            <div class="vt-card file-card">
              <div class="card-title">video_sample_03.mp4</div>
              <div class="card-meta vt-secondary">1280x720 · 00:01:45</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中间 Workspace -->
      <main class="workspace">
        <!-- 上方：视频预览区 -->
        <div class="preview-area">
          <div class="video-stage">
            <div class="stage-placeholder vt-muted">视频预览区域</div>
          </div>
        </div>

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
  </div>
</template>

<script setup lang="ts">
// 纯静态布局，暂无逻辑
</script>

<style scoped>
.layout-container {
  display: flex;
  height: 100vh;
  gap: var(--vt-space-4);
  padding: var(--vt-space-4);
}

/* 左侧 Sidebar */
.sidebar {
  width: 260px;
  flex-shrink: 0;
}

/* 中间 Workspace */
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-4);
  min-width: 0; /* 防止 flex 子元素溢出 */
}

/* 右侧 Inspector */
.inspector {
  width: 340px;
  flex-shrink: 0;
}

/* Sidebar 面板 */
.sidebar-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--vt-space-4);
}

.panel-header {
  margin-bottom: var(--vt-space-4);
}

.panel-header h2 {
  font-size: 14px;
  margin: 0;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--vt-space-2);
}

/* 文件卡片 */
.file-card {
  padding: var(--vt-space-3);
  cursor: pointer;
}

.file-card:hover {
  border-color: var(--vt-border-strong);
}

.card-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: var(--vt-space-1);
}

.card-meta {
  font-size: 12px;
}

/* 视频预览区 */
.preview-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vt-bg);
  border: 1px solid var(--vt-border);
  border-radius: var(--vt-radius-xl);
  overflow: hidden;
  min-height: 0; /* 防止 flex 子元素溢出 */
}

.video-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vt-bg);
}

.stage-placeholder {
  font-size: 14px;
  text-align: center;
}
</style>
