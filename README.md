# ClawAvatar

ClawAvatar 是 OpenClaw 的 Avatar 前端（Electron + Web 渲染层）。

当前主路径是：

- OpenClaw Gateway + `avatar` 插件提供能力（`avatar.hello / avatar.pull / avatar.status / avatar.goodbye` + `avatar_express`）
- ClawAvatar Electron 作为 Avatar 客户端，握手后拉取事件并渲染表情/动作
- LLM 在合适时机自主调用 `avatar_express`

> 说明：README 以当前实际链路为准，旧的 Adapter 回放流程不再作为主开发路径。

## 架构概览

1. Electron 主进程：`electron/avatarPlugin.mjs`
2. Gateway 握手：先 `connect`，再 `avatar.hello`
3. 拉取事件：周期调用 `avatar.pull`
4. 前端渲染：`src/hooks/useElectronAvatarPlugin.ts` -> `src/hooks/useAvatarScene.ts`

## 前置要求

- Node 22+
- OpenClaw 仓库可运行（建议同机本地开发）
- 本项目有可用 VRM 模型：`public/models/avatar.glb`

## 安装 Avatar 插件（本地目录，未发布 npm）

将extensions/avatar放入OpenClaw根仓库。
在 OpenClaw 仓库根目录执行：

```bash
openclaw --dev plugins install extensions/avatar
openclaw --dev plugins enable avatar
```

验证插件已加载：

```bash
openclaw --dev plugins list --json | rg -n '"id": "avatar"|"status"|"gatewayMethods"'
```

## 启动开发环境（推荐）

### 1) 启动 OpenClaw Gateway（dev profile）

在 OpenClaw 仓库根目录：

```bash
pnpm gateway:dev
```

获取 dev token：

```bash
pnpm -s openclaw --dev config get gateway.auth.token | tail -n 1
```

### 2) 启动 ClawAvatar Electron

在 `ClawAvatar` 目录：

```bash
npm install
```

设置环境变量后启动（示例）：

```bash
export AVATAR_GATEWAY_WS_URL='ws://127.0.0.1:18789'
export AVATAR_TOKEN='<上一步 token>'
export AVATAR_SESSION_KEY='agent:dev:main'
npm run dev:electron
```

## 连接与握手验证

1. 在 Electron UI 点击「连接」
2. 在 OpenClaw 仓库验证：

```bash
pnpm openclaw --dev gateway call avatar.status --params '{"sessionKey":"agent:dev:main"}' --json
```

期望结果：`connected: true`

## 手动触发动作（联调）

```bash
TOKEN="$(pnpm -s openclaw --dev config get gateway.auth.token | tail -n 1 | tr -d '"')"

curl -sS http://127.0.0.1:18789/tools/invoke \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "avatar_express",
    "sessionKey": "agent:dev:main",
    "args": {
      "sessionKey": "agent:dev:main",
      "emotion": "happy",
      "action": "greeting",
      "intensity": 0.9,
      "durationMs": 1200,
      "text": "字幕测试"
    }
  }' | jq
```

期望：`accepted: true`

## Telegram 中让模型自主触发

满足以下条件后，LLM 会在合适时机调用 `avatar_express`：

1. Avatar 前端已握手成功（`avatar.status.connected=true`）
2. 会话工具策略允许 `avatar_express`
3. 该会话已注入 Avatar 能力上下文（插件 `before_agent_start`）

当前插件支持运行时回退：Telegram 会话未单独握手时，会回退到已连接的 Avatar 会话（通常是 `main`）。

## 当前行为约定

- `action`：触发动作 clip
- `emotion`：触发表情切换

## 常见问题

1. `unknown method: avatar.hello`

- 连接到了未启用 avatar 插件的 profile（常见是 `--dev`/默认 profile 混用）

2. `unauthorized: token mismatch`

- Electron 使用的 token 与当前 gateway profile 不一致

3. `handshake timeout`

- 前端未正确发送第一帧 `connect`
- 或存在重复连接实例，其中某条连接未发送 `connect`

4. `origin not allowed`

- WS 连接缺少/错误 `Origin`，需与 gateway host 对齐（例如 `http://127.0.0.1:18789`）

5. `accepted=false, reason=avatar_unavailable`

- `avatar.hello` 未成功
- 或 `sessionKey` 与当前运行会话不匹配

## 生产环境安装（本地目录方式）

如果还没发布 npm，生产也可以用本地路径安装：

```bash
openclaw plugins install /abs/path/to/extensions/avatar
openclaw plugins enable avatar
openclaw gateway restart
```

然后验证：

```bash
openclaw plugins list --json | rg -n '"id": "avatar"|"status"|"gatewayMethods"'
openclaw gateway call avatar.status --params '{"sessionKey":"main"}' --json
```

## 构建

```bash
npm run build
```
