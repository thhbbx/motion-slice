import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { FileNode } from '../types/file-tree';

export const useFileTreeStore = defineStore('fileTree', () => {
  // 状态：文件树根节点列表
  const roots = ref<FileNode[]>([]);

  // 状态：当前选中的文件节点 ID
  const selectedFileId = ref<string | null>(null);

  // 状态：展开的目录节点 ID 集合
  const expandedDirIds = ref<Set<string>>(new Set());

  // 计算属性：当前选中的文件节点
  const selectedFile = computed(() => {
    if (!selectedFileId.value) return null;
    return findNodeById(roots.value, selectedFileId.value);
  });

  // 辅助函数：递归查找节点
  function findNodeById(nodes: FileNode[], id: string): FileNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  // Action：加载文件树
  async function loadFileTree() {
    console.log('[FileTreeStore] 开始加载文件树');
    try {
      const fileTree = await window.motionSlice.selectMediaFiles();
      console.log('[FileTreeStore] 收到文件树数据:', fileTree);
      roots.value = fileTree;

      // 自动展开所有根节点
      fileTree.forEach(node => {
        if (node.type === 'directory') {
          expandedDirIds.value.add(node.id);
        }
      });
      console.log('[FileTreeStore] 文件树加载完成');
    } catch (error) {
      console.error('[FileTreeStore] 加载文件树失败:', error);
      throw error;
    }
  }

  // Action：选中文件
  function selectFile(fileId: string | null) {
    selectedFileId.value = fileId;
  }

  // Action：切换目录展开/折叠状态
  function toggleDirectory(dirId: string) {
    if (expandedDirIds.value.has(dirId)) {
      expandedDirIds.value.delete(dirId);
    } else {
      expandedDirIds.value.add(dirId);
    }
  }

  // Action：检查目录是否展开
  function isDirectoryExpanded(dirId: string): boolean {
    return expandedDirIds.value.has(dirId);
  }

  /**
   * 重置工作区状态（导入新视频时调用）
   */
  function reset() {
    roots.value = [];
    selectedFileId.value = null;
    expandedDirIds.value.clear();
    console.log('[FileTreeStore] 工作区状态已重置');
  }

  return {
    // 状态
    roots,
    selectedFileId,
    expandedDirIds,
    selectedFile,
    // Actions
    loadFileTree,
    selectFile,
    toggleDirectory,
    isDirectoryExpanded,
    reset,
  };
});
