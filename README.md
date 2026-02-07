# ClawAvatar

Web 端 VRM 形象展示与状态演示（V1：本地演示）。支持 idle / thinking / speaking 状态切换，通过按钮模拟事件协议，为后续接入 WebSocket 与 OpenClaw 打基础。

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

## 如何用按钮模拟协议事件

- **设为 Idle**：发送 `agent_state`，`state=idle`，进入呼吸 + 眨眼。
- **设为 Thinking**：发送 `agent_state`，`state=thinking`，进入思考姿态/视线偏移。
- **设为 Speaking**：发送 `agent_state`，`state=speaking`，进入说话姿态（微动/口型）。
- **发送示例 Render**：发送一条 `render`（如 `state=speaking`, `emotion=happy`），用于验证 render 路径。

按钮不请求网络，仅在本地调用状态机与 `protocol/simulate`，驱动 Avatar。当前状态会显示在控制区上方。

## 数据流（V1）

```
[按钮点击] → 构造 agent_state / render
    → protocol/simulate 或 app/state 更新 currentState
    → mapping 得到动画参数（blend 权重、lookAt 目标等）
    → engine (avatarRig + animation) 驱动 VRM
```

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
