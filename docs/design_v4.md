# ClawAvatar 第四版设计文档（V4）

> **版本范围**：对应 roadmap 的 **Step 4：接 OpenClaw**  
> **核心定位**：**ClawAvatar 的 Electron App 作为 OpenClaw 的 Channel**——即 OpenClaw 的一种用户交互入口（User ↔ Avatar UI ↔ Agent），通过 Adapter/WebSocket 接入 Gateway，完成 user_input 上行与 render/agent_state 下行。

---

## 1. 核心定位：Electron App = OpenClaw Channel

### 1.1 Channel 的含义（与 roadmap 一致）

- **Channel**：用户交互入口，负责 User ↔ UI ↔ Agent 的闭环；Plugin/Skill 是 Agent 调用能力，Channel 是用户与 Agent 的交互界面。
- **ClawAvatar**：以 VRM Avatar + 桌面常驻窗口作为 Channel 的「皮肤与交互」；本版明确 **Electron 应用即该 Channel 的客户端实现**。

### 1.2 本版要交付的

| 项目 | 说明 |
|------|------|
| **Electron App 作为 Channel 客户端** | 桌面端（Electron）以 OpenClaw 的「avatar」Channel 身份连接 Adapter/Gateway：携带 token、获得 session，发送 user_input，接收 agent_state 与 render，驱动 Avatar 表现 |
| **user_input → OpenClaw Agent** | Channel 端产生的用户输入经 Adapter 鉴权与 session 路由后，以 OpenClaw 统一内部消息送抵 Gateway，由 Agent 消费 |
| **Agent 输出 → render / agent_state** | Agent 的 token stream 或 message 由 Adapter（或 Gateway 的 avatar Channel 适配层）转换为 `render` 与 `agent_state`，推回 **Channel 客户端**（Electron App） |
| **职责边界** | 约定 Channel 客户端、Adapter、Gateway 的边界：谁做 session、谁做协议转换、谁做情绪/状态推断 |

### 1.3 本版不包含的（留待后续）

- TTS + 口型驱动（viseme）
- 多 Agent / 多窗口、记忆与工具时间线可视化
- 生产级灰度、热更新

---

## 2. 与 V3 的衔接

- **协议**：与 V3 一致。Channel 客户端（Electron/Web）继续发送 `user_input`，消费 `agent_state` 与 `render`；V4 细化「Electron App 作为 OpenClaw Channel」的上下行与对接方式。
- **桌面壳与鉴权**：沿用 V3（Electron 常驻、token、session_id）；V4 明确该桌面壳即 **OpenClaw Channel 的一种形态**，通过 Adapter 接入 OpenClaw。

---

## 3. 数据流（Step 4）：Channel 客户端 ↔ OpenClaw

```
[用户] → ClawAvatar Electron App（OpenClaw Channel 客户端）
    → user_input（text + context，context.app = "desktop"）
    → [Adapter WS] 鉴权、绑定 session_id
    → Adapter 将 user_input 转为 OpenClaw 内部消息
    → OpenClaw Gateway → Agent

Agent 输出（stream / message）
    → Gateway 或 Adapter 接收
    → Adapter 包装为 agent_state + render
    → [Adapter WS] → Channel 客户端（Electron App）
    → applyProtocolMessage() → 状态机 → VRM 表现
```

---

## 4. 上行：Channel 客户端 user_input → OpenClaw Agent

### 4.1 Channel 客户端（Electron）→ Adapter：user_input

与 V3 一致，Channel 客户端（Electron）发送：

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

- `session_id`：由 Adapter 或 Gateway 在连接/首次交互时分配，Channel 客户端回填。
- `context.app`：Electron 端固定为 `"desktop"`，标识本 Channel 为桌面端；Gateway 据此识别 avatar Channel 来源。

### 4.2 Adapter 职责（上行）

- 校验 WS 连接上的 token 与 session 绑定。
- 将 `user_input` 转为 OpenClaw Gateway 所接受的**统一内部消息**（具体格式由 OpenClaw Channel API 决定，例如 `{ role: "user", content: text, session_id, context }`）。
- 调用 Gateway 的 **avatar Channel** 接口或通过 Gateway 提供的 SDK/WS 把该消息路由到对应 session 的 Agent（即本 Channel 所绑定的会话）。

### 4.3 Gateway 职责（上行）

- 接收 Adapter 转发的用户消息，按 session 路由到对应 Agent。
- 鉴权、限流、会话隔离由 Gateway 统一保障。

---

## 5. 下行：Agent 输出 → Adapter 包装成 render 与 agent_state → Channel 客户端

### 5.1 Agent 输出形态（OpenClaw 侧）

- **流式**：token stream、或 chunk 级别的 delta。
- **非流式**：完整 message（content、metadata、tool_calls 等）。

Adapter（或 Gateway 的 avatar Channel 层）需要消费其中一种或两种，并**统一**成 Channel 协议（agent_state / render），推回 Channel 客户端。

### 5.2 包装为 agent_state

| Agent 阶段 / 事件 | 建议映射为 agent_state |
|-------------------|-------------------------|
| 开始推理、规划 | `state: "thinking"`，可选 `detail: "planning"`、`progress` |
| 调用工具、执行中 | `state: "tool_running"`，`detail` 为工具名或描述 |
| 开始/正在输出文本 | `state: "speaking"` |
| 输出结束、等待输入 | `state: "idle"` 或 `listening` |
| 错误、拒绝 | `state: "error"`，可选 `detail` |

- `session_id`、`message_id` 等由 Adapter 从 OpenClaw 上下文中填充，与 Channel 协议一致，供客户端区分会话与消息。

### 5.3 包装为 render

| 来源建议 | 说明 |
|----------|------|
| **state** | 与 agent_state 对齐：speaking / thinking / idle 等，驱动 Avatar 状态机 |
| **emotion** | 由 Adapter 从 Agent 输出或 metadata 中推断（或模型按约定输出 cue），填 `happy` / `neutral` / `sad` 等 |
| **intensity** | 0–1，由 Adapter 或模型给出，用于表情强度、动作幅度 |
| **gesture** | 可选，对应 Channel 客户端 manifest 中的动作名，按名播放 |
| **gaze** | 可选，如 `camera` / `target` |
| **text** | 可选，当前正在“说”的片段，供 TTS/口型或纯展示 |

推荐由 **Adapter 做情绪与状态包装**（见 roadmap §5.2）：模型可只提供轻量 tag/cue，Adapter 负责最终结构化为 `render`，减轻模型格式负担。

### 5.4 下行时序建议

- 流式场景：Agent 每产生一段 delta 或状态变化，Adapter 就向 **Channel 客户端** 发一次 `agent_state` 和/或 `render`，保证 Avatar「存在感」连续。
- 非流式场景：在「开始推理」「开始输出」「输出结束」等关键节点各发至少一次 `agent_state`，并在有内容时发 `render`。

---

## 6. Adapter 与 Gateway 的两种实现方式

### 6.1 方式 A：Adapter 主动拉/推 OpenClaw

- Adapter 与 OpenClaw Gateway 通过 **Channel API / SDK / 独立 WS** 通信。
- Adapter 负责：把 user_input 转成 Gateway 消息并发送；订阅或轮询 Agent 输出，再转为 `agent_state` + `render` 推给 Channel 客户端。
- 协议转换、情绪推断、session 映射均在 Adapter 内完成。

### 6.2 方式 B：Gateway 内建 avatar Channel

- Gateway 内置「avatar」Channel 类型：接收 user_input 格式的消息，并把 Agent 输出直接交给内置适配层，产出 `agent_state` + `render`，再通过 Gateway 推回 Adapter 或直连 Channel 客户端。
- Adapter 可退化为「鉴权 + 会话路由 + Channel 客户端 WS」，协议转换在 Gateway 完成。

V4 不强制选择 A 或 B，只约定：**最终到达 Channel 客户端（Electron App）的必须是 `agent_state` 与 `render` 两种类型**，且语义符合 §5.2、§5.3。

---

## 7. 技术方案摘要

### 7.1 Electron App 作为 OpenClaw Channel 客户端（相对 V3）

- **身份**：Electron 应用 = OpenClaw 的 **avatar Channel** 的桌面端实现；连接 Adapter 时通过 token、session 与 Gateway 侧的「avatar Channel」绑定。
- **协议**：无变更。Channel 客户端继续发 `user_input`（`context.app: "desktop"`），收 `agent_state` 与 `render`。
- **扩展**：若 V4 阶段增加字段（如 `detail`、`progress`、`gesture`），Channel 客户端按需扩展消费逻辑与状态机映射。

### 7.2 Adapter / Gateway（服务端 Channel 对接）

- 将 **avatar Channel** 的 user_input 转为 OpenClaw 内部消息并路由到 Agent。
- 将 Agent 输出转为 agent_state + render 推回 **Channel 客户端**；建议由 Adapter 或 Gateway 的 avatar 适配层做情绪/状态推断与字段白名单，避免客户端收到未约定字段。

---

## 8. 验收标准（V4）

- [ ] **Channel 身份**：Electron App 能以 OpenClaw avatar Channel 客户端身份连接 Adapter，携带 token、获得 session，并被 Gateway 识别为桌面端 Channel。
- [ ] **上行**：Channel 客户端发送的 `user_input` 经 Adapter 送抵 OpenClaw Agent，session 正确、可复现一次完整对话。
- [ ] **下行**：Agent 在推理、工具执行、输出文本、结束等阶段，Channel 客户端能收到对应的 `agent_state`，Avatar 状态（thinking / tool_running / speaking / idle 等）正确切换。
- [ ] Agent 输出能由 Adapter（或 Gateway）包装为 `render`（含 state、emotion、intensity 等），Channel 客户端驱动表情与状态平滑无抽搐。
- [ ] 协议仅使用约定的 `render` / `agent_state` 白名单字段，无未约定注入。
- [ ] 与 V3 验收标准兼容：鉴权、session、Electron 常驻、断线重连等仍满足。

---

## 9. 文档与版本

- 本文档：`docs/design_v4.md`，描述 **Step 4：接 OpenClaw**，重点为 **Electron App 作为 OpenClaw 的 Channel**——Channel 客户端 user_input → OpenClaw Agent，Agent 输出 → Adapter 包装成 render 与 agent_state 推回 Channel 客户端。
- 上一版：`docs/design_v3.md`（OpenClaw 接入概览 + 鉴权/session + Electron 桌面常驻）。
- Roadmap：`docs/roadmap.md` 第 10.4 节为本版依据。

以上为 ClawAvatar 第四版设计文档，**以 Electron App 作为 OpenClaw Channel 客户端** 为核心，明确上下行数据流与 Adapter 包装职责，与 V3 协议兼容。
