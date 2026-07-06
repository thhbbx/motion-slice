# 多音轨视频切分测试报告

**测试日期：** 2026-07-07  
**测试人员：** Claude (AI) + 用户验证

## 测试场景

### 场景 1：多音轨 MOV 无损导出为 MP4
- **源视频：** ZJ_0407_A_2311.mov (8 条 PCM 音轨 + 1 条 timecode)
- **导出配置：** MP4, quality=100
- **结果：** ✅ 通过
- **验证：**
  - 导出成功，无报错
  - 输出文件包含 8 条 AAC 音轨（使用 ffprobe 验证）
  - 所有音轨可正常播放
  - timecode 数据流已被过滤（仅保留 1 条 data 流）

**ffprobe 验证结果：**
```json
{
  "streams": [
    {"index": 0, "codec_type": "video", "codec_name": "h264"},
    {"index": 1, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 2, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 3, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 4, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 5, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 6, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 7, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 8, "codec_type": "audio", "codec_name": "aac", "channels": 1, "channel_layout": "mono"},
    {"index": 9, "codec_type": "data"}
  ]
}
```

### 场景 2：多音轨 MOV 压缩导出为 MP4
- **源视频：** ZJ_0407_A_2314.mov
- **导出配置：** MP4, quality=80 (压缩)
- **结果：** ✅ 通过
- **验证：**
  - 导出成功，无报错
  - 输出文件包含 8 条 AAC 音轨（128k）
  - 视频重新编码为 H.264
  - 音频和视频都正常播放

### 附加发现：解决了 PCM 兼容性问题

**意外收益：**
- **原始问题：** 用户的源视频（8 条 PCM 音轨的 MOV 文件）在 Windows 上无法播放（听不到声音），但在 Mac 上正常
- **根本原因：** Windows 播放器对 PCM + MOV 组合支持较差
- **修复效果：** 导出时自动将 PCM 转码为 AAC，导出后的 MP4 文件在 Windows 和 Mac 上都能正常播放
- **验证：** 用户确认导出后的视频在 Windows 上可以听到声音

## 结论

修改成功解决了以下两个问题：
1. ✅ **多音轨丢失问题**：从只保留第一条音轨改为保留所有 8 条音轨
2. ✅ **跨平台兼容性问题**：PCM → AAC 转码使导出视频在 Windows/Mac 上都能正常播放

## 技术细节

**修改内容：**
```typescript
// 修改前
.outputOptions(['-map', '0:v:0', '-map', '0:a:0?']);

// 修改后
.outputOptions(['-map', '0:v', '-map', '0:a']);
```

**效果：**
- `-map 0:v`：映射所有视频流
- `-map 0:a`：映射所有音频流（8 条单声道音轨全部保留）
- 自动过滤 timecode/subtitle/data 等数据流，避免 MP4 容器报错
