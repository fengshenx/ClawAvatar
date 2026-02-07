# ClawAvatar 第一版设计文档（V1）

> **版本范围**：对应 roadmap 的 **Step 1：本地演示**  
> **目标**：在 Web 端展示 VRM 形象，支持 idle/thinking/speaking 状态切换，并通过按钮模拟协议事件，为后续接入 WebSocket 与 OpenClaw 打基础。

---

## 1. 版本目标与范围

### 1.1 本版要交付的

| 项目 | 说明 |
|------|------|
| Web 显示 VRM | 在浏览器中加载并渲染一个 VRM 模型（MToon/toon），保证基础光照与 60 FPS |
| 状态切换 | 支持三种状态：**idle**、**thinking**、**speaking**，每种状态有明确的视觉表现 |
| 协议模拟 | 用 UI 按钮触发与「事件协议」一致的行为，便于联调与演示，无需真实后端 |

### 1.2 本版不包含的

- 不接 WebSocket / Adapter / OpenClaw
- 不做鉴权、session、多端
- 不做 TTS、口型驱动（speaking 仅用简单动画表示）
- 不做 Electron 桌面壳（仅 Web）

---

## 2. 状态模型（V1 子集）

第一版只实现 3 个状态，与 roadmap 中完整 6 态兼容，后续可直接扩展。

| 状态 | 说明 | V1 表现 |
|------|------|--------|
| `idle` | 空闲待命 | 呼吸感 + 眨眼（若有 BlendShape） |
| `thinking` | 正在推理 | 视线偏移或轻微歪头 + 可选的「思考」表情 |
| `speaking` | 正在输出 | 嘴部开合或轻微点头，无真实 TTS |

状态切换需**平滑过渡**（easing），避免瞬间跳变。

---

## 3. 事件协议（V1 可模拟部分）

前端内部采用与 roadmap 一致的消息结构，便于之后替换为真实 WS 事件。

### 3.1 用于驱动 Avatar 的消息（模拟输入）

**状态切换（agent_state）：**

```json
{
  "type": "agent_state",
  "session_id": "demo",
  "state": "idle",
  "detail": null,
  "progress": null
}
```

`state` 取值：`idle` | `thinking` | `speaking`。

**渲染指令（render，可选在 V1 做简化）：**

```json
{
  "type": "render",
  "session_id": "demo",
  "state": "speaking",
  "emotion": "neutral",
  "intensity": 0.8
}
```

V1 可只处理 `state`，`emotion`/`intensity` 可用默认值。

### 3.2 按钮与协议的对应关系

| 按钮 | 发送/触发的协议 | 预期效果 |
|------|------------------|----------|
| 设为 Idle | `agent_state` state=idle | 进入呼吸+眨眼 |
| 设为 Thinking | `agent_state` state=thinking | 进入思考姿态/视线偏移 |
| 设为 Speaking | `agent_state` state=speaking | 进入说话姿态（微动/口型） |
| （可选）发送示例 render | `render` state=speaking, emotion=happy | 同上，并带表情 |

即：**用按钮直接构造并派发上述 JSON，由前端状态机消费，驱动 VRM。**

---

## 4. 技术方案

### 4.1 技术栈（与 roadmap 对齐）

- **three** + **@pixiv/three-vrm**
- **GLTFLoader** 加载 .vrm
- 状态管理：Zustand 或 React useState（二选一，够用即可）
- 构建：现有 Vite + React/TS 即可

### 4.2 模块划分（V1 最小集）

```
web/  (或 electron/renderer 下的同构结构)
  src/
    engine/
      renderer.ts      # Three 场景、相机、渲染循环
      loadVrm.ts       # 加载 VRM，返回 VRM 实例
      avatarRig.ts     # 封装：表情、视线、基础动作
      animation.ts     # idle/thinking/speaking 的动画逻辑
    protocol/
      types.ts         # agent_state / render 等类型定义
      simulate.ts      # 根据协议消息更新「待应用状态」
    app/
      state.ts         # 前端状态机：currentState (idle|thinking|speaking)
      mapping.ts       # state -> 动画/表情参数映射
    ui/
      DemoButtons.tsx  # 模拟协议事件的按钮组
```

- **engine**：只负责 3D 与 VRM，不关心协议。
- **protocol**：解析 `agent_state`/`render`，输出「下一状态」或「下一组动画参数」。
- **app**：状态机 + 映射；把「当前状态」和「强度」等转成 engine 可用的参数。
- **ui**：按钮点击时构造协议消息，调用 `simulate` 或直接写状态机。

### 4.3 数据流（V1）

```
[按钮点击] → 构造 agent_state / render
    → protocol/simulate 或 app/state 更新 currentState
    → mapping 得到动画参数（如 blend 权重、lookAt 目标）
    → engine (avatarRig + animation) 驱动 VRM
```

---

## 5. 状态到表现的映射（V1）

| state     | 动画/表现 |
|----------|-----------|
| idle     | breathing + blink（若有） |
| thinking | 视线偏移或 head tilt，可选皱眉/思考表情 |
| speaking | 头部微动 + 嘴部开合或点头（无 TTS 时用周期动画） |

- **intensity**：用于平滑过渡；建议 0→1 做 ease，每帧变化量做 clamp（如 0.05），避免抽搐。

---

## 6. UI 与交互（本地演示）

### 6.1 布局

- **主区域**：Canvas 全屏或大块区域，仅渲染 VRM + 简单场景（地面/纯色背景）。
- **控制区**：固定位置（如底部或侧边）的按钮组。

### 6.2 按钮（模拟协议事件）

- **设为 Idle**：发送 `agent_state` state=idle。
- **设为 Thinking**：发送 `agent_state` state=thinking。
- **设为 Speaking**：发送 `agent_state` state=speaking。
- 可选：**发送示例 Render**：发送一条 `render`（如 state=speaking, emotion=happy），用于验证 render 路径。

按钮无需请求网络，仅在本地调用状态机/`simulate`，驱动 Avatar。

### 6.3 可选：当前状态展示

- 在 UI 上显示当前状态（idle / thinking / speaking），便于确认协议驱动是否生效。

---

## 7. VRM 资源与运行要求

- **资源**：至少一个 .vrm 文件（可放在 `public/` 或通过 URL 配置）。
- **性能**：目标 60 FPS（默认模型下），避免不必要的后处理与高面数模型。
- **兼容**：MToon / toon 着色；BlendShape 按 roadmap 规范（neutral, happy, sad 等）若有则用，若无则用骨骼/简单动画替代。

---

## 8. 验收标准（V1）

- [ ] Web 页面可加载并稳定渲染指定 VRM。
- [ ] 三种状态 idle / thinking / speaking 可通过按钮切换，且有明显、平滑的视觉区分。
- [ ] 协议形态：按钮触发的逻辑与 `agent_state`（及可选的 `render`）结构一致，便于后续替换为 WS 事件。
- [ ] 无控制台报错，状态切换无竞态（如快速连点不会错乱）。
- [ ] 文档：README 或 docs 中说明如何运行本地演示及如何用按钮模拟协议事件。

---

## 9. 与后续版本的衔接

- **Step 2（接入 WebSocket）**：将「按钮构造消息」改为「从 WS 接收消息」，其余状态机与 mapping 复用。
- **Step 3（接 OpenClaw）**：在 Adapter 侧发送 `agent_state` / `render`，前端逻辑不变。
- **扩展状态**：在状态机中增加 `listening`、`tool_running`、`error`，并在 mapping 与 animation 中补表现即可。

---

## 10. 文档与仓库

- 本文档：`docs/design_v1.md`，描述第一版范围、协议模拟方式与验收标准。
- Roadmap：`docs/roadmap.md` 中 Step 1（本地演示）为本版依据；Step 2/3 为后续迭代。

以上为 ClawAvatar 第一版设计文档，聚焦「Web 显示 VRM + 状态切换 + 按钮模拟协议事件」，为后续接入 WebSocket 与 OpenClaw 打好基础。
