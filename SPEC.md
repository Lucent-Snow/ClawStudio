# ClawStudio 技术基线

## 应用形态

单窗口桌面应用，连接 OpenClaw Gateway，提供：

- 消息收发
- 历史记录加载
- Session 管理
- Workspace 管理
- OpenClaw 配置读写
- 自动更新

## 默认配置

- 默认网关地址：`ws://127.0.0.1:18789`
- 默认会话：`agent:clawstudio:main`
- 设备身份目录：`~/.clawstudio/device.json`

## 当前不包含

- 桌宠窗口
- 立绘资源目录
- TTS / ASR
- 语音或表情驱动的 UI
