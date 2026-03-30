# ClawStudio 设计说明

## 定位

ClawStudio 是面向 OpenClaw 用户的桌面工作台。
当前版本聚焦单窗口聊天、会话管理、工作区管理、附件发送和应用内更新。

## 当前边界

- 保留主聊天窗口
- 保留 Gateway 连接和会话管理
- 保留工作区和附件能力
- 保留 OpenClaw 配置面板和自动更新
- 删除桌宠、立绘、情绪展示、语音播放相关功能

## 技术栈

- Tauri 2
- React 19
- TypeScript
- Zustand
- OpenClaw Gateway WebSocket

## 迁移约束

- 新仓库从 `ClawStudio` 名义重新开始 git 历史
- 持久化 key、设备目录、窗口标题、包名统一改为 `clawstudio`
- 不保留 `pet` / `tts` / `character sprite` 运行路径
