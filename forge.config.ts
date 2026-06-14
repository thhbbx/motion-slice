import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';
import fs from 'fs';

const config: ForgeConfig = {
  // 核心打包配置：决定了你应用的基础信息和文件打包方式
  packagerConfig: {
    // 应用图标配置（不配的话是默认的丑陋 Electron 图标）
    icon: './assets/MotionSlicelOGO', // 不要加后缀，Forge 会自动找 .ico (Win) 或 .icns (Mac)

    // Mac 专属包名配置（如果以后要上架 Mac 或做代码签名，这个必填）
    // appBundleId: 'com.yourname.motionslice',
    asar: {
      unpack: '**/node_modules/{ffprobe-static,ffmpeg-static}/**/*'
    },

    // 打包后处理钩子：确保 macOS/Linux 上的二进制文件有执行权限
    afterCopy: [
      (buildPath, electronVersion, platform, arch, callback) => {
        if (platform === 'darwin' || platform === 'linux') {
          // 标准化架构名称映射
          const archMap: Record<string, string> = {
            'x64': 'x64',
            'arm64': 'arm64',
            'ia32': 'ia32',
          };

          const normalizedArch = archMap[arch] || arch;

          const binaryPaths = [
            // ffprobe 路径
            path.join(buildPath, 'node_modules', 'ffprobe-static', 'bin', platform, normalizedArch, 'ffprobe'),
            // ffmpeg 路径（不同平台可能在不同位置）
            path.join(buildPath, 'node_modules', 'ffmpeg-static', 'ffmpeg'),
          ];

          for (const binaryPath of binaryPaths) {
            if (fs.existsSync(binaryPath)) {
              try {
                fs.chmodSync(binaryPath, 0o755);
                console.log(`[Forge] ✅ 已设置执行权限: ${binaryPath}`);
              } catch (error) {
                console.error(`[Forge] ❌ 设置执行权限失败: ${binaryPath}`, error);
              }
            } else {
              console.warn(`[Forge] ⚠️  二进制文件不存在，跳过: ${binaryPath}`);
            }
          }
        }
        callback();
      }
    ],
  },
  // 重新编译 C++ 原生模块的配置（如果没用到 sqlite3、ffi-napi 等底层库，留空即可）
  rebuildConfig: {},
  // Maker (打包引擎)：决定了你的代码最终变成什么格式的安装包
  // 💡 提示：如果不加任何参数直接运行 `npm run make`，Forge 会自动执行当前系统支持的所有引擎。
  makers: [
    // Windows: 一键安装包 (.exe)
    new MakerSquirrel({
      name: 'MotionSlice',
      setupIcon: './assets/MotionSlicelOGO.ico'
    }),

    // macOS: 拖拽安装包 (.dmg)
    new MakerDMG({
      name: 'MotionSlice',
      format: 'ULFO'
    }),
  ],
  plugins: [
    // Vite 插件桥接：将 Electron 繁杂的编译过程托管给 Vite，实现极速热更新
    new VitePlugin({
      build: [
        {
          // 主进程编译配置
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // 预加载脚本编译配置 (负责主进程与渲染进程的 IPC 安全通信)
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          // 渲染进程 (Vue 页面) 编译配置
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses (熔断器)：Electron 官方的安全锁定机制
    // 在代码签名之前，在二进制底层禁用一些危险特性，防止被黑客注入恶意代码
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false, // 禁止将应用作为普通 Node.js 运行
      [FuseV1Options.EnableCookieEncryption]: true, // 开启 Cookie 硬件加密
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // 禁用 NODE_OPTIONS 环境变量
      [FuseV1Options.EnableNodeCliInspectArguments]: false, // 禁用 Chrome 开发者调试端口
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // 开启 ASAR 文件防篡改校验
      [FuseV1Options.OnlyLoadAppFromAsar]: true, // 强制应用只能从 asar 读取代码
    }),
  ],
};

export default config;
