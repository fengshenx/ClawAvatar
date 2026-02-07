# ClawAvatar 第三版设计文档（V3）

> **版本范围**：对应 roadmap 的 **Step 3：接 OpenClaw**  
> **目标**：Avatar 的 user_input 经 Adapter 送抵 OpenClaw Agent；Agent 输出由 Adapter 包装成 `render` 与 `agent_state` 推回前端；并交付 **桌面壳（Electron）常驻**，实现 Mac 桌面右下角悬浮 Avatar。

---

## 1. 版本目标与范围

### 1.1 本版要交付的

| 项目 | 说明 |
|------|------|
| OpenClaw 接入 | Adapter 不再回放脚本，改为接收前端 user_input，转发至 OpenClaw Gateway；将 Agent 的 token stream / message 转为 `render` 与 `agent_state` 推回前端 |
| 鉴权与 Session | 前端或 Adapter 持有 avatar_token（短期 token）；WebSocket 连接携带鉴权；session_id 由服务端签发，Adapter/Gateway 校验 token 与 session 绑定 |
| 桌面壳（Electron）常驻 | 无边框、透明窗口，右下角悬浮，alwaysOnTop；可选 skipTaskbar 隐藏 Dock 图标；复用现有 Web Avatar 页面（加载 dev server 或打包后的静态资源） |

### 1.2 本版不包含的（留待后续）

- TTS + 口型驱动（viseme）
- 多 Agent / 多窗口
- 生产级灰度、热更新

---

## 2. 与 V2 的衔接

- **协议**：与 V2 完全一致。前端仍消费 `agent_state`、`render`；新增「前端 → Adapter」的 `user_input` 实际上报。
- **状态机与平滑过渡**：沿用 V2，无变更。
- **动作动画**：沿用 manifest + VRMA 与按名播放；协议中的 `gesture`/`action` 可由 Adapter 根据 Agent 输出或配置填充。

---

## 3. 数据流（Step 3）

```
[用户] → 前端（Web/Electron）
    → user_input（文本/意图）→ [Adapter WS]
    → Adapter 鉴权、session 路由
    → OpenClaw Gateway → Agent
    → Agent 输出（stream/message）
    → Adapter 包装为 agent_state / render
    → [Adapter WS] → 前端
    → applyProtocolMessage() → 状态机 → VRM 表现
```

---

## 4. 事件协议（V3 补充）

### 4.1 前端 → Adapter：user_input（本版真正使用）

```json
{
  "type": "user_input",
  "session_id": "u_123",
  "text": "帮我总结一下今天的任务",
  "context": {
    "app": "desktop",
    "locale": "zh-CN"
  }
}
```

- `session_id`：由 Adapter/Gateway 在连接或首次交互时分配，前端仅回填。
- `context.app`：可区分 `web` | `desktop`（Electron 壳上报 `desktop`）。

### 4.2 鉴权

- 建立 WebSocket 时携带 token：`Authorization: Bearer <avatar_token>`（或 Adapter 约定的 query/header）。
- Token 由后端或 OpenClaw 侧签发，短期有效；过期后前端需刷新或重连。

### 4.3 Adapter 职责（V3）

- 接受 WS 连接，校验 token，分配或绑定 session_id。
- 将前端的 `user_input` 转为 OpenClaw 统一内部消息，发给 Gateway。
- 将 Agent 输出（流式或整段）转为 `agent_state`（如 thinking / tool_running / speaking）与 `render`（state、emotion、intensity、可选 gesture）。
- 建议由 Adapter 做「情绪/状态推断与包装」，减轻模型侧格式负担。

---

## 5. 桌面壳（Electron）常驻

### 5.1 目标（与 roadmap §8 一致）

- **无边框、透明窗口**：`frame: false`，`transparent: true`。
- **右下角悬浮**：根据 `screen.getPrimaryDisplay().workAreaSize` 计算位置，例如 `(workAreaWidth - width - margin, workAreaHeight - height - margin)`。
- **常驻**：`alwaysOnTop: true`。
- **可选**：`skipTaskbar: true` 隐藏任务栏图标；macOS 上可配合「隐藏 Dock 图标」实现仅菜单栏或完全后台。

### 5.2 窗口规格（建议）

| 属性 | 值 | 说明 |
|------|-----|------|
| width | 320 | 与 roadmap 示例一致，可配置 |
| height | 420 | 与 roadmap 示例一致，可配置 |
| frame | false | 无边框 |
| transparent | true | 透明背景，便于只显示 Avatar 区域 |
| alwaysOnTop | true | 常驻最前 |
| resizable | false | 可选，固定尺寸 |
| hasShadow | false | 避免与透明冲突 |
| skipTaskbar | true | 可选 |
| webPreferences | contextIsolation: true | 安全 |

### 5.3 加载方式

- **开发**：`win.loadURL("http://localhost:5173")`（与 Vite 默认 dev 端口一致）。
- **生产**：先 `vite build`，再 `win.loadFile("dist/index.html")` 或等价的相对路径。

### 5.4 可选扩展（后续）

- **点击穿透**：`win.setIgnoreMouseEvents(true)`，需设计「唤醒交互」方式（如热键、辅助区域）。
- **贴边吸附**：窗口拖拽到屏幕边缘时半隐藏或缩小。
- **多显示器**：按当前 workArea 计算右下角。

---

## 6. 技术方案

### 6.1 前端变更点（相对 V2）

| 模块 | 变更 |
|------|------|
| 输入上报 | 在现有 WS 客户端上发送 `user_input`（含 session_id、text、context）；session_id 由首次连接或 Adapter 下发的 init 消息提供 |
| 环境区分 | `context.app` 在 Electron 中设为 `desktop`，在纯 Web 中设为 `web`（可由 build 或运行时检测） |
| 构建与入口 | 保留现有 Vite 构建；新增 Electron 主进程入口（如 `electron/main.mjs`），通过 npm 脚本同时启动 dev server + Electron 或先 build 再启动 Electron |

### 6.2 Electron 工程结构（建议）

```
ClawAvatar/
  electron/
    main.mjs          # 主进程：创建窗口、右下角、透明、alwaysOnTop
  src/                 # 现有 Vite 源码不变
  dist/                # vite build 输出，Electron 生产态加载
  package.json         # 增加 electron、scripts：dev:web、dev:electron、build、postbuild 等
```

### 6.3 主进程示例逻辑

- `app.whenReady()` 后获取主显示器 workArea，创建 BrowserWindow（参数见 5.2）。
- `setPosition(workArea.x + workArea.width - width - margin, workArea.y + workArea.height - height - margin)`。
- 开发模式：`loadURL("http://localhost:5173")`；生产模式：`loadFile(path.join(__dirname, "../dist/index.html"))`。
- 可监听窗口 `closed`、`focus` 等做最小化到托盘或唤醒（若后续做托盘）。

---

## 7. 验收标准（V3）

- [ ] Adapter 将前端 user_input 转发至 OpenClaw Gateway，Agent 回复经 Adapter 转为 agent_state / render 推回前端，Avatar 状态与表现正确。
- [ ] WebSocket 连接支持鉴权（如 Bearer token）；session_id 由服务端侧管理，前端按协议回填。
- [ ] Electron 窗口：无边框、透明、右下角悬浮、alwaysOnTop；开发与生产均可正常加载 Avatar 页面。
- [ ] 前端在 Electron 环境下将 context.app 设为 `desktop`。
- [ ] 质量标准（roadmap §11）：断线重连、状态平滑、无竞态等继续满足；Electron 常驻 1 小时资源稳定。

---

## 8. 文档与版本

- 本文档：`docs/design_v3.md`，描述 Step 3 范围、OpenClaw 接入与 **桌面壳（Electron）常驻**。
- 上一版：`docs/design_v2.md`（WebSocket + 回放脚本 + 平滑过渡）。
- Roadmap：`docs/roadmap.md` 中 Step 3（接 OpenClaw + 桌面壳常驻）为本版依据。

以上为 ClawAvatar 第三版设计文档，聚焦「OpenClaw 接入 + 鉴权/session + Electron 桌面常驻」；协议与前端状态机与 V2 兼容，仅扩展 user_input 实际上报与 Electron 壳实现。
