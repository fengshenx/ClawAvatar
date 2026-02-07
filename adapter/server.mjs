/**
 * Avatar Channel Adapter（V4：OpenClaw Channel 对接）
 * 鉴权（可选 token）、连接后下发 init(session_id)、处理 user_input 并模拟 Agent 响应
 * 运行：npm run adapter 或 node adapter/server.mjs
 */

import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.ADAPTER_PORT) || 8765;
const PATH = process.env.ADAPTER_PATH || '/avatar';
/** 若设置，则只接受 query 中 token 等于此值的连接（否则不校验） */
const AUTH_TOKEN = process.env.AVATAR_TOKEN || process.env.ADAPTER_TOKEN || null;

function nextSessionId() {
  return 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/** 发送 agent_state */
function sendAgentState(ws, sessionId, state, detail = null, progress = null) {
  if (ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      type: 'agent_state',
      session_id: sessionId,
      state,
      detail,
      progress,
    })
  );
}

/** 发送 render */
function sendRender(ws, sessionId, state, emotion = 'neutral', intensity = 0.8) {
  if (ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      type: 'render',
      session_id: sessionId,
      state,
      emotion,
      intensity,
    })
  );
}

/** 发送 init（V4：连接后下发 session_id） */
function sendInit(ws, sessionId) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'init', session_id: sessionId }));
}

/** 收到 user_input 后模拟 Agent 响应：thinking → speaking → idle */
function simulateAgentResponse(ws, sessionId) {
  if (ws.readyState !== 1) return;
  sendAgentState(ws, sessionId, 'thinking', 'planning', null);
  sendRender(ws, sessionId, 'thinking', 'neutral', 0.8);
  setTimeout(() => {
    if (ws.readyState !== 1) return;
    sendAgentState(ws, sessionId, 'speaking');
    sendRender(ws, sessionId, 'speaking', 'happy', 0.85);
    setTimeout(() => {
      if (ws.readyState !== 1) return;
      sendAgentState(ws, sessionId, 'idle');
      sendRender(ws, sessionId, 'idle', 'neutral', 0.8);
    }, 2500);
  }, 1500);
}

/** 旧版回放脚本（无 session 时兼容） */
function runPlayback(ws, sessionId) {
  const steps = [
    { state: 'typing', delayMs: 2000 },
    { state: 'thinking', delayMs: 3000 },
    { state: 'speaking', delayMs: 5000 },
    { state: 'idle', delayMs: 2000 },
  ];
  let index = 0;
  function next() {
    if (ws.readyState !== 1) return;
    const step = steps[index % steps.length];
    sendAgentState(ws, sessionId, step.state);
    index += 1;
    setTimeout(next, step.delayMs);
  }
  next();
}

const server = http.createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '', `http://${req.headers.host}`).pathname;
  if (pathname !== PATH) {
    socket.destroy();
    return;
  }
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (AUTH_TOKEN != null && token !== AUTH_TOKEN) {
    console.log('[Adapter] 鉴权失败：token 不匹配或缺失');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`[Adapter] WebSocket 监听 ws://localhost:${PORT}${PATH}`);
  if (AUTH_TOKEN) console.log('[Adapter] 已启用 token 鉴权');
});

wss.on('connection', (ws, req) => {
  const sessionId = nextSessionId();
  console.log('[Adapter] 客户端连接', req.socket.remoteAddress, 'session:', sessionId);
  sendInit(ws, sessionId);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'user_input') {
        console.log('[Adapter] user_input', msg.session_id, msg.text?.slice(0, 60));
        simulateAgentResponse(ws, sessionId);
      } else if (msg.type === 'start_playback') {
        runPlayback(ws, sessionId);
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    console.log('[Adapter] 客户端断开', sessionId);
  });
});
