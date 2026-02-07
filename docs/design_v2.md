# ClawAvatar 第二版设计文档（V2）

> **版本范围**：对应 roadmap 的 **Step 2：接入 WebSocket**  
> **目标**：前端通过 WebSocket 连接 Avatar Channel Adapter，由 Adapter 回放测试脚本（typing → thinking → speaking），前端消费协议消息并实现状态**平滑过渡**，为 Step 3 接入 OpenClaw 做准备。

---

## 1. 版本目标与范围

### 1.1 本版要交付的

| 项目 | 说明 |
|------|------|
| 前端连 Adapter | 前端通过 WebSocket 连接至 Avatar Channel Adapter（独立服务），替代 V1 的本地按钮触发 |
| Adapter 回放测试脚本 | Adapter 端实现或配置一段脚本，按顺序发送：**typing** → **thinking** → **speaking**（及可选 idle），用于联调与演示 |
| 平滑过渡 | 前端对 `agent_state` / `render` 的切换做 easing，避免状态跳变导致动画抽搐；可沿用 V1 的 intensity 缓动 |
| 动作动画（manifest + VRMA） | 前端已实现：从 `public/animations/manifest.json` 读取动作列表，加载对应 VRMA 并并入 Mixer，支持按名称播放；与状态驱动（idle/thinking/speaking）可并存，协议可扩展以按名触发动作 |

### 1.2 本版不包含的

- 不接真实 OpenClaw Agent（Adapter 仅回放脚本或 mock 响应）
- 不做完整鉴权/生产级 session（可先固定 token 或免鉴权用于本地联调）
- 不做 TTS、口型驱动、Electron 桌面壳（留待 Step 3 或后续）

---

## 2. 状态与回放脚本

### 2.1 状态流（测试脚本）

回放脚本建议按以下顺序向前端推送消息，模拟一次完整对话回合：

| 顺序 | 状态/类型 | 说明 |
|------|-----------|------|
| 1 | `typing` 或 `listening` | 用户正在输入 / 等待输入（可选，与 roadmap 的 listening 对齐时可复用） |
| 2 | `thinking` | Agent 正在推理 |
| 3 | `speaking` | Agent 正在输出 |

脚本可循环或单次执行；每次状态切换发送一条 `agent_state`（及可选的 `render`）。

### 2.2 前端状态与 V1 的衔接

- V1 已有：`idle` | `thinking` | `speaking`。
- V2 若 Adapter 发送 `typing` / `listening`：前端可映射为 `idle` 或单独增加 `listening` 态并在 mapping 中给表现（如轻微前倾、注视）；为最小改动，可先映射为 `idle`。

---

## 3. 事件协议（V2：经 WebSocket）

### 3.1 连接与端点

- **连接方式**：WebSocket（如 `ws://localhost:端口/avatar` 或由配置指定）。
- **方向**：Adapter → 前端：推送 `agent_state`、`render`；前端 → Adapter：本版可仅心跳或预留 `user_input` 字段，Step 3 再真正上报。

### 3.2 消息格式（与 V1 / roadmap 一致）

**Adapter → 前端：状态**

```json
{
  "type": "agent_state",
  "session_id": "demo",
  "state": "thinking",
  "detail": "planning",
  "progress": 0.3
}
```

`state` 取值：`idle` | `listening` | `typing` | `thinking` | `speaking`（其中 `typing`/`listening` 可映射为前端已有态或新态）。

**Adapter → 前端：渲染指令（可选）**

```json
{
  "type": "render",
  "session_id": "demo",
  "state": "speaking",
  "emotion": "happy",
  "intensity": 0.8
}
```

### 3.3 回放脚本形态（Adapter 侧）

- 方式 A：Adapter 启动时或收到「开始回放」指令后，按固定时间间隔发送上述消息序列（如 2s idle → 3s thinking → 5s speaking → 2s idle，循环）。
- 方式 B：Adapter 提供静态脚本文件或配置（JSON 数组），按时间戳或间隔回放。

前端不关心脚本实现，只要求收到的消息格式符合上述协议。

---

## 4. 动作动画（manifest + VRMA）

### 4.1 资源与格式

- **路径**：`public/animations/manifest.json`（前端请求 `/animations/manifest.json`）。
- **格式**：

```json
{
  "animations": [
    { "name": "Show full body", "url": "/animations/VRMA_01.vrma" },
    { "name": "Greeting", "url": "/animations/VRMA_02.vrma" }
  ]
}
```

- **约定**：`name` 用于展示与按名播放；`url` 为相对 public 的路径，指向单个 VRMA 文件。

### 4.2 前端行为（已实现）

- VRM 加载完成后，请求 manifest，按 `url` 依次加载 VRMA（通过 `@pixiv/three-vrm-animation` 等），将解析出的 VRMAnimation 转为 Three.js AnimationClip，加入与模型共用的 **AnimationMixer**。
- 动作与状态驱动（idle/thinking/speaking）共用同一 Mixer：状态驱动控制表情/视线/呼吸等；manifest 中的动作为可选的「按名称播放」片段（如 Greeting、V sign）。
- 支持 **按名称播放**：给定 manifest 中某条的 `name`，可调用播放接口切换当前动作；播放结束后可回落至状态驱动或 idle。

### 4.3 与协议的衔接（可选扩展）

- 若 Adapter 或 Step 3 需要触发「指定动作」，可在 `render` 或 `agent_state` 中增加可选字段，例如 `gesture` 或 `action`，取值为 manifest 中某条的 `name`；前端收到后按名播放该动作，播完再恢复状态驱动。
- V2 回放脚本可不带 gesture/action，仅用 state 流（typing → thinking → speaking）；动作动画由本地 UI 或后续协议扩展触发。

---

## 5. 技术方案

### 5.1 前端变更点（相对 V1）

| 模块 | 变更 |
|------|------|
| 协议/网络 | 新增 **WS 客户端**：建立连接、订阅消息、断线重连（可选在本版做基础版） |
| 协议/消费 | 将 **WebSocket 收到的 JSON 视为 ProtocolMessage**，调用 V1 的 `applyProtocolMessage`，驱动现有状态机 |
| 状态机 / mapping | **复用 V1**；若有 `typing`/`listening`，在 mapping 中映射为 idle 或新状态表现 |
| 动作动画 | **已实现**：按 `public/animations/manifest.json` 加载 VRMA，并入 Mixer，支持按名称播放；与状态驱动并存，协议可扩展 `gesture`/`action` 按名触发 |
| UI | 保留 V1 的演示按钮可用于「无 Adapter 时回退」；新增 **连接状态**（已连/未连/重连中）、可选「开始回放」按钮（若 Adapter 支持）；可提供 manifest 动作列表的触发入口（按名播放） |

### 5.2 数据流（V2）

```
[Adapter WS] → 收到 agent_state / render
    → 解析为 ProtocolMessage
    → applyProtocolMessage(msg)（与 V1 同）
    → 状态机更新 currentState / emotion / intensity
    → tickIntensity() 平滑过渡
    → mapping + engine 驱动 VRM（与 V1 同）
```

### 5.3 平滑过渡（本版强调）

- **intensity**：继续使用 V1 的每帧 clamp 缓动（如 0.05/帧），确保 emotion/state 切换不突变。
- **状态切换**：同一 session 内连续收到不同 `state` 时，直接切换目标状态，由 intensity 与动画插值保证视觉平滑；避免竞态（如快速连续 thinking ↔ speaking）可通过「只认最新 state」或短时防抖处理。

---

## 6. Adapter 侧（最小可行）

- **职责**：监听 WebSocket 端口，接受前端连接；按脚本或定时向该连接推送 `agent_state`（及可选 `render`）消息。
- **实现**：Node.js 或 Go 均可；可先不做鉴权，session_id 固定为 `demo`。
- **回放内容**：至少实现 **typing → thinking → speaking** 的顺序推送（字段见上文），便于前端验证平滑过渡。

---

## 7. 验收标准（V2）

- [ ] 前端可配置 WebSocket 地址并成功连接 Adapter。
- [ ] Adapter 回放脚本能按顺序发送 typing → thinking → speaking（或等价 state），前端 Avatar 状态与表现随之切换。
- [ ] 状态切换在视觉上平滑过渡，无抽搐、无竞态导致的错乱。
- [ ] 前端 UI 能展示连接状态（已连/未连/错误）；可选：保留本地按钮在未连接时仍可演示。
- [ ] 协议与 V1 一致，便于 Step 3 将回放改为真实 OpenClaw 输出。
- [ ] 动作动画：manifest 存在且含有效条目时，VRM 加载后能加载对应 VRMA 并支持按名称播放；与状态驱动无冲突。

---

## 8. 与 V1 / Step 3 的衔接

- **V1**：V2 在 V1 基础上增加 WS 客户端与「消息来源」抽象；状态机、mapping、engine 复用。
- **Step 3**：将 Adapter 的「回放脚本」改为「接收 OpenClaw 输出并转发为 agent_state / render」；前端无需改协议与状态机，仅需适配鉴权与 session（若 Step 3 引入）。

---

## 9. 文档与仓库

- 本文档：`docs/design_v2.md`，描述 Step 2 范围、WebSocket 接入与回放脚本、平滑过渡要求。
- 上一版：`docs/design_v1.md`（本地演示 + 按钮模拟）。
- Roadmap：`docs/roadmap.md` 中 Step 2（接入 WebSocket）为本版依据。

以上为 ClawAvatar 第二版设计文档，聚焦「前端连 Adapter、Adapter 回放 typing → thinking → speaking、前端平滑过渡」；并约定**动作动画**由 `public/animations/manifest.json` 配置，已实现加载 VRMA 与按名称播放，协议可扩展 `gesture`/`action` 按名触发。
