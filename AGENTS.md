# ClawStudio

## 项目概览

ClawStudio 是一个基于 Tauri 的桌面工作台，当前产品形态以单窗口聊天为核心，围绕网关连接、会话管理、工作区状态、附件发送和应用内更新构建。

- 沟通语言：中文
- 代码注释：英文
- commit message：英文，格式 `<type>: <summary>`
- 原则：先理解再修改，最小改动，自测后再结束任务

## 技术栈

- 桌面宿主：Tauri 2
- 前端：React 19 + TypeScript + Vite
- 前端状态管理：Zustand
- Rust 后端：Tauri command + Tokio + tokio-tungstenite
- 通信方式：
  - 前端通过 `@tauri-apps/api` `invoke` 调用 Rust commands
  - Rust 侧维护到 gateway 的 WebSocket 连接
  - Rust 通过 Tauri event 把 gateway 事件广播回前端

## 目录结构

- `src-ui/`：桌面 UI 主代码
  - `components/`：界面组件
  - `windows/`：窗口级组合
  - `stores/`：Zustand 状态
  - `lib/`：前端业务工具、Tauri bridge、格式转换
  - `hooks/`：自定义 hooks
- `src-tauri/`：Tauri Rust 宿主、窗口命令、gateway 桥接、updater
- `src/`：Node/CLI 原型代码，和桌面 UI 不是一条主运行链路
- `docs/`：项目文档，当前已有发布相关说明
- `dist/`：前端构建产物
- `.codex/`：项目级 Codex 配置，包含 MCP 配置

## 开发命令

- 安装依赖：`npm install`
- 启动桌面开发：`npm run tauri:dev`
- 仅启动前端调试：`npm run ui:dev`
- 运行 CLI 原型：`npm run cli:dev`
- 构建前端：`npm run ui:build`
- TypeScript 检查：`npm run typecheck`
- Rust 检查：在 `src-tauri/` 下执行 `cargo check`
- 桌面构建：`npm run tauri:build`

## 核心运行链路

桌面应用主链路如下：

1. `src-ui/main.tsx` 挂载 React 应用
2. `src-ui/App.tsx` 订阅 gateway/window 事件、初始化 updater、执行自动连接
3. `src-ui/stores/gateway.ts` 管理连接状态、会话列表、当前 session
4. `src-ui/stores/chat.ts` 管理消息历史、流式内容、附件和中断
5. `src-ui/lib/tauri-gateway.ts` 统一封装前端到 Rust 的调用
6. `src-tauri/src/lib.rs` 注册 Tauri commands 和插件
7. `src-tauri/src/gateway.rs` 负责 gateway 握手、请求转发、事件回推、自动重连

## 模块边界

请按下面边界工作，不要跨层随意耦合。

- `src-ui/components/` 只负责展示和交互，不直接实现底层 gateway 协议细节
- `src-ui/stores/` 负责 UI 状态和业务编排，可以调用 `src-ui/lib/`
- `src-ui/lib/` 负责纯工具、协议转换、Tauri bridge；不要在这里堆 UI 状态
- `src-tauri/` 负责桌面能力、Rust 侧连接保持、系统集成；不要把 React 视图逻辑放进 Rust
- `src/` 是 CLI/原型链路，除非明确在维护 CLI，否则不要把桌面应用新功能优先写进这里

## 修改约定

- 默认做最小改动，不顺手重构无关代码
- 改前先读相关文件，确认现有调用链和状态归属
- 破坏性调整、模块迁移、跨目录重组，先给方案再动手
- 如果发现 `src/` CLI 原型与 `src-ui/` 桌面主链路存在重复逻辑，先确认是否需要抽取，不要直接大范围合并
- 如果改动涉及 UI 行为，优先保持现有视觉和交互结构一致，除非需求明确要求调整

## 验证方式

当前仓库还没有成型的自动化测试体系，默认至少执行以下验证：

- 代码改动后先跑：`npm run typecheck`
- 涉及 Rust/Tauri 改动时再跑：`cargo check`
- 涉及前端打包或资源改动时再跑：`npm run ui:build`

如果是 UI 相关改动，除静态检查外还应做桌面端实际验证：

1. 启动应用：`npm run tauri:dev`
2. 使用项目里的 Tauri MCP 做界面检查、交互验证、必要时截图
3. 重点验证会话切换、消息发送、设置弹窗、工作区弹窗、更新提示等受影响路径

项目 MCP 配置位置：

- `.codex/config.toml`

当前已配置：

- Tauri MCP Server

## 已知现状

- 仓库当前主能力已经能编译、能打包
- 当前没有完整的单元测试 / 集成测试 / 常规 CI 校验流
- `.github/workflows/` 目前主要是发布工作流，不等于日常回归验证
- `src-uilib/` 当前为空目录，除非本次需求明确需要，否则不要为“整理结构”而单独引入迁移

## Agent 协作建议

- 小范围单文件或低风险修改：主 agent 直接完成
- 涉及陌生模块或调用链不清：先派 `explorer`
- 需要编码实现：派 `worker`
- 实现完成后如改动较大：派 `reviewer` 做风险审查
- 复杂 UI 或长链路验证：派 `tester`，优先使用 Tauri MCP

## 关键文件

- `package.json`
- `README.md`
- `src-ui/App.tsx`
- `src-ui/windows/MainWindow.tsx`
- `src-ui/stores/gateway.ts`
- `src-ui/stores/chat.ts`
- `src-ui/lib/tauri-gateway.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/gateway.rs`
- `src-tauri/src/updater.rs`
