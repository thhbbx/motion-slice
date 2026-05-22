import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FileNode } from '../types/file-tree';
import { parseTimecode } from '../utils/timeFormat';

export const useVideoStore = defineStore('video', () => {
  // 状态：当前激活的视频节点（null 表示未选中任何视频）
  const activeVideo = ref<FileNode | null>(null);

  // 状态：是否正在获取视频元数据
  const isFetchingMetadata = ref(false);

  // 状态：当前播放时间（秒）
  const currentTime = ref<number>(0);

  // 状态：视频总时长（秒）
  const duration = ref<number>(0);

  // Action：设置当前激活的视频并加载深度元数据
  async function setActiveVideo(video: FileNode | null) {
    activeVideo.value = video;

    // 如果选中了视频文件，立即加载深度元数据
    if (video && video.type === 'file' && video.metadata) {
      isFetchingMetadata.value = true;

      try {
        const deepMetadata = await window.motionSlice.getVideoMetadata(video.path);

        // 合并深层元数据到 activeVideo（强制触发响应式更新）
        if (activeVideo.value?.id === video.id) {
          // 创建新对象，确保 Vue 能检测到变化
          activeVideo.value = {
            ...activeVideo.value,
            metadata: {
              ...activeVideo.value.metadata,
              ...deepMetadata,
            },
          };

          // 同步 duration 状态，保持一致性
          if (deepMetadata.duration) {
            // deepMetadata.duration 是字符串格式（HH:mm:ss），需要转换为秒数
            const durationInSeconds = parseTimecode(deepMetadata.duration);
            setDuration(durationInSeconds);
          }
        }
      } catch (error) {
        console.error('加载视频元数据失败:', error);
        // 保持浅层元数据，不阻断用户操作
      } finally {
        isFetchingMetadata.value = false;
      }
    }
  }

  // Action：清空当前激活的视频
  function clearActiveVideo() {
    activeVideo.value = null;
    isFetchingMetadata.value = false;
    currentTime.value = 0;
    duration.value = 0;
  }

  // Action：设置当前播放时间
  function setCurrentTime(time: number) {
    if (time < 0) {
      currentTime.value = 0;
    } else if (duration.value > 0 && time > duration.value) {
      currentTime.value = duration.value;
    } else {
      currentTime.value = time;
    }
  }

  // Action：设置视频总时长
  function setDuration(dur: number) {
    duration.value = dur > 0 ? dur : 0;
    // 如果当前播放时间超出新时长，自动修正
    if (currentTime.value > duration.value) {
      currentTime.value = duration.value;
    }
  }

  return {
    // 状态
    activeVideo,
    isFetchingMetadata,
    currentTime,
    duration,
    // Actions
    setActiveVideo,
    clearActiveVideo,
    setCurrentTime,
    setDuration,
  };
});
