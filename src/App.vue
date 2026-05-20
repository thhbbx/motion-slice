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
        <!-- 占位内容将在下一步添加 -->
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
// 纯静态布局，暂无逻辑
</script>

<style scoped>
/* 布局样式将在后续步骤添加 */
</style>
