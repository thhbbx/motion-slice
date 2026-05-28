import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  // 核心打包配置：决定了你应用的基础信息和文件打包方式
  packagerConfig: {
    // 应用图标配置（不配的话是默认的丑陋 Electron 图标）
    icon: './assets/MotionSlicelOGO', // 不要加后缀，Forge 会自动找 .ico (Win) 或 .icns (Mac)

    // Mac 专属包名配置（如果以后要上架 Mac 或做代码签名，这个必填）
    // appBundleId: 'com.yourname.motionslice',
    asar: {
      unpack: '{**/node_modules/ffprobe-static/**/*,**/node_modules/ffmpeg-static/**/*}'
    },
  },
  // 重新编译 C++ 原生模块的配置（如果没用到 sqlite3、ffi-napi 等底层库，留空即可）
  rebuildConfig: {},
  // Maker (打包引擎)：决定了你的代码最终变成什么格式的安装包
  makers: [
    // 1. Windows 安装包引擎 (.exe)
    // 作用：生成带有安装向导的 Setup.exe 文件。默认会在 Windows 环境下自动触发。
    new MakerSquirrel({
      name: 'MotionSlice', // 安装到电脑后，在“控制面板-卸载程序”里显示的名字
      setupIcon: './assets/MotionSlicelOGO.ico' // 安装程序(.exe)本身的图标，必须是 .ico 格式
    }),

    // 2. Mac 专属安装包引擎 (.dmg)
    // 作用：生成 Mac 经典的拖拽式安装盘。
    // ⚠️ 物理警告：这个引擎只能在 macOS 系统下运行！在 Windows 上强行打 Mac 包会直接报错拦截。
    new MakerDMG({
      format: 'ULFO' // ULFO 是 macOS 推荐的高压缩率只读磁盘映像格式
    }),

    // 3. Mac 压缩包引擎 (.zip)
    // 作用：通常作为 Mac 的备选下载方案（解压后直接是一个 .app 文件）。
    // ['darwin'] 参数表示：这个打包规则“仅限”在构建目标为 Mac 时才被激活。
    new MakerZIP({}, ['darwin']),

    // 4. Linux 安装包引擎
    // 作用：为不同发型版的 Linux 提供安装包。
    new MakerRpm({}), // 针对 RedHat系 (.rpm)，如 CentOS, Fedora
    new MakerDeb({}), // 针对 Debian/Ubuntu系 (.deb)
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
