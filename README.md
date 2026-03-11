# ClawAvatar

ClawAvatar 是 OpenClaw 的 Avatar 前端（Electron + Web 渲染层），通过 WebSocket 实时接收并渲染 LLM 触发的表情/动作。

支持 **macOS** 和 **Windows**。

---

## ⭐ 快速开始（支持 macOS / Windows）

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动 ClawAvatar**
   ```bash
   npm run dev:electron
   ```

3. **安装插件**：应用右上角会显示「📦 安装 OpenClaw 插件」按钮，点击安装

4. **重启 Gateway**
   ```bash
   openclaw gateway restart
   ```

5. **检查连接状态**：左下角状态指示灯变绿表示连接成功（红色表示未连接）

6. **测试 Avatar 能力**：在聊天框输入 `openclaw avatar有哪些能力`，看看输出结果

---

## 📌 核心特性

- **实时通信**：基于 WebSocket（WS），实时接收 OpenClaw Gateway 的表情/动作事件
- **LLM 自主触发**：AI 根据对话上下文自主调用 `avatar_express` 工具
- **Live2D 渲染**：支持标准 Live2D 模型（.moc3 + .model3.json）
- **性能优化**：已优化渲染循环，降低 CPU 使用率

---

## 🏗️ 架构概览

### 通信流程

```
LLM 对话
  ↓
调用 avatar_express 工具
  ↓
OpenClaw Gateway (127.0.0.1:18789)
  ↓
WebSocket 实时推送 (127.0.0.1:18802)
  ↓
ClawAvatar Electron 前端
  ↓
Live2D 渲染 (useLive2DScene.ts)
```

### 核心组件

1. **Electron 主进程**：`electron/avatarPlugin.mjs` - WS 握手和事件接收
2. **WebSocket 通信**：连接 `ws://127.0.0.1:18802/extension`，实时接收事件
3. **前端渲染**：
   - `src/hooks/useElectronAvatarPlugin.ts` - WS 事件处理
   - `src/hooks/useLive2DScene.ts` - Live2D 渲染引擎
4. **LLM 工具调用**：`avatar_express` - AI 自主触发表情/动作

### 握手流程

1. **连接**：ClawAvatar 连接到 OpenClaw Gateway 的 Extension WS
2. **握手**：调用 `avatar.hello` 建立 session 绑定
3. **状态同步**：通过 `avatar.status` 查询连接状态
4. **实时推送**：Gateway 通过 WS 实时推送表情/动作事件

---

## 📦 前置要求

- **Node.js** 22+
- **OpenClaw**：建议同机本地开发
- **Live2D 模型**：支持标准 .moc3 格式

### Live2D 模型配置

项目内置默认模型 `Hiyori`，位于 `public/models/Hiyori/`。

**替换模型：**

1. 将模型文件放入 `public/models/<模型名>/`
2. 修改 `src/hooks/useLive2DScene.ts` 中的 `DEFAULT_MODEL_URL`

**模型文件要求：**
- `.model3.json` - 模型描述文件
- `.moc3` - 模型数据文件
- 纹理图片（.png）
- 可选：动作文件、表情文件、物理效果文件

---

## 🚀 安装与运行

### 方式 1：生产环境（正式 profile）

#### 安装插件（推荐方式：UI 按钮）

启动 ClawAvatar 后，点击右上角的「📦 安装 OpenClaw 插件」按钮即可自动安装。

#### 验证插件

```bash
# 查看插件列表
openclaw plugins list --json | rg -n '"id": "avatar"|"status"|"gatewayMethods"'

# 测试插件状态
openclaw gateway call avatar.status --params '{"sessionKey":"main"}' --json
```

#### 启动 ClawAvatar

```bash
# 设置环境变量
export AVATAR_EXTENSION_WS_URL='ws://127.0.0.1:18802/extension'
export AVATAR_SESSION_KEY='main'

# 启动 Electron
npm run dev:electron
```

---

### 方式 2：开发环境（dev profile）⭐推荐

#### 安装插件

```bash
# 在 OpenClaw 仓库根目录执行
cd ~/Documents/code/openclaw  # 或你的 openclaw 路径

# 确保 ClawAvatar 的 extensions/avatar 在 OpenClaw 根目录
# ln -s ~/Documents/code/ClawAvatar/extensions/avatar extensions/avatar

# 安装并启用插件（dev 模式）
openclaw --dev plugins install extensions/avatar
openclaw --dev plugins enable avatar

# 启动开发 Gateway
pnpm gateway:dev
```

#### 验证插件

```bash
# 查看 dev profile 插件列表
openclaw --dev plugins list --json | rg -n '"id": "avatar"|"status"|"gatewayMethods"'

# 测试插件状态
openclaw --dev gateway call avatar.status --params '{"sessionKey":"agent:dev:main"}' --json
```

#### 启动 ClawAvatar

```bash
# 在 ClawAvatar 项目目录

# 方式 1：使用环境变量（推荐）
export AVATAR_EXTENSION_WS_URL='ws://127.0.0.1:18802/extension'
export AVATAR_SESSION_KEY='agent:dev:main'
npm run dev:electron

# 方式 2：使用 .env.local 文件
echo "AVATAR_SESSION_KEY=agent:dev:main" > .env.local
npm run dev:electron
```

**说明：**
- `AVATAR_EXTENSION_WS_URL`：默认已内置 `ws://127.0.0.1:18802/extension`，通常可省略
- `AVATAR_SESSION_KEY`：
  - 生产环境：`main`
  - 开发环境：`agent:dev:main`
- Extension WS 不使用 token 校验，仅允许本机 loopback 访问

---

## ✅ 连接验证

### 1. 前端连接

在 ClawAvatar Electron UI 点击「连接」按钮。

### 2. 状态验证

在 OpenClaw 仓库执行：

```bash
# 生产环境
openclaw gateway call avatar.status --params '{"sessionKey":"main"}' --json

# 开发环境（推荐）
openclaw --dev gateway call avatar.status --params '{"sessionKey":"agent:dev:main"}' --json
```

**期望结果：**
```json
{
  "connected": true,
  "sessionKey": "agent:dev:main",
  "avatarId": "claw-avatar-electron"
}
```

---

## 🎮 手动触发测试（联调）

### 使用 dev profile（推荐）

```bash
# 1. 获取 dev profile 的 token
TOKEN="$(pnpm -s openclaw --dev config get gateway.auth.token | tail -n 1 | tr -d '"')"

# 2. 调用 avatar_express 工具
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

**期望结果：**
```json
{
  "ok": true,
  "accepted": true
}
```

### 使用正式 profile

```bash
# 获取正式 profile 的 token
TOKEN="$(openclaw config get gateway.auth.token | tail -n 1 | tr -d '"')"

# 调用工具（注意 sessionKey 改为 main）
curl -sS http://127.0.0.1:18789/tools/invoke \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "avatar_express",
    "sessionKey": "main",
    "args": {
      "sessionKey": "main",
      "emotion": "happy",
      "action": "wave"
    }
  }' | jq
```

---

## 🤖 LLM 自主触发

在 Telegram 对话中，LLM 会在合适时机自主调用 `avatar_express` 工具。

### 触发条件

1. ✅ Avatar 前端已握手成功（`avatar.status.connected=true`）
2. ✅ 会话工具策略允许 `avatar_express`
3. ✅ 该会话已注入 Avatar 能力上下文（插件的 `before_agent_start`）

### 运行时回退机制

- 如果当前 Telegram 会话未单独握手 Avatar
- 系统会自动回退到已连接的 Avatar 会话（通常是 `main`）

### 上下文注入

Avatar 插件会在 `before_agent_start` 钩子中注入：

```
<avatar_expression>
可用的表情：...
可用的动作：...
使用时机：...
</avatar_expression>
```

LLM 会根据对话上下文自主决定是否触发表情/动作。

---

## 🎭 参数说明

### avatar_express 工具参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `emotion` | string | 表情名称 | `"happy"`, `"sad"`, `"focused"` |
| `action` | string | 动作名称 | `"wave"`, `"nod"`, `"talking"` |
| `intensity` | number | 强度（0-1） | `0.8` |
| `durationMs` | number | 持续时间（毫秒） | `2000` |
| `gesture` | string | 手势提示 | `"shy_0"`, `"happy_1"` |
| `text` | string | 显示的字幕 | `"你好～"` |
| `sessionKey` | string | 目标会话 | `"main"`, `"agent:dev:main"` |

### 行为约定

- **action**：触发预定义的动作 clip（如挥手、点头）
- **emotion**：切换表情参数（如开心、难过、专注）
- **gesture**：额外的手势提示（可选）

---

## ❓ 常见问题

### 1. `unknown method: avatar.hello`

**原因：**
- 连接到了未启用 avatar 插件的 profile
- Extension WS 服务未启动

**解决：**
```bash
# 检查插件状态
openclaw --dev plugins list | rg avatar

# 确保使用正确的 profile
# 开发环境用 --dev
openclaw --dev gateway call avatar.status --params '{"sessionKey":"agent:dev:main"}'
```

---

### 2. `ECONNREFUSED 127.0.0.1:18802`

**原因：**
- OpenClaw Gateway 未启动
- avatar 插件未启用
- 端口被占用

**解决：**
```bash
# 1. 检查 Gateway 是否运行
openclaw --dev gateway status

# 2. 检查插件是否启用
openclaw --dev plugins list

# 3. 检查端口占用
lsof -i :18802

# 4. 重启 Gateway
openclaw --dev gateway restart
```

---

### 3. `accepted=false, reason=avatar_unavailable`

**原因：**
- `avatar.hello` 握手失败
- `sessionKey` 不匹配

**解决：**
```bash
# 1. 检查握手状态
openclaw --dev gateway call avatar.status --params '{"sessionKey":"agent:dev:main"}'

# 2. 确认 sessionKey 一致
# ClawAvatar: AVATAR_SESSION_KEY=agent:dev:main
# 测试命令: sessionKey=agent:dev:main
```

---

### 4. CPU 使用率高

**已优化！** 现在的版本已修复：

- ✅ 移除了渲染循环中的 `store.getState()` 调用（原 60 次/秒）
- ✅ 添加了 ref 缓存机制
- ✅ 模型未加载时停止渲染循环

**预期性能：**
- 模型加载前：< 5% CPU
- 模型加载后（30 FPS）：~30% CPU

---

## 🔧 构建

```bash
# 开发构建
npm run build

# 生产构建
npm run build:prod
```

---

## 📚 相关链接

- **OpenClaw 文档**：https://docs.openclaw.ai
- **OpenClaw 源码**：https://github.com/openclaw/openclaw
- **Live2D 文档**：https://docs.live2d.com

---

**Last updated:** 2026-03-01  
**Maintained by:** Moss 🌿
