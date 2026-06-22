import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // Electron Forge 会自动管理 main 和 preload 入口
  // 暂时移除 Worker 的显式配置，让 Vite 在运行时处理
});
