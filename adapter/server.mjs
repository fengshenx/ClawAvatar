/**
 * Avatar Channel Adapter（最小可行）
 * 监听 WebSocket，按顺序回放 typing → thinking → speaking，供前端联调与演示
 * 运行：npm run adapter 或 node adapter/server.mjs
 */

import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.ADAPTER_PORT) || 8765;
const PATH = process.env.ADAPTER_PATH || '/avatar';

const SESSION_ID = 'demo';

/** 发送 agent_state */
function sendAgentState(ws, state, detail = null, progress = null) {
  if (ws.readyState !== 1) return; // OPEN
  ws.send(
    JSON.stringify({
      type: 'agent_state',
      session_id: SESSION_ID,
      state,
      detail,
      progress,
    })
  );
}

/** 发送 render（可选） */
function sendRender(ws, state, emotion = 'neutral', intensity = 0.8) {
  if (ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      type: 'render',
      session_id: SESSION_ID,
      state,
      emotion,
      intensity,
    })
  );
}

/** 回放脚本：typing → thinking → speaking，循环 */
function runPlayback(ws) {
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
    sendAgentState(ws, step.state);
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
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`[Adapter] WebSocket 监听 ws://localhost:${PORT}${PATH}`);
});

wss.on('connection', (ws, req) => {
  console.log('[Adapter] 客户端连接', req.socket.remoteAddress);
  runPlayback(ws);
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'start_playback') {
        runPlayback(ws);
      }
    } catch {
      // ignore
    }
  });
  ws.on('close', () => {
    console.log('[Adapter] 客户端断开');
  });
});
