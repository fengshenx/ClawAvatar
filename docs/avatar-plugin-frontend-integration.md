# Avatar 插件前端接入指南（连接、握手、打通）

本文面向 Avatar 前端开发，说明如何与 OpenClaw `avatar` 插件完成连接、握手和联调。

## 1. 前置条件

1. 已在 OpenClaw 启用 `avatar` 插件。
2. Gateway 已启动（默认 WS 地址：`ws://127.0.0.1:18789`）。
3. 你有可用的 Gateway 鉴权信息（token/password/device 签名等）。
4. 前端连接账号建议使用 `operator` 角色，并具备足够权限访问插件方法。

注意：`avatar.*` 是插件 RPC 方法，不是内置 core 方法。权限不足时会返回 `missing scope`。

## 2. 通信模型

当前 Avatar 插件采用 **WS RPC + pull** 模型：

1. 先连接 Gateway WS 并完成 `connect`。
2. 调用 `avatar.hello` 上报前端支持的情绪/动作能力（握手）。
3. 周期调用 `avatar.pull` 拉取 Avatar 动作事件。
4. 可调用 `avatar.status` 查看连接状态。
5. 结束时调用 `avatar.goodbye` 清理连接态。

## 3. Gateway WS 握手（第一层）

连接后第一帧必须是 Gateway `connect` 请求（示例）：

```json
{
  "type": "req",
  "id": "connect-1",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": {
      "id": "webchat-ui",
      "displayName": "avatar-ui",
      "version": "0.1.0",
      "platform": "web",
      "mode": "ui"
    },
    "auth": {
      "token": "<YOUR_GATEWAY_TOKEN>"
    }
  }
}
```

返回 `ok=true` 后，才可以调用 `avatar.*` 方法。

## 4. Avatar 能力握手（第二层）

调用 `avatar.hello`：

```json
{
  "type": "req",
  "id": "avatar-hello-1",
  "method": "avatar.hello",
  "params": {
    "sessionKey": "main",
    "connectionId": "frontend-conn-001",
    "avatarId": "avt_fox_v1",
    "protocolVersion": "1.0",
    "capabilities": {
      "emotions": ["neutral", "happy", "sad", "sorry", "confused"],
      "actions": ["thinking", "talking", "wave", "nod", "settle", "idle_recover"],
      "viseme": { "supported": true, "mode": "auto" },
      "fallback": {
        "talking_fast": "talking",
        "error_pose": "idle_recover"
      }
    }
  }
}
```

成功响应示例：

```json
{
  "type": "res",
  "id": "avatar-hello-1",
  "ok": true,
  "payload": {
    "event": "avatar.helloAck",
    "connectionId": "frontend-conn-001",
    "sessionKey": "main",
    "avatarId": "avt_fox_v1",
    "negotiatedVersion": "1.0",
    "acceptedCapabilities": {
      "emotions": ["neutral", "happy", "sad", "sorry", "confused"],
      "actions": ["thinking", "talking", "wave", "nod", "settle", "idle_recover"],
      "viseme": { "supported": true, "mode": "auto" },
      "fallback": {
        "talking_fast": "talking",
        "error_pose": "idle_recover"
      }
    },
    "serverTs": 1737264000001
  }
}
```

## 5. 拉取 Avatar 事件

插件是 pull 模式，前端可每 50-200ms 调一次：

```json
{
  "type": "req",
  "id": "avatar-pull-1",
  "method": "avatar.pull",
  "params": {
    "sessionKey": "main",
    "max": 20
  }
}
```

响应示例：

```json
{
  "type": "res",
  "id": "avatar-pull-1",
  "ok": true,
  "payload": {
    "sessionKey": "main",
    "events": [
      {
        "eventId": "evt_call_xxx_...",
        "sessionKey": "main",
        "ts": 1737264001000,
        "source": "tool",
        "emotion": "happy",
        "action": "wave",
        "intensity": 0.8,
        "durationMs": 1200,
        "text": "任务完成"
      }
    ],
    "pendingEvents": 0
  }
}
```

## 6. 查询状态与断开

状态：

```json
{
  "type": "req",
  "id": "avatar-status-1",
  "method": "avatar.status",
  "params": { "sessionKey": "main" }
}
```

断开：

```json
{
  "type": "req",
  "id": "avatar-goodbye-1",
  "method": "avatar.goodbye",
  "params": {
    "sessionKey": "main",
    "connectionId": "frontend-conn-001"
  }
}
```

## 7. 端到端联调步骤

1. 前端连 Gateway，完成 `connect`。
2. 调 `avatar.hello`，确认收到 `avatar.helloAck`。
3. 开始轮询 `avatar.pull`（空数组是正常）。
4. 触发一次 Agent 回复（例如让 Agent 明确调用 `avatar_express`）。
5. 在 `avatar.pull` 中收到事件后，驱动你的动画状态机。

## 8. 前端建议

1. `sessionKey` 作为路由键，不同会话分开渲染。
2. `eventId` 去重，避免重放抖动。
3. 没有事件时保持当前动画或回落 `idle`。
4. 前端不认识的 `emotion/action` 直接忽略，按你本地 fallback 渲染。
5. 连接恢复后重新发一次 `avatar.hello`（能力重协商）。

## 9. 常见问题

1. `missing scope`：token 权限不足，补齐对应 operator scopes。
2. `unknown method: avatar.hello`：插件未启用或 Gateway 未重启。
3. `accepted=false, reason=avatar_unavailable`：还没完成 `avatar.hello` 握手，或握手已被清理。

## 10. Electron 推荐：Pairing（设备 token）模式

对于 Electron 桌面端，建议用“设备 token”长期连接，而不是每次手填共享 token。

核心思路：

1. 首次连接：用一次共享 token（bootstrap）。
2. `connect` 成功后，从 `hello-ok.auth.deviceToken` 读取设备 token。
3. 把设备 token 存入系统 Keychain（如 `keytar`）。
4. 后续连接都用设备 token（不再要求用户输入共享 token）。

### 10.1 首次 bootstrap token（只需一次）

在 Gateway 主机上获取共享 token：

```bash
openclaw config get gateway.auth.token
```

若为空，可生成：

```bash
openclaw doctor --generate-gateway-token
```

### 10.2 连接时必须包含 device 身份

`connect` 时建议始终带 `device`：

```json
{
  "type": "req",
  "id": "connect-1",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": {
      "id": "webchat-ui",
      "displayName": "avatar-electron",
      "version": "0.1.0",
      "platform": "desktop",
      "mode": "ui"
    },
    "role": "operator",
    "scopes": ["operator.read"],
    "auth": { "token": "<BOOTSTRAP_OR_DEVICE_TOKEN>" },
    "device": {
      "id": "<stable-device-id>",
      "publicKey": "<device-public-key>",
      "signature": "<signature-of-challenge-nonce>",
      "signedAt": 1737264000000,
      "nonce": "<connect.challenge.payload.nonce>"
    }
  }
}
```

> 非本机直连时，`connect.challenge` 的签名是必须项。  
> 详情见 Gateway Protocol 文档的 Handshake/Auth/Device identity 小节。

### 10.3 从 `hello-ok` 提取并持久化 device token

首次成功连接后，读取：

```json
{
  "payload": {
    "auth": {
      "deviceToken": "..."
    }
  }
}
```

将该 `deviceToken` 持久化到 Keychain，后续连接优先使用它。

### 10.4 是否每次都要手动输入

不需要。Pairing 模式下的推荐策略：

1. 首次输入一次 token。
2. 成功后切换并保存 device token。
3. 后续自动连接使用 device token。

### 10.5 token 会不会自动变化

共享 token 默认不会自动变化；device token 也不会自动频繁变化，除非被轮换或撤销。

### 10.6 何时需要重新 bootstrap

1. 设备 token 被 rotate/revoke。
2. 你切到另一台 Gateway。
3. 网关端清理了该设备配对状态。

### 10.7 安全建议

1. 不要把共享 token 硬编码进前端源码。
2. device token 存系统 Keychain，不落盘明文。
3. 鉴权失败时只弹一次 re-pair 流程，避免无限重试。
