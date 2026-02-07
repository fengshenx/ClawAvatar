# ClawAvatar

Web 端 VRM 形象展示与状态演示。支持 idle / thinking / speaking 状态切换；V2 通过 WebSocket 连接 Avatar Channel Adapter，由 Adapter 回放测试脚本（typing → thinking → speaking），前端平滑过渡；无 Adapter 时仍可用本地按钮模拟协议（V1 行为）。

## 技术栈

- **three** + **@pixiv/three-vrm**：3D 与 VRM 渲染
- **React** + **TypeScript** + **Vite**：前端与构建
- **Zustand**：前端状态机

## 项目结构（V1）

```
src/
  engine/         # Three 场景、VRM 加载、表情/视线/动画，不关心协议
  protocol/       # agent_state / render 类型与 simulate 逻辑
  app/            # 状态机 (state) + 状态到动画参数映射 (mapping)
  ui/             # 模拟协议事件的按钮组 (DemoButtons)
  hooks/          # useAvatarScene：场景创建、VRM 加载、渲染循环
```

## 如何运行本地演示

1. 安装依赖：

   ```bash
   npm install
   ```

2. 准备 VRM 模型（至少一个 .vrm 文件）：
   - 将文件命名为 `avatar.vrm` 并放入 **`public/models/`** 目录；
   - 或修改代码中的 `vrmUrl`（如 `useAvatarScene` 的默认 `DEFAULT_VRM_URL`）指向你的 URL。

3. 启动开发服务器：

   ```bash
   npm run dev
   ```

4. 在浏览器中打开控制台提示的地址（通常为 `http://localhost:5173`）。

## V2：WebSocket 连接 Adapter

前端默认连接 `ws://localhost:8765/avatar`（可通过环境变量 `VITE_AVATAR_WS_URL` 覆盖，见 `.env.example`）。底部控制区会显示连接状态（已连 / 未连 / 错误 / 重连中），并可手动「连接」「断开」。

**运行 Adapter 回放脚本（可选）**：在项目根目录执行：

```bash
npm run adapter
```

或**一条命令同时启动前端 + Adapter**（本地联调推荐）：

```bash
npm run dev:all
```

Adapter 会按顺序向前端推送：**typing** → **thinking** → **speaking** → **idle**，循环。Avatar 状态会随之平滑切换。未启动 Adapter 时，前端会显示未连接，仍可使用下方按钮本地模拟协议。

## 如何用按钮模拟协议事件

- **设为 Idle**：发送 `agent_state`，`state=idle`，进入呼吸 + 眨眼。
- **设为 Thinking**：发送 `agent_state`，`state=thinking`，进入思考姿态/视线偏移。
- **设为 Speaking**：发送 `agent_state`，`state=speaking`，进入说话姿态（微动/口型）。
- **发送示例 Render**：发送一条 `render`（如 `state=speaking`, `emotion=happy`），用于验证 render 路径。

按钮不请求网络，仅在本地调用状态机与 `protocol/simulate`，驱动 Avatar。当前状态会显示在控制区上方。

## VRMA 动作（自动加载 + 按钮触发）

若有一批 **VRMA（VRM Animation）** 文件，可自动加载并在页面上显示对应按钮，点击即播放该动作：

1. 将 `.vrma` 文件放到 **`public/animations/`** 目录（或任意可通过 URL 访问的路径）。
2. 编辑 **`public/animations/manifest.json`**，在 `animations` 数组中为每个动作填写 `name`（展示名）和 `url`（相对或绝对 URL），例如：

   ```json
   {
     "animations": [
       { "name": "挥手", "url": "/animations/wave.vrma" },
       { "name": "点头", "url": "/animations/nod.vrma" }
     ]
   }
   ```

3. 启动/刷新页面后，会先加载 VRM 模型，再请求 `manifest.json` 并逐个加载其中的 VRMA；加载成功后，控制区会出现「模型动作」按钮（与 GLB 内置动画合并展示），点击即可播放对应动作。

同一 VRMA 文件若包含多条动画，会显示为「名称 1」「名称 2」等；未配置 manifest 或 `animations` 为空时，不会请求 VRMA，仅保留 GLB 内置动画（若有）。

## 数据流（V1）

```
[按钮点击] → 构造 agent_state / render
    → protocol/simulate 或 app/state 更新 currentState
    → mapping 得到动画参数（blend 权重、lookAt 目标等）
    → engine (avatarRig + animation) 驱动 VRM
```

## 动作从哪里来？怎么实现？

动作由 **状态** 驱动，经 **映射** 变成权重，再由 **engine** 用时间和权重算出具体位移/旋转并作用到 VRM：

| 层级 | 位置 | 作用 |
|------|------|------|
| 状态 | `app/state.ts` | 当前 `idle` / `thinking` / `speaking`（来自按钮或后续 WS） |
| 映射 | `app/mapping.ts` | 状态 → `breathingWeight`、`blinkWeight`、`thinkingWeight`、`speakingWeight` 等 |
| 整体运动 | `engine/animation.ts` | 用 `time` + 权重生成呼吸(上下)、思考(歪头)、说话(点头)，施加到 **整个 Avatar 的 Group** |
| 表情与视线 | `engine/avatarRig.ts` | **LookAt** 看向相机；**BlendShape**：表情(neutral/happy…)、眨眼(含 idle 周期性眨眼)、嘴型(aa/oh)；**头部骨骼** 在 `vrm.update()` 后再叠加点头/歪头 |

**若模型「没有动作」**，可检查：

1. **VRM 是否带 Humanoid**：头部点头/歪头依赖 `humanoid.getBoneNode('head')`，标准 VRM 一般都有。
2. **BlendShape 名称**：眨眼、嘴型、表情依赖模型里的 BlendShape。若模型没有 `blink`、`aa`、`oh` 或表情预设，对应表情不会动；整体运动（呼吸、点头、歪头）不依赖 BlendShape，会一直有。
3. **幅度**：呼吸/点头/歪头的幅度在 `engine/animation.ts`（如 `BREATH_AMPLITUDE`、`NOD_AMPLITUDE`、`TILT_AMPLITUDE`）和 `avatarRig.ts` 的 `applyHeadBoneMotion` 里，可调大以更明显。

**GLB/VRM 里自带的动作**：

- **时间轴动画**（`gltf.animations`）：若模型里带了 AnimationClip（如 idle、walk），加载后会自动播放**第一个**片段，见 `engine/clipAnimations.ts`。很多 VRM 只带骨骼和 BlendShape，不带 clip，所以会看不到这类动作。
- **BlendShape / 骨骼**：上面说的表情、眨眼、口型、LookAt、程序化点头歪头，不依赖文件里有没有动画片段。

**如何加新动作**：

- 新状态：在 `protocol/types.ts` 和 `app/mapping.ts` 里加状态与权重映射，在 `animation.ts` / `avatarRig.ts` 里根据新权重写对应运动或表情。
- 新表情/口型：若 VRM 有对应 BlendShape，在 `avatarRig.ts` 里用 `expressionManager.setValue(预设名, weight)` 驱动即可。
- 播模型里别的动画片段：在 `clipAnimations.ts` 里按名字选 clip 或做混合即可。

## 文档

- 第一版设计：`docs/design_v1.md`
- 路线图与协议扩展：`docs/roadmap.md`

## 构建与预览

```bash
npm run build   # 产出到 dist/
npm run preview # 本地预览构建结果
```

## License

见 [LICENSE](LICENSE)。
