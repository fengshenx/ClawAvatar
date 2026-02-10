import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18802/extension';
const DEFAULT_SESSION_KEY = 'main';
const DEFAULT_AVATAR_ID = 'avt_fox_v1';
const DEFAULT_PROTOCOL_VERSION = '1.0';
const PULL_INTERVAL_MS = 150;
const PULL_MAX = 20;
const MAX_SEEN_EVENT_IDS = 1000;

const DEFAULT_CAPABILITIES = {
  emotions: ['neutral', 'happy', 'sad', 'sorry', 'confused'],
  actions: ['thinking', 'talking', 'wave', 'nod', 'settle', 'idle_recover'],
  viseme: { supported: true, mode: 'auto' },
  fallback: {
    talking_fast: 'talking',
    error_pose: 'idle_recover',
  },
};

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  const uniq = new Set();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (value) uniq.add(value);
  }
  return Array.from(uniq);
}

function normalizeCapabilities(input) {
  if (!input || typeof input !== 'object') return DEFAULT_CAPABILITIES;
  const merged = {
    ...DEFAULT_CAPABILITIES,
    ...input,
    fallback: {
      ...DEFAULT_CAPABILITIES.fallback,
      ...(input.fallback && typeof input.fallback === 'object' ? input.fallback : {}),
    },
    viseme:
      input.viseme && typeof input.viseme === 'object'
        ? {
            supported: Boolean(input.viseme.supported),
            mode: typeof input.viseme.mode === 'string' ? input.viseme.mode : 'auto',
          }
        : DEFAULT_CAPABILITIES.viseme,
  };

  const emotions = normalizeList(merged.emotions);
  const actions = normalizeList(merged.actions);

  return {
    ...merged,
    emotions: emotions.length > 0 ? emotions : DEFAULT_CAPABILITIES.emotions,
    actions: actions.length > 0 ? actions : DEFAULT_CAPABILITIES.actions,
  };
}

function normalizeGatewayUrl(raw) {
  const fallback = new URL(DEFAULT_GATEWAY_URL);
  if (typeof raw !== 'string' || !raw.trim()) {
    return fallback.toString();
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return fallback.toString();
  }

  if (parsed.protocol !== 'ws:') {
    return fallback.toString();
  }
  if (parsed.hostname !== '127.0.0.1') {
    return fallback.toString();
  }

  const port = Number(parsed.port || fallback.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return fallback.toString();
  }

  return `ws://127.0.0.1:${port}/extension`;
}

export class AvatarPluginClient {
  constructor({ app, onEvent, onStatus }) {
    this.app = app;
    this.onEvent = onEvent;
    this.onStatus = onStatus;

    this.gatewayUrl = normalizeGatewayUrl(
      process.env.AVATAR_GATEWAY_WS_URL || process.env.AVATAR_EXTENSION_WS_URL || DEFAULT_GATEWAY_URL
    );
    this.sessionKey = process.env.AVATAR_SESSION_KEY || DEFAULT_SESSION_KEY;
    this.avatarId = process.env.AVATAR_ID || DEFAULT_AVATAR_ID;
    this.connectionId = `frontend-${randomUUID().slice(0, 8)}`;

    this.capabilities = DEFAULT_CAPABILITIES;

    this.ws = null;
    this.pullTimer = null;
    this.pullInFlight = false;
    this.seq = 1;
    this.pending = new Map();
    this.connectPromise = null;
    this.gatewayConnected = false;
    this.intentionalClose = false;
    this.seenEventIds = [];
    this.seenEventSet = new Set();

    this.state = {
      phase: 'idle',
      paired: true,
      lastError: null,
      gatewayUrl: this.gatewayUrl,
      sessionKey: this.sessionKey,
      avatarId: this.avatarId,
      connectionId: this.connectionId,
    };

    this.emitStatus();
  }

  getCapabilities() {
    return this.capabilities;
  }

  getStatus() {
    return {
      ...this.state,
      capabilities: this.capabilities,
    };
  }

  emitStatus() {
    this.onStatus?.(this.getStatus());
  }

  setError(message) {
    this.state.lastError = message;
    this.state.phase = 'error';
    this.emitStatus();
  }

  setGatewayUrl(nextUrl) {
    const normalized = normalizeGatewayUrl(nextUrl);
    this.gatewayUrl = normalized;
    this.state.gatewayUrl = normalized;
    this.state.lastError = null;
    this.emitStatus();
    return this.getStatus();
  }

  setCapabilities(next) {
    this.capabilities = normalizeCapabilities(next);
    this.emitStatus();
    if (this.ws?.readyState === WebSocket.OPEN && this.gatewayConnected) {
      return this.sendHello();
    }
    return Promise.resolve();
  }

  sendReq(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Gateway WS 未连接'));
    }
    if (!this.gatewayConnected && method !== 'avatar.hello') {
      return Promise.reject(new Error('Avatar 握手未完成'));
    }

    const id = `${method}-${this.seq++}`;
    const frame = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 8000);

      this.pending.set(id, {
        resolve: (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      try {
        this.ws.send(JSON.stringify(frame));
      } catch (e) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  handleIncoming(raw) {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type !== 'res' || typeof msg.id !== 'string') return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.ok === true) {
      pending.resolve(msg.payload ?? null);
      return;
    }

    const reason =
      typeof msg.error?.message === 'string'
        ? msg.error.message
        : typeof msg.error === 'string'
          ? msg.error
          : typeof msg.payload?.reason === 'string'
            ? msg.payload.reason
            : '请求失败';
    pending.reject(new Error(reason));
  }

  async openSocket() {
    await this.disconnect();

    this.state.phase = 'connecting';
    this.state.lastError = null;
    this.gatewayConnected = false;
    this.emitStatus();

    const ws = new WebSocket(this.gatewayUrl);
    this.ws = ws;
    this.intentionalClose = false;

    ws.on('message', (data) => {
      this.handleIncoming(data);
    });

    ws.on('close', () => {
      this.ws = null;
      this.gatewayConnected = false;
      this.stopPullLoop();
      for (const waiter of this.pending.values()) {
        waiter.reject(new Error('连接已关闭'));
      }
      this.pending.clear();
      if (!this.intentionalClose) {
        this.setError('Avatar 扩展连接已断开');
      }
    });

    ws.on('error', (e) => {
      const message = e instanceof Error ? e.message : 'WebSocket 错误';
      this.setError(message);
    });

    if (ws.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', (e) => reject(e instanceof Error ? e : new Error(String(e))));
      });
    }

    await this.sendHello();
    this.gatewayConnected = true;
    this.startPullLoop();
    this.state.phase = 'connected';
    this.state.paired = true;
    this.state.lastError = null;
    this.emitStatus();
  }

  async sendHello() {
    await this.sendReq('avatar.hello', {
      sessionKey: this.sessionKey,
      connectionId: this.connectionId,
      avatarId: this.avatarId,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      capabilities: this.capabilities,
    });
  }

  rememberEvent(eventId) {
    if (!eventId) return;
    if (this.seenEventSet.has(eventId)) return;
    this.seenEventSet.add(eventId);
    this.seenEventIds.push(eventId);
    if (this.seenEventIds.length <= MAX_SEEN_EVENT_IDS) return;
    const dropped = this.seenEventIds.shift();
    if (dropped) this.seenEventSet.delete(dropped);
  }

  startPullLoop() {
    this.stopPullLoop();
    this.pullTimer = setInterval(async () => {
      if (this.pullInFlight) return;
      this.pullInFlight = true;
      try {
        const payload = await this.sendReq('avatar.pull', {
          sessionKey: this.sessionKey,
          max: PULL_MAX,
        });
        const events = Array.isArray(payload?.events) ? payload.events : [];
        for (const event of events) {
          if (!event || typeof event !== 'object') continue;
          if (typeof event.eventId === 'string' && this.seenEventSet.has(event.eventId)) {
            continue;
          }
          if (typeof event.eventId === 'string') this.rememberEvent(event.eventId);
          this.onEvent?.(event);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.state.lastError = message;
        this.emitStatus();
      } finally {
        this.pullInFlight = false;
      }
    }, PULL_INTERVAL_MS);
  }

  stopPullLoop() {
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
    this.pullInFlight = false;
  }

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN && this.gatewayConnected) {
      return this.getStatus();
    }
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectOnce();
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async connectOnce() {
    if (this.ws?.readyState === WebSocket.OPEN && this.gatewayConnected) {
      this.state.phase = 'connected';
      this.state.lastError = null;
      this.emitStatus();
      return this.getStatus();
    }

    await this.openSocket();
    return this.getStatus();
  }

  async clearPairing() {
    this.state.paired = true;
    this.state.lastError = null;
    this.emitStatus();
    return this.getStatus();
  }

  async disconnect() {
    if (this.connectPromise) {
      this.connectPromise = null;
    }
    this.stopPullLoop();
    this.gatewayConnected = false;
    const ws = this.ws;

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        await this.sendReq('avatar.goodbye', {
          sessionKey: this.sessionKey,
          connectionId: this.connectionId,
        });
      } catch {
        // ignore
      }
    }

    this.intentionalClose = true;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners('message');
      ws.removeAllListeners('close');
      ws.removeAllListeners('error');
      ws.removeAllListeners('open');
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING)) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }

    for (const waiter of this.pending.values()) {
      waiter.reject(new Error('连接已关闭'));
    }
    this.pending.clear();

    this.state.phase = 'idle';
    this.emitStatus();
  }
}
