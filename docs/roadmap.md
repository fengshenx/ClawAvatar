# VRM Avatar × OpenClaw：技术实现文档（Markdown）

> 目标：用 **VRM + Three.js** 做一个可复用的 Avatar（Web/桌面），作为 **OpenClaw 的自定义 Channel 前端**，支持：
> - 常驻（Mac 桌面右下角 / Web 页面）
> - 表情/动作/视线/口型（可选）驱动
> - OpenClaw 会话（session）与消息流对接
> - Agent 状态可视化（thinking / tool / speaking / idle）

---

## 1. 设计原则

### 1.1 边界划分
- **Avatar 属于交互呈现层（Presentation Layer）**
- OpenClaw 属于 **Agent/Tool 基础设施层（Infrastructure Layer）**
- 因此：Avatar 应以 **独立项目**形式存在，通过 **Channel / API / WebSocket** 接入 OpenClaw，避免耦合 OpenClaw 内部实现。

### 1.2 为什么是 Channel，而不是 Plugin/Skill
- Plugin/Skill：Agent 调用能力（Agent → Tool）
- Channel：用户交互入口（User ↔ UI ↔ Agent）
- Avatar 是 UI / 状态呈现，本质属于 Channel 的“皮肤与交互”。

---

## 2. 总体架构

### 2.1 组件图

+–––––––––––+         +———————––+
|  VRM Avatar Frontend | <WS/HTTP|  Avatar Channel Adapter |
|  (Three.js/Web/Electron)       |  (独立服务，可选)        |
+–––––+———–+         +———–+———––+
|                                   |
|                                   | (Channel API / WS)
v                                   v
+—————–+                +—————––+
| OpenClaw Gateway|  <———–> | OpenClaw Agent(s) |
+—————–+                +—————––+
| Skills/Memory
v
+—————––+
|  Tools / Memory   |
+—————––+

### 2.2 两种部署形态

**Avatar Channel Adapter（推荐，产品化）**
- 自建一个 `avatar-adapter`（Node.js/Go），专门处理：
  - session 管理
  - token 鉴权
  - 事件协议转换
  - 多端兼容（桌面、网页、移动端）
- Adapter 再与 OpenClaw Gateway 通信

> 推荐从 B 开始做：后期扩展最稳（语音、热更新、A/B、灰度、多个Agent等）

---

## 3. 功能需求与状态模型

### 3.1 Avatar 必需能力（MVP）
- VRM 模型加载与渲染（MToon / toon）
- 基础 Idle（呼吸/轻微摆动/眨眼）
- 视线 LookAt（看向相机/鼠标/焦点）
- 表情（happy/sad/angry/surprised/neutral）
- “说话状态”动作（嘴部开合或轻微点头）

### 3.2 状态机（强烈建议固定为少数状态）
建议最少 6 态（体验会显著“活”）：

| 状态 | 说明 | 表现建议 |
|---|---|---|
| `idle` | 空闲待命 | 呼吸 + 眨眼 |
| `listening` | 正在听/等待输入 | 轻微前倾 + 注视 |
| `thinking` | 正在推理 | 视线偏移 + 轻微皱眉 |
| `speaking` | 正在输出 | mouth/lip + 头部微动 |
| `tool_running` | 工具执行中 | 专注表情 + “忙碌”微动 |
| `error` | 错误/拒绝/失败 | 困惑或抱歉表情 |

---

## 4. 事件协议（Avatar ↔ OpenClaw）

> 协议设计目标：**前端只关心“状态与表情”**，不关心 OpenClaw 内部实现。

### 4.1 基础消息结构（建议）
#### 4.1.1 从 OpenClaw 到 Avatar：渲染指令

```json
{
  "type": "render",
  "session_id": "u_123",
  "message_id": "m_456",
  "text": "你好，我在。",
  "state": "speaking",
  "emotion": "happy",
  "intensity": 0.8,
  "gaze": "camera",
  "gesture": "nod",
  "viseme": [
    {"t": 0.00, "v": "A"},
    {"t": 0.10, "v": "I"},
    {"t": 0.20, "v": "U"}
  ],
  "meta": {
    "agent_id": "main",
    "trace_id": "t_xxx"
  }
}

4.1.2 从 Avatar 到 OpenClaw：用户输入

{
  "type": "user_input",
  "session_id": "u_123",
  "text": "帮我总结一下今天的任务",
  "context": {
    "app": "desktop",
    "locale": "zh-CN"
  }
}

4.2 Agent 状态流（可选但建议）

用于“存在感”：Thinking/Tool/Plan 可视化

{
  "type": "agent_state",
  "session_id": "u_123",
  "state": "thinking",
  "detail": "planning",
  "progress": 0.3
}

工具执行：

{
  "type": "agent_state",
  "session_id": "u_123",
  "state": "tool_running",
  "detail": "browser.search",
  "progress": 0.6
}


⸻

5. OpenClaw 侧实现（Channel 集成策略）

5.1 建议做法：新增 avatar Channel
	•	将 Avatar 作为一种 channel 类型接入 OpenClaw Gateway
	•	Gateway 负责：
	•	session 路由
	•	token 鉴权
	•	将 avatar 的 user_input 转为 OpenClaw 统一内部消息
	•	将 Agent 输出的 token stream / message 转为 render 与 agent_state

5.2 输出增强：让 Agent 输出“可驱动状态”

建议在 Agent 的系统提示（或 channel 适配层）增加“渲染提示约束”，例如：
	•	每次回复需要附带：
	•	state
	•	emotion
	•	intensity
	•	（可选）gesture
	•	（可选）gaze

推荐由 Channel Adapter 做“情绪推断与状态包装”，不要把格式压力全部丢给模型。
模型只给一些 cues 或 tags，Adapter 做最终结构化输出。

⸻

6. VRM 前端实现（Three.js）

6.1 技术栈
	•	three
	•	@pixiv/three-vrm
	•	GLTFLoader
	•	（可选）状态管理：zustand/redux/xstate

6.2 关键模块划分

web/
  src/
    engine/
      renderer.ts         # three 渲染循环
      loadVrm.ts          # VRM加载
      avatarRig.ts        # 统一封装表情/视线/动作
      animation.ts        # idle/speaking/thinking 动画
    net/
      wsClient.ts         # 与Adapter/Gateway通信
      protocol.ts         # 事件协议定义
    app/
      state.ts            # 前端状态机
      mapping.ts          # emotion/state -> 参数映射

6.3 VRM 加载（示例）

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRM, VRMUtils } from "@pixiv/three-vrm";

export async function loadVRM(url: string): Promise<VRM> {
  const loader = new GLTFLoader();

  const gltf = await new Promise<any>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.removeUnnecessaryJoints(gltf.scene);

  const vrm = await VRM.from(gltf);
  return vrm;
}

6.4 表情控制（示例）

export function setEmotion(vrm: VRM, name: string, value: number) {
  vrm.expressionManager?.setValue(name as any, value);
}

推荐规范化 emotion：
	•	neutral
	•	happy
	•	sad
	•	angry
	•	surprised
	•	relaxed

6.5 视线 LookAt（示例）

export function lookAtCamera(vrm: VRM, camera: THREE.Camera) {
  if (!vrm.lookAt) return;
  vrm.lookAt.target = camera;
}

6.6 “说话”表现（无音频也可）
	•	最简单：speaking 时做“头部微动 + 轻微点头”
	•	进阶：TTS 音频 RMS 驱动口型（mouthOpen）

⸻

7. 表情/动作映射策略

7.1 状态到动画

state	动画
idle	breathing + blink
listening	slight lean forward
thinking	head tilt + gaze away
speaking	mouth open + nod
tool_running	focused + minimal movement
error	confused

7.2 emotion 到 BlendShape

emotion	VRM 表情建议
neutral	Neutral
happy	Happy
sad	Sad
angry	Angry
surprised	Surprised
relaxed	Relaxed

7.3 强度 intensity
	•	用于平滑过渡与避免“表情抽搐”
	•	建议做 easing：
	•	0.0 -> 1.0 的缓动插值
	•	每帧最大变化量限制（例如 0.05）

⸻

8. Mac 桌面常驻（Electron 壳）

8.1 目标
	•	无边框透明窗口
	•	右下角悬浮
	•	alwaysOnTop
	•	可选：隐藏 Dock 图标（skipTaskbar）

8.2 Electron 主进程示例

const { app, BrowserWindow, screen } = require("electron");

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 320,
    height: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true }
  });

  win.setPosition(width - 320 - 20, height - 420 - 20);
  win.loadURL("http://localhost:3000"); // 复用 Web Avatar
});

备注：想实现点击穿透可用 win.setIgnoreMouseEvents(true)（需要设计“唤醒交互”的手段）

⸻

9. 安全与鉴权

9.1 Token
	•	Avatar 前端拿到 avatar_token（短期 token）
	•	WebSocket 连接时携带：
	•	Authorization: Bearer <token>
	•	或 query param（不推荐）

9.2 Session 隔离
	•	session_id 必须由服务端签发
	•	前端只能使用自己 session
	•	Adapter/Gateway 需验证 token 与 session 的绑定关系

9.3 防注入
	•	渲染消息只允许白名单字段（state/emotion/gesture 等）
	•	禁止前端直接执行任意命令（工具调用必须由 Agent 决策）

⸻

10. MVP 里程碑（建议按 3 步落地）

10.1 Step 1：本地演示
	•	Web 显示 VRM
	•	切换状态：idle/thinking/speaking
	•	用按钮模拟协议事件

10.2 Step 2：接入 WebSocket
	•	前端连 Adapter
	•	Adapter 回放测试脚本：
	•	typing -> thinking -> speaking
	•	前端实现平滑过渡

10.3 Step 3：接 OpenClaw
	•	Avatar user_input -> OpenClaw Agent
	•	Agent 输出 -> Adapter 包装成 render 与 agent_state
	•	桌面壳（Electron）常驻

⸻

11. 质量标准（上线前 checklist）
	•	60 FPS（默认模型）
	•	CPU/GPU 占用稳定（常驻 1 小时不漂移）
	•	断线重连（WS reconnect + session resume）
	•	表情/动作过渡不抽搐（easing）
	•	状态机无竞态（speaking/thinking 切换可控）
	•	鉴权正确（token 失效/越权 session 拦截）
	•	多会话可扩展（未来多 agent / 多窗口）

⸻

12. 后续扩展路线（可选）
	•	TTS（Mac 本地/云端） + 音频驱动口型（viseme）
	•	Agent 工具调用可视化（tool timeline）
	•	多 Avatar（多 agent）切换
	•	记忆可视化（memory highlights）
	•	交互热键（唤醒/隐藏/贴边吸附）

⸻


如果你想，我可以在这份文档基础上继续补两块“最关键的可落地内容”（不问你额外问题，直接给默认方案）：

1) **Avatar Channel Adapter 的 Node.js 参考实现**（WS server + session/token + 转发到 OpenClaw）  
2) **VRM 前端完整最小可运行代码结构**（含状态机、表情缓动、Idle动画、WS驱动）

你只要告诉我：你更偏向 **直连 Gateway** 还是 **先做 Adapter**。我会按你选的那条把代码骨架写完整。