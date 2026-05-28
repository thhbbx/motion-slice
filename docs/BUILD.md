# MotionSlice 打包指南

## 📦 打包前准备

### 1. 图标文件准备

**Windows 图标：**
- ✅ `assets/MotionSlicelOGO.ico` - 已准备

**macOS 图标：**
- ✅ `assets/MotionSlicelOGO.icns` - 已准备

**如何生成 .icns 文件：**

方法 1：使用在线工具
- 访问 https://cloudconvert.com/png-to-icns
- 上传 `assets/logo.png`
- 下载生成的 `.icns` 文件
- 重命名为 `MotionSlicelOGO.icns` 并放入 `assets/` 目录

方法 2：在 macOS 上使用命令行
```bash
# 需要在 macOS 系统上执行
mkdir MotionSlice.iconset
sips -z 16 16     logo.png --out MotionSlice.iconset/icon_16x16.png
sips -z 32 32     logo.png --out MotionSlice.iconset/icon_16x16@2x.png
sips -z 32 32     logo.png --out MotionSlice.iconset/icon_32x32.png
sips -z 64 64     logo.png --out MotionSlice.iconset/icon_32x32@2x.png
sips -z 128 128   logo.png --out MotionSlice.iconset/icon_128x128.png
sips -z 256 256   logo.png --out MotionSlice.iconset/icon_128x128@2x.png
sips -z 256 256   logo.png --out MotionSlice.iconset/icon_256x256.png
sips -z 512 512   logo.png --out MotionSlice.iconset/icon_256x256@2x.png
sips -z 512 512   logo.png --out MotionSlice.iconset/icon_512x512.png
sips -z 1024 1024 logo.png --out MotionSlice.iconset/icon_512x512@2x.png
iconutil -c icns MotionSlice.iconset -o assets/MotionSlicelOGO.icns
```

---

## 🚀 打包命令

### Windows 平台打包

**在 Windows 系统上执行：**

```bash
# 打包 EXE 安装包（一键静默安装）
npm run make:win
```

**输出位置：**
- `out/make/squirrel.windows/x64/motion-slice-0.0.1 Setup.exe` - EXE 安装包

### macOS 平台打包

**在 macOS 系统上执行：**

```bash
# 打包 DMG（推荐，拖拽式安装）
npm run make:mac
```

**输出位置：**
- `out/make/MotionSlice-0.0.1-arm64.dmg` - DMG 磁盘映像

---

## 📋 打包配置说明

### Windows 打包器

| 打包器 | 格式 | 安装方式 | 安装位置 | 适用场景 |
|--------|------|----------|----------|----------|
| **MakerSquirrel** | .exe | 一键静默安装 | 固定到 AppData | 普通用户、支持自动更新 |

**特点：**
- 安装快速，无需用户交互
- 自动安装到 `%LocalAppData%\MotionSlice`
- 支持后台自动更新机制
- 适合 90% 的用户场景

### macOS 打包器

| 打包器 | 格式 | 安装方式 | 用户体验 | 适用场景 |
|--------|------|----------|----------|----------|
| **MakerDMG** | .dmg | 拖拽到 Applications | ⭐⭐⭐⭐⭐ | 推荐，Mac 标准方式 |

**特点：**
- Mac 用户最习惯的安装方式
- 拖拽图标到 Applications 文件夹即可
- 无需额外配置

---

## 🔧 常见问题

### 1. Windows 打包失败

**错误：** `rcedit.exe` 无法修改资源

**解决方案：**
1. 清理旧的打包产物：`rm -rf out/make/squirrel.windows`
2. 重新执行打包命令：`npm run make:win`

### 2. macOS 打包失败

**错误：** `Cannot create DMG on non-darwin platform`

**原因：** DMG 只能在 macOS 系统上打包

**解决方案：**
- 在 macOS 电脑上执行打包命令
- 或使用 GitHub Actions / CI/CD 进行跨平台打包

### 3. 图标不显示

**检查清单：**
- ✅ Windows: `assets/MotionSlicelOGO.ico` 存在
- ✅ macOS: `assets/MotionSlicelOGO.icns` 存在
- ✅ `forge.config.ts` 中 `icon` 路径正确（不带后缀）
- ✅ 重新执行打包命令

### 4. FFmpeg 打包后找不到

**检查清单：**
- ✅ `forge.config.ts` 中配置了 `asar.unpack`
- ✅ 包含 `**/node_modules/ffmpeg-static/**/*`
- ✅ 包含 `**/node_modules/ffprobe-static/**/*`

---

## 📝 版本号管理

修改 `package.json` 中的 `version` 字段：

```json
{
  "version": "0.1.0"  // 修改这里
}
```

**版本号规范（Semver）：**
- `0.0.1` - 初始开发版本
- `0.1.0` - 第一个 Beta 测试版
- `1.0.0` - 第一个正式发布版
- `1.1.0` - 新增功能
- `1.1.1` - Bug 修复

---

## 🎯 完整打包流程示例

### Windows 打包流程

```bash
# 1. 确认版本号
cat package.json | grep version

# 2. 安装依赖（如果是首次打包）
npm install

# 3. 执行打包
npm run make:win

# 4. 检查输出
ls out/make/squirrel.windows/x64/

# 5. 测试安装包
# - 双击 .exe 文件测试一键安装
```

### macOS 打包流程

```bash
# 1. 确认版本号
cat package.json | grep version

# 2. 安装依赖（如果是首次打包）
npm install

# 3. 执行打包
npm run make:mac

# 4. 检查输出
ls out/make/*.dmg

# 5. 测试安装包
# - 双击 .dmg 文件测试拖拽安装
```

---

## 📦 发布清单

打包完成后，发布前检查：

- [ ] 版本号已更新
- [ ] 图标正确显示
- [ ] 安装包可以正常安装
- [ ] 应用可以正常启动
- [ ] 核心功能测试通过
- [ ] 视频导入功能正常
- [ ] 切片功能正常
- [ ] 导出功能正常
- [ ] FFmpeg 正常工作
- [ ] 卸载功能正常

---

## 🔗 相关资源

- [Electron Forge 官方文档](https://www.electronforge.io/)
- [Electron 打包最佳实践](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
