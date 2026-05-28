# MotionSlice 打包指南

## 📦 打包前准备

### 1. 图标文件准备

**Windows 图标：**
- ✅ `assets/MotionSlicelOGO.ico` - 已准备

**macOS 图标：**
- ⚠️ 需要准备 `assets/MotionSlicelOGO.icns` 文件

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

### 2. Windows 打包环境要求

**WiX Toolset 安装（用于生成 .msi 安装包）：**

1. 下载 WiX Toolset v3.14
   - 官网：https://wixtoolset.org/releases/
   - 直接下载：https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314.exe

2. 安装后重启终端，验证安装：
   ```bash
   candle -?
   ```
   如果显示帮助信息，说明安装成功。

3. 如果提示找不到命令，手动添加环境变量：
   - 路径：`C:\Program Files (x86)\WiX Toolset v3.14\bin`
   - 添加到系统 PATH

**注意：** Squirrel 打包器（.exe）不需要额外依赖，开箱即用。

---

## 🚀 打包命令

### Windows 平台打包

**在 Windows 系统上执行：**

```bash
# 1. 打包所有 Windows 格式（.msi + .exe）
npm run make

# 2. 仅打包 MSI 安装包（向导式，可选安装目录）
npm run make -- --targets="@electron-forge/maker-wix"

# 3. 仅打包 EXE 安装包（一键静默安装）
npm run make -- --targets="@electron-forge/maker-squirrel"
```

**输出位置：**
- `out/make/wix/x64/MotionSlice.msi` - MSI 安装包
- `out/make/squirrel.windows/x64/MotionSlice-0.0.1 Setup.exe` - EXE 安装包

### macOS 平台打包

**在 macOS 系统上执行：**

```bash
# 1. 打包所有 macOS 格式（.dmg + .pkg + .zip）
npm run make

# 2. 仅打包 DMG（推荐，拖拽式安装）
npm run make -- --targets="@electron-forge/maker-dmg"

# 3. 仅打包 PKG（向导式安装）
npm run make -- --targets="@electron-forge/maker-pkg"

# 4. 仅打包 ZIP（免安装绿色版）
npm run make -- --targets="@electron-forge/maker-zip"
```

**输出位置：**
- `out/make/MotionSlice-0.0.1-arm64.dmg` - DMG 磁盘映像
- `out/make/MotionSlice-0.0.1-arm64.pkg` - PKG 安装包
- `out/make/zip/darwin/arm64/MotionSlice-darwin-arm64-0.0.1.zip` - ZIP 压缩包

---

## 📋 打包配置说明

### Windows 打包器对比

| 打包器 | 格式 | 安装方式 | 可选安装目录 | 适用场景 |
|--------|------|----------|--------------|----------|
| **MakerWix** | .msi | 向导式安装 | ✅ 支持 | 企业用户、高级用户 |
| **MakerSquirrel** | .exe | 一键静默安装 | ❌ 固定到 AppData | 普通用户、支持自动更新 |

**推荐策略：**
- 提供两种安装包供用户选择
- MSI：适合需要自定义安装位置的用户
- EXE：适合快速安装的普通用户

### macOS 打包器对比

| 打包器 | 格式 | 安装方式 | 用户体验 | 适用场景 |
|--------|------|----------|----------|----------|
| **MakerDMG** | .dmg | 拖拽到 Applications | ⭐⭐⭐⭐⭐ | 推荐，Mac 标准方式 |
| **MakerPKG** | .pkg | 向导式安装 | ⭐⭐⭐ | 系统级工具 |
| **MakerZIP** | .zip | 解压即用 | ⭐⭐⭐⭐ | 绿色版、备选方案 |

**推荐策略：**
- 主推 DMG 格式（Mac 用户最习惯）
- 提供 ZIP 作为备选下载

---

## 🔧 常见问题

### 1. WiX 打包失败

**错误：** `spawn candle ENOENT`

**解决方案：**
1. 确认已安装 WiX Toolset v3.14
2. 重启终端或 IDE
3. 验证环境变量：`echo %PATH%` 中是否包含 WiX 路径

### 2. macOS 打包失败

**错误：** `Cannot create DMG on non-darwin platform`

**原因：** DMG 和 PKG 只能在 macOS 系统上打包

**解决方案：**
- 在 macOS 电脑上执行打包命令
- 或使用 GitHub Actions / CI/CD 进行跨平台打包

### 3. 图标不显示

**检查清单：**
- ✅ Windows: `assets/MotionSlicelOGO.ico` 存在
- ✅ macOS: `assets/MotionSlicelOGO.icns` 存在
- ✅ `forge.config.ts` 中 `icon` 路径正确（不带后缀）
- ✅ 重新执行 `npm run make`

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
npm run make

# 4. 检查输出
ls out/make/wix/x64/
ls out/make/squirrel.windows/x64/

# 5. 测试安装包
# - 双击 .msi 文件测试向导安装
# - 双击 .exe 文件测试一键安装
```

### macOS 打包流程

```bash
# 1. 生成 .icns 图标（如果还没有）
# 使用上面提到的方法生成

# 2. 确认版本号
cat package.json | grep version

# 3. 安装依赖（如果是首次打包）
npm install

# 4. 执行打包
npm run make

# 5. 检查输出
ls out/make/*.dmg
ls out/make/*.pkg

# 6. 测试安装包
# - 双击 .dmg 文件测试拖拽安装
# - 双击 .pkg 文件测试向导安装
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
- [WiX Toolset 官网](https://wixtoolset.org/)
- [Electron 打包最佳实践](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
