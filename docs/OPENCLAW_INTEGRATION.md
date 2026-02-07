# ClawAvatar 与 OpenClaw 集成指南

本文档说明如何将 **ClawAvatar**（Avatar Channel 客户端）与 **OpenClaw**（Gateway + Agent）打通，实现真实对话与状态驱动。

---

## 1. 集成架构（谁和谁连）

```
[用户] → ClawAvatar（Electron/Web）
            │
            │ WebSocket（user_input / agent_state / render）
            ▼
      Avatar Channel Adapter  ←── 你在这里对接 OpenClaw
            │
            │ Channel API / SDK / 独立 WS（由 OpenClaw 提供）
            ▼
      OpenClaw Gateway → Agent(s)
```

- **ClawAvatar 侧**：已实现。作为 OpenClaw 的 **avatar Channel 客户端**，连接 Adapter、发 `user_input`、收 `agent_state` / `render`，驱动 Avatar。
- **集成关键**：**Adapter** 必须与 OpenClaw Gateway（或 Agent）通信，把用户输入送上去、把 Agent 输出转成协议推回客户端。

---

## 2. 两种集成方式（设计 V4 §6）

### 方式 A：Adapter 主动连 OpenClaw（推荐先做）

- Adapter 与 OpenClaw Gateway 通过 **Channel API / SDK / 独立 WebSocket** 通信。
- Adapter 职责：
  1. 接受 ClawAvatar 的 WebSocket，鉴权、发 `init(session_id)`。
  2. 收到 `user_input` 后，转成 **OpenClaw 内部消息**（格式以 OpenClaw 文档为准，例如 `{ role: "user", content: text, session_id, context }`），发给 Gateway 的 avatar Channel 或会话接口。
  3. **订阅或轮询** Agent 输出（流式 token / 整段 message），按阶段转成 `agent_state`（thinking / tool_running / speaking / idle / error）和 `render`（state、emotion、intensity 等），推回 ClawAvatar。

当前仓库里的 `adapter/server.mjs` 是**模拟实现**（不发真实请求，只回放脚本）。要接真实 OpenClaw，只需在 Adapter 内把「收到 user_input 后的逻辑」从 `simulateAgentResponse()` 换成「调 OpenClaw API/WS + 把返回转成 agent_state/render」。

### 方式 B：Gateway 内建 avatar Channel

- OpenClaw Gateway 内置「avatar」Channel 类型：直接接受 `user_input` 格式、并把 Agent 输出在 Gateway 内转成 `agent_state` + `render`，再通过现有推送通道发给客户端（或经 Adapter 转发）。
- 此时 Adapter 可只做：鉴权 + 会话路由 + 为 ClawAvatar 提供 WebSocket；协议转换在 Gateway 完成。
- 需要 OpenClaw 侧实现或扩展 Gateway，支持 avatar Channel 的协议与推送。

---

## 3. Adapter 侧需要实现什么（方式 A）

在 **保留现有 ClawAvatar ↔ Adapter 协议不变** 的前提下，在 Adapter 里增加「和 OpenClaw 的对接层」。

### 3.1 上行：user_input → OpenClaw

- 从 ClawAvatar 收到：
  ```json
  { "type": "user_input", "session_id": "...", "text": "...", "context": { "app": "desktop", "locale": "zh-CN" } }
  ```
- 你需要：
  1. **校验** token 与 session（若 Gateway 不负责鉴权，则由 Adapter 校验）。
  2. **映射为 OpenClaw 内部消息**（格式以 OpenClaw Channel API 为准），例如：
     - `role: "user"`, `content: text`, `session_id`, `context`
  3. 通过 **OpenClaw 提供的接口** 发送到对应 session 的 Agent（HTTP 接口、Gateway 的 WS、或 SDK 方法）。

若 OpenClaw 已提供「Channel 发送用户消息」的 API，只需在 Adapter 的 `user_input` 处理函数里调用该 API，并传入 `session_id`、`text`、`context`。

### 3.2 下行：Agent 输出 → agent_state + render

- OpenClaw 侧可能提供：
  - **流式**：token stream / chunk delta；
  - **非流式**：完整 message（content、metadata、tool_calls 等）。
- Adapter 需要在**同一 session** 上：
  1. 接收上述输出（通过 WebSocket 订阅、SDK 回调、或轮询）。
  2. 按 **design_v4.md §5.2、§5.3** 映射为：
     - **agent_state**：`state`（thinking / tool_running / speaking / idle / error）、可选 `detail`、`progress`；
     - **render**：`state`、`emotion`、`intensity`，可选 `gesture`、`gaze`、`text`。
  3. 通过已建立的、与该 session 绑定的 WebSocket 推回 ClawAvatar。

建议由 Adapter（或 Gateway 的 avatar 适配层）做「状态/情绪推断」：模型可只给轻量 tag/cue，Adapter 负责产出符合协议的 `agent_state` 与 `render`。

### 3.3 在当前 adapter 里「插一脚」

当前逻辑在 `adapter/server.mjs` 里大致是：

- `wss.on('connection')`：发 `init(session_id)`，监听 `message`。
- 收到 `msg.type === 'user_input'` 时，调用 `simulateAgentResponse(ws, sessionId)`（模拟 thinking → speaking → idle）。

要接 OpenClaw，可以：

1. **新增配置**：例如 `OPENCLAW_GATEWAY_URL`、`OPENCLAW_CHANNEL_WS` 或 OpenClaw SDK 的初始化参数。
2. **替换「收到 user_input 之后」的逻辑**：
   - 调用 OpenClaw 的「发送用户消息」接口（具体函数/URL 以 OpenClaw 文档为准）；
   - 订阅该 session 的 Agent 输出（WS 或 SDK 回调）；
   - 在收到「开始推理」「工具调用」「开始输出」「输出结束」「错误」等事件时，向当前 `ws` 发送对应的 `agent_state` 与 `render`（仍用现有 `sendAgentState` / `sendRender`）。
3. **保持与 ClawAvatar 的协议不变**：仍发 `init`、`agent_state`、`render`，格式见 `docs/design_v4.md` 与 `src/protocol/types.ts`。

这样 ClawAvatar 无需改协议或前端逻辑，只改 Adapter 的「后端对接 OpenClaw」部分。

---

## 4. 运行与配置要点

- **ClawAvatar（前端）**  
  - 连接地址：默认 `ws://localhost:8765/avatar`，可通过 `VITE_AVATAR_WS_URL` 修改。  
  - 鉴权：Electron 下通过 `AVATAR_TOKEN` 环境变量由 preload 暴露给前端；Web 可用 `VITE_AVATAR_TOKEN`。连接时 token 会以 query 传给 Adapter。

- **Adapter**  
  - 启动：`npm run adapter` 或 `node adapter/server.mjs`。  
  - 可选鉴权：设置 `AVATAR_TOKEN` 或 `ADAPTER_TOKEN`，Adapter 只接受 URL 中 `?token=...` 与之匹配的连接。  
  - 对接 OpenClaw 时：在 Adapter 中读取 OpenClaw 的配置（Gateway URL、API Key、Channel WS 等），在收到 `user_input` 时转发给 OpenClaw，并把 OpenClaw 的响应转成 `agent_state` / `render` 推回 ClawAvatar。

- **OpenClaw 侧**  
  - 需要提供「Channel 或会话级」的：
    - **上行**：接收用户消息的接口（或 WS 消息类型）；
    - **下行**：按 session 推送 Agent 输出（流式或非流式）。
  - 若尚无「avatar Channel」专用 API，可先用现有「会话 + 消息」接口，在 Adapter 里做一层映射即可。

---

## 5. 小结

| 角色           | 已实现 / 你要做的 |
|----------------|--------------------|
| ClawAvatar     | ✅ 已实现：连 Adapter、user_input、agent_state/render、Electron 桌面端 |
| Adapter        | ⚠️ 当前为模拟；你需要：收到 user_input 后调 OpenClaw，并把 Agent 输出转成 agent_state + render 推回 |
| OpenClaw       | 需提供：Channel 或会话的消息上行接口 + 按 session 的下行推送（或 SDK/WS） |

**实际集成步骤**可以归纳为：

1. 确认 OpenClaw 的 **Channel API / 会话 API / SDK / WS** 文档（上行消息格式、下行推送方式、鉴权）。
2. 在 **Adapter**（如 `adapter/server.mjs` 或你拆出的 openclaw 客户端模块）里实现：  
   - 上行：`user_input` → OpenClaw 内部消息并发送；  
   - 下行：订阅 Agent 输出 → 转成 `agent_state` + `render` → 对应用户的 WebSocket 推回。
3. 配置 ClawAvatar 的 WS 地址与 token，以及 Adapter 的 OpenClaw 端点/密钥，做一次端到端对话与状态测试。

若你提供 OpenClaw 的接口文档或 SDK 入口（例如「发送用户消息」「订阅某 session 输出」的调用方式），可以在此基础上写出一份针对当前 `adapter/server.mjs` 的**具体改法**（伪代码或补丁式步骤）。
