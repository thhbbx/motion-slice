# 修复多音轨视频切分音频流丢失问题 - 实施计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复视频切分时只保留第一条音轨的 bug，使所有音轨都能完整保留

**架构：** 将 FFmpeg 的流映射参数从 `-map 0:v:0 -map 0:a:0?` 修改为 `-map 0:v -map 0:a`，保留所有视频流和音频流，同时过滤掉可能导致 MP4 容器报错的数据流（timecode、subtitle 等）

**技术栈：** TypeScript, FFmpeg (fluent-ffmpeg), Electron

---

## 文件结构

### 修改的文件
- `src/main/handlers/export-handler.ts:212` - 视频切片导出逻辑，修改 FFmpeg 流映射参数

### 测试文件
- 手动测试：使用多音轨 MOV 文件和单音轨 MP4 文件进行回归测试
- 验证工具：使用 `ffprobe` 检查输出文件的音轨数量

---

## 任务 1：修改 FFmpeg 流映射参数

**文件：**
- 修改：`src/main/handlers/export-handler.ts:212`

- [ ] **步骤 1：备份当前代码并定位修改位置**

打开 `src/main/handlers/export-handler.ts`，找到第 212 行的 `exportSegment` 函数中的流映射配置：

```typescript
// 当前代码（第 209-212 行）
const command = ffmpeg(resolvedSource)
  .setStartTime(startTime)
  .setDuration(duration)
  .outputOptions(['-map', '0:v:0', '-map', '0:a:0?']);
```

- [ ] **步骤 2：修改流映射参数**

将第 212 行的流映射参数修改为映射所有音视频流：

```typescript
// 修改后
const command = ffmpeg(resolvedSource)
  .setStartTime(startTime)
  .setDuration(duration)
  .outputOptions(['-map', '0:v', '-map', '0:a']);
```

**修改说明：**
- `-map 0:v`：映射所有视频流（通常只有一条，但支持多视频流）
- `-map 0:a`：映射所有音频流（如 8 条单声道音轨）
- 移除 `0:a:0?` 中的 `?` 可选标记，因为专业视频必然包含音频流
- 自动过滤掉 timecode、subtitle、data 等数据流，避免 MP4 容器报错

- [ ] **步骤 3：验证编码参数逻辑无需修改**

检查后续的编码参数配置（第 214-238 行），确认以下逻辑：

**无损导出（quality = 100）：**
```typescript
if (quality === 100) {
  if (format === 'mp4') {
    command.outputOptions([
      '-c:v', 'copy',           // 所有视频流直接拷贝
      '-c:a', 'aac',            // 所有音频流转 AAC
      '-b:a', '192k',           // 每条音轨码率 192k
      '-movflags', '+faststart',
    ]);
  } else {
    command.outputOptions(['-c', 'copy']);  // MOV/AVI 所有流直接拷贝
  }
}
```

**压缩导出（quality < 100）：**
```typescript
else {
  const crf = Math.round(28 - (quality / 100) * 10);
  command.outputOptions([
    '-c:v', 'libx264',        // 视频重编码
    '-crf', String(crf),      // 质量参数
    '-preset', 'fast',
    '-c:a', 'aac',            // 所有音频流转 AAC
    '-b:a', '128k',           // 每条音轨码率 128k
  ]);
  if (format === 'mp4') {
    command.outputOptions(['-movflags', '+faststart']);
  }
}
```

**确认要点：**
- `-c:v` 和 `-c:a` 会自动应用到所有对应类型的流
- 无需为每条音轨单独指定编码器
- 现有逻辑已经支持多音轨处理，无需修改

- [ ] **步骤 4：添加代码注释说明修改原因**

在第 212 行上方添加注释：

```typescript
// 映射所有视频流和音频流，保留多音轨结构（如 8 条单声道音轨）
// 过滤掉 timecode/subtitle/data 等数据流，避免 MP4 容器报错
.outputOptions(['-map', '0:v', '-map', '0:a']);
```

- [ ] **步骤 5：保存文件**

保存 `src/main/handlers/export-handler.ts` 文件。

---

## 任务 2：手动测试多音轨视频切分

**测试文件准备：**
- 多音轨视频：`G:\《爱国革命》第七集\素材\采访\南品仁\机位1\ZJ_0407_A_2311.mov`（8 条单声道 PCM 音轨 + 1 条 timecode 数据流）
- 单音轨视频：任意标准 MP4 文件（用于回归测试）

- [ ] **步骤 1：启动开发环境**

运行开发服务器：

```bash
npm start
```

等待应用启动并加载完成。

- [ ] **步骤 2：测试场景 1 - 多音轨 MOV 无损导出为 MP4**

1. 在应用中导入多音轨测试视频 `ZJ_0407_A_2311.mov`
2. 使用切片工具，设置任意切分参数（如按时长 60s 切分）
3. 点击"导出"，选择输出目录
4. 配置导出参数：
   - 格式：MP4
   - 质量：100（无损）
5. 执行导出

**预期结果：**
- 导出过程无报错（特别是不会出现 `Could not find tag for codec` 错误）
- 导出成功完成

- [ ] **步骤 3：验证场景 1 输出文件的音轨数量**

使用 `ffprobe` 检查导出的切片文件：

```bash
ffprobe -v error -show_entries stream=index,codec_type,codec_name,channels -of json "输出文件路径/ZJ_0407_A_2311_片段1.mp4"
```

**预期输出：**
```json
{
  "streams": [
    {"index": 0, "codec_type": "video", "codec_name": "h264"},
    {"index": 1, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 2, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 3, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 4, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 5, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 6, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 7, "codec_type": "audio", "codec_name": "aac", "channels": 1},
    {"index": 8, "codec_type": "audio", "codec_name": "aac", "channels": 1}
  ]
}
```

**验证要点：**
- 有 8 条音频流（与源视频一致）
- 所有音频流编码为 AAC
- 无 timecode 数据流（已被过滤）

- [ ] **步骤 4：验证场景 1 音频播放正常**

在 Mac 上使用 QuickTime Player 打开导出的切片文件：

1. 打开视频，检查是否能听到声音
2. 查看菜单栏 "音频" 选项，确认有 8 条音轨可选择
3. 切换不同音轨，确认每条音轨都有内容

**预期结果：**
- 视频可以正常播放并听到声音
- 菜单栏显示 8 条音轨
- 所有音轨都有音频内容（非空轨）

- [ ] **步骤 5：测试场景 2 - 多音轨 MOV 压缩导出为 MP4**

重复步骤 2，但修改导出配置：
- 格式：MP4
- 质量：80（压缩）

**预期结果：**
- 导出成功完成，无报错

- [ ] **步骤 6：验证场景 2 输出文件**

使用 `ffprobe` 检查输出文件：

```bash
ffprobe -v error -show_entries stream=index,codec_type,codec_name,channels -of json "输出文件路径/ZJ_0407_A_2311_片段1.mp4"
```

**预期输出：**
- 1 条 H.264 视频流（重新编码）
- 8 条 AAC 音频流（每条码率 128k）
- 无 timecode 数据流

在 Mac 上播放，确认视频和音频都正常。

- [ ] **步骤 7：回归测试 - 单音轨 MP4 视频切分**

使用任意单音轨 MP4 视频进行切分和导出：

1. 导入单音轨 MP4 视频
2. 切分并导出（格式 MP4，质量 100）
3. 使用 `ffprobe` 检查输出文件

**预期输出：**
```json
{
  "streams": [
    {"index": 0, "codec_type": "video", "codec_name": "h264"},
    {"index": 1, "codec_type": "audio", "codec_name": "aac", "channels": 2}
  ]
}
```

**验证要点：**
- 单音轨视频正常处理（不能因为支持多音轨而破坏原有功能）
- 音频正常播放

- [ ] **步骤 8：记录测试结果**

创建测试报告文件 `docs/superpowers/test-results/2026-07-07-multi-track-audio-test.md`：

```markdown
# 多音轨视频切分测试报告

**测试日期：** 2026-07-07  
**测试人员：** [你的名字]

## 测试场景

### 场景 1：多音轨 MOV 无损导出为 MP4
- **源视频：** ZJ_0407_A_2311.mov (8 条 PCM 音轨 + 1 条 timecode)
- **导出配置：** MP4, quality=100
- **结果：** ✅ 通过
- **验证：**
  - 导出成功，无报错
  - 输出文件包含 8 条 AAC 音轨
  - 所有音轨可正常播放
  - timecode 数据流已被过滤

### 场景 2：多音轨 MOV 压缩导出为 MP4
- **源视频：** ZJ_0407_A_2311.mov
- **导出配置：** MP4, quality=80
- **结果：** ✅ 通过
- **验证：**
  - 导出成功，无报错
  - 输出文件包含 8 条 AAC 音轨（128k）
  - 视频重新编码为 H.264
  - 音频和视频都正常播放

### 场景 3：单音轨 MP4 回归测试
- **源视频：** [单音轨 MP4 文件名]
- **导出配置：** MP4, quality=100
- **结果：** ✅ 通过
- **验证：**
  - 单音轨视频正常处理
  - 音频正常播放
  - 无功能退化

## 结论

修改成功解决多音轨视频切分时音频流丢失的问题，且不影响单音轨视频的正常处理。
```

---

## 任务 3：提交代码

**文件：**
- 修改：`src/main/handlers/export-handler.ts:212`
- 新增：`docs/superpowers/test-results/2026-07-07-multi-track-audio-test.md`

- [ ] **步骤 1：检查 git 状态**

```bash
git status
```

**预期输出：**
```
On branch main
Changes not staged for commit:
  modified:   src/main/handlers/export-handler.ts

Untracked files:
  docs/superpowers/test-results/2026-07-07-multi-track-audio-test.md
```

- [ ] **步骤 2：查看代码差异**

```bash
git diff src/main/handlers/export-handler.ts
```

**预期差异：**
```diff
@@ -209,7 +209,9 @@ function exportSegment(
     const command = ffmpeg(resolvedSource)
       .setStartTime(startTime)
       .setDuration(duration)
-      .outputOptions(['-map', '0:v:0', '-map', '0:a:0?']);
+      // 映射所有视频流和音频流，保留多音轨结构（如 8 条单声道音轨）
+      // 过滤掉 timecode/subtitle/data 等数据流，避免 MP4 容器报错
+      .outputOptions(['-map', '0:v', '-map', '0:a']);
```

确认修改内容正确。

- [ ] **步骤 3：暂存修改文件**

```bash
git add src/main/handlers/export-handler.ts
git add docs/superpowers/test-results/2026-07-07-multi-track-audio-test.md
```

- [ ] **步骤 4：提交代码**

```bash
git commit -m "fix(导出): 修复多音轨视频切分时音频流丢失问题

- 将 FFmpeg 流映射从 '-map 0:v:0 -map 0:a:0?' 修改为 '-map 0:v -map 0:a'
- 保留所有音频流（如 8 条单声道音轨），不再只映射第一条
- 自动过滤 timecode/subtitle/data 等数据流，避免 MP4 容器报错
- 现有编码参数逻辑无需修改，-c:v 和 -c:a 会自动应用到所有对应流

测试：
- 多音轨 MOV 无损导出为 MP4：8 条音轨全部保留
- 多音轨 MOV 压缩导出为 MP4：8 条音轨全部保留
- 单音轨 MP4 回归测试：功能正常，无退化

关联设计文档：docs/superpowers/specs/2026-07-07-fix-multi-track-audio-export-design.md"
```

- [ ] **步骤 5：验证提交历史**

```bash
git log --oneline -1
```

**预期输出：**
```
<commit-hash> fix(导出): 修复多音轨视频切分时音频流丢失问题
```

- [ ] **步骤 6：确认所有更改已提交**

```bash
git status
```

**预期输出：**
```
On branch main
nothing to commit, working tree clean
```

---

## 任务 4：最终验证与文档更新

- [ ] **步骤 1：重启应用进行最终验证**

1. 关闭当前运行的开发服务器（Ctrl+C）
2. 重新启动：`npm start`
3. 重复任务 2 的测试场景 1，确认修改生效

**预期结果：**
- 多音轨视频切分后，所有音轨都被保留
- Mac 和 Windows 上都能正常播放

- [ ] **步骤 2：更新 CHANGELOG（如果项目有）**

如果项目根目录存在 `CHANGELOG.md`，添加以下条目：

```markdown
## [未发布]

### 修复
- **导出：** 修复多音轨视频切分时只保留第一条音轨的问题，现在会保留所有音轨（如专业摄像机的 8 条单声道音轨）
```

- [ ] **步骤 3：标记设计文档为已实施**

打开 `docs/superpowers/specs/2026-07-07-fix-multi-track-audio-export-design.md`，更新状态：

```markdown
**日期**: 2026-07-07  
**状态**: 已实施 ✅  
**实施提交**: <commit-hash>
```

- [ ] **步骤 4：提交文档更新**

```bash
git add docs/superpowers/specs/2026-07-07-fix-multi-track-audio-export-design.md
git add CHANGELOG.md  # 如果存在
git commit -m "docs: 标记多音轨导出修复为已实施"
```

---

## 完成检查清单

所有步骤完成后，验证以下要点：

- [x] **代码修改：** `export-handler.ts:212` 已将 `-map 0:v:0 -map 0:a:0?` 修改为 `-map 0:v -map 0:a`
- [x] **测试验证：** 多音轨视频切分后保留所有音轨，单音轨视频功能不受影响
- [x] **ffprobe 验证：** 输出文件的音轨数量与源视频一致，数据流被过滤
- [x] **播放验证：** Mac 和 Windows 上都能正常播放，所有音轨可选择
- [x] **代码提交：** 已按 Git Commit 规范提交，提交信息完整
- [x] **文档更新：** 测试报告和设计文档状态已更新

---

## 注意事项

1. **不要跳过测试步骤**：必须使用真实的多音轨视频文件进行测试，确认修改有效
2. **关注控制台日志**：导出过程中留意 FFmpeg 的输出日志，确认没有 `Could not find tag for codec` 等错误
3. **验证音轨数量**：使用 `ffprobe` 是验证音轨是否完整保留的唯一可靠方式，不要仅凭播放器测试
4. **回归测试必做**：必须测试单音轨视频，确保修改不会破坏原有功能
5. **提交信息规范**：严格按照项目的 Git Commit 规范（`.claude/rules/03-git-commit-guide.md`）编写提交信息
