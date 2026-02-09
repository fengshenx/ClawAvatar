import fs from 'fs/promises';
import path from 'path';
import crypto, { randomUUID } from 'crypto';
import { safeStorage } from 'electron';
import { WebSocket } from 'ws';

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789';
//const DEFAULT_SESSION_KEY = 'main';
const DEFAULT_SESSION_KEY = 'agent:dev:main';
const DEFAULT_AVATAR_ID = 'avt_fox_v1';
const DEFAULT_PROTOCOL_VERSION = '1.0';
const PULL_INTERVAL_MS = 150;
const PULL_MAX = 20;
const MAX_SEEN_EVENT_IDS = 1000;
const CONNECT_NONCE_WAIT_MS = 350;
const DEFAULT_CLIENT_ID = 'webchat-ui';
const DEFAULT_CLIENT_MODE = 'ui';
const DEFAULT_ROLE = 'operator';
const DEFAULT_SCOPES = ['operator.admin'];
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

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

function extractDeviceToken(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const direct = payload?.auth?.deviceToken;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = payload?.helloOk?.auth?.deviceToken;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return null;
}

function base64UrlEncode(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function splitScopes(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_SCOPES;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_SCOPES;
}

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function originFromGatewayUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol === 'ws:') return `http://${parsed.host}`;
    if (parsed.protocol === 'wss:') return `https://${parsed.host}`;
    return null;
  } catch {
    return null;
  }
}

function buildDeviceAuthPayload({
  deviceId,
  clientId,
  clientMode,
  role,
  scopes,
  signedAtMs,
  token,
  nonce,
}) {
  const hasNonce = typeof nonce === 'string' && nonce.trim().length > 0;
  const version = hasNonce ? 'v2' : 'v1';
  const base = [
    version,
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token ?? '',
  ];
  if (hasNonce) base.push(nonce.trim());
  return base.join('|');
}

function derivePublicKeyRaw(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' });
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function deriveDeviceIdFromPublicKeyPem(publicKeyPem) {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export class AvatarPluginClient {
  constructor({ app, onEvent, onStatus }) {
    this.app = app;
    this.onEvent = onEvent;
    this.onStatus = onStatus;

    this.gatewayUrl = process.env.AVATAR_GATEWAY_WS_URL || DEFAULT_GATEWAY_URL;
    this.sessionKey = process.env.AVATAR_SESSION_KEY || DEFAULT_SESSION_KEY;
    this.avatarId = process.env.AVATAR_ID || DEFAULT_AVATAR_ID;
    this.connectionId = `frontend-${randomUUID().slice(0, 8)}`;
    this.clientId = process.env.AVATAR_GATEWAY_CLIENT_ID || DEFAULT_CLIENT_ID;
    this.clientMode = process.env.AVATAR_GATEWAY_CLIENT_MODE || DEFAULT_CLIENT_MODE;
    this.role = process.env.AVATAR_GATEWAY_ROLE || DEFAULT_ROLE;
    this.scopes = splitScopes(process.env.AVATAR_GATEWAY_SCOPES);
    this.minProtocol = parsePositiveInt(process.env.AVATAR_GATEWAY_MIN_PROTOCOL, 1);
    this.maxProtocol = parsePositiveInt(process.env.AVATAR_GATEWAY_MAX_PROTOCOL, 16);
    if (this.maxProtocol < this.minProtocol) this.maxProtocol = this.minProtocol;

    this.capabilities = DEFAULT_CAPABILITIES;
    this.pairingFile = path.join(this.app.getPath('userData'), 'avatar-pairing.json');
    this.deviceIdentityFile = path.join(this.app.getPath('userData'), 'avatar-device-identity.json');
    this.deviceIdentity = null;

    this.ws = null;
    this.pullTimer = null;
    this.pullInFlight = false;
    this.seq = 1;
    this.pending = new Map();
    this.connectPromise = null;
    this.gatewayConnected = false;
    this.intentionalClose = false;
    this.connectNonce = null;
    this.seenEventIds = [];
    this.seenEventSet = new Set();

    this.state = {
      phase: 'idle',
      paired: false,
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

  async readPairing() {
    try {
      const raw = await fs.readFile(this.pairingFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      let deviceToken = null;
      if (parsed.encrypted === true && typeof parsed.deviceToken === 'string') {
        if (safeStorage.isEncryptionAvailable()) {
          const decrypted = safeStorage.decryptString(
            Buffer.from(parsed.deviceToken, 'base64')
          );
          deviceToken = decrypted.trim();
        }
      } else if (typeof parsed.deviceToken === 'string') {
        deviceToken = parsed.deviceToken.trim();
      }
      if (!deviceToken) return null;
      return {
        deviceToken,
        gatewayUrl: typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : this.gatewayUrl,
      };
    } catch {
      return null;
    }
  }

  async savePairing(deviceToken) {
    const encrypted =
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(deviceToken).toString('base64')
        : deviceToken;
    const payload = {
      encrypted: safeStorage.isEncryptionAvailable(),
      deviceToken: encrypted,
      gatewayUrl: this.gatewayUrl,
      updatedAt: Date.now(),
    };
    await fs.mkdir(path.dirname(this.pairingFile), { recursive: true });
    await fs.writeFile(this.pairingFile, JSON.stringify(payload, null, 2), 'utf8');
    this.state.paired = true;
    this.emitStatus();
  }

  async clearPairing() {
    try {
      await fs.unlink(this.pairingFile);
    } catch {
      // ignore
    }
    this.state.paired = false;
    this.emitStatus();
  }

  async loadOrCreateDeviceIdentity() {
    if (this.deviceIdentity) return this.deviceIdentity;
    try {
      const raw = await fs.readFile(this.deviceIdentityFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyPem === 'string' &&
        typeof parsed.privateKeyPem === 'string'
      ) {
        this.deviceIdentity = parsed;
        return parsed;
      }
    } catch {
      // ignore
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const identity = {
      version: 1,
      deviceId: deriveDeviceIdFromPublicKeyPem(publicKeyPem),
      publicKeyPem,
      privateKeyPem,
      createdAtMs: Date.now(),
    };
    await fs.mkdir(path.dirname(this.deviceIdentityFile), { recursive: true });
    await fs.writeFile(this.deviceIdentityFile, JSON.stringify(identity, null, 2), 'utf8');
    this.deviceIdentity = identity;
    return identity;
  }

  buildSignedDevice(authToken) {
    if (!this.deviceIdentity) return undefined;
    const signedAtMs = Date.now();
    const nonce = this.connectNonce ?? undefined;
    const payload = buildDeviceAuthPayload({
      deviceId: this.deviceIdentity.deviceId,
      clientId: this.clientId,
      clientMode: this.clientMode,
      role: this.role,
      scopes: this.scopes,
      signedAtMs,
      token: authToken ?? null,
      nonce,
    });
    const key = crypto.createPrivateKey(this.deviceIdentity.privateKeyPem);
    const signature = base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
    return {
      id: this.deviceIdentity.deviceId,
      publicKey: publicKeyRawBase64UrlFromPem(this.deviceIdentity.publicKeyPem),
      signature,
      signedAt: signedAtMs,
      nonce,
    };
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
    if (method !== 'connect' && !this.gatewayConnected) {
      return Promise.reject(new Error('Gateway 握手未完成'));
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
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce = msg?.payload?.nonce;
      if (typeof nonce === 'string' && nonce.trim()) {
        this.connectNonce = nonce.trim();
      }
      return;
    }
    if (msg.type !== 'res' || typeof msg.id !== 'string') return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.ok === true) {
      pending.resolve(msg.payload ?? null);
    } else {
      const reason =
        typeof msg.error?.message === 'string'
          ? msg.error.message
          : typeof msg.error === 'string'
            ? msg.error
          : typeof msg.payload?.reason === 'string'
            ? msg.payload.reason
            : '请求失败';
      const err = new Error(reason);
      if (msg.error && typeof msg.error === 'object') {
        err.code = typeof msg.error.code === 'string' ? msg.error.code : undefined;
        err.details = msg.error.details;
      }
      pending.reject(err);
    }
  }

  async waitConnectChallenge() {
    const startedAt = Date.now();
    while (!this.connectNonce && Date.now() - startedAt < CONNECT_NONCE_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async openSocket(token, options = {}) {
    const useDevice = options.useDevice === true;
    await this.disconnect();

    this.state.phase = 'connecting';
    this.state.lastError = null;
    this.gatewayConnected = false;
    this.emitStatus();

    const origin =
      process.env.AVATAR_GATEWAY_ORIGIN ||
      process.env.OPENCLAW_GATEWAY_ORIGIN ||
      originFromGatewayUrl(this.gatewayUrl) ||
      undefined;
    const ws = origin
      ? new WebSocket(this.gatewayUrl, { origin })
      : new WebSocket(this.gatewayUrl);
    this.ws = ws;
    this.intentionalClose = false;
    this.connectNonce = null;
    // Avoid handshake race: the socket may open before async identity loading finishes.
    const deviceIdentityPromise = this.loadOrCreateDeviceIdentity()
      .then((identity) => {
        this.deviceIdentity = identity;
        return identity;
      })
      .catch(() => null);

    let connectSent = false;
    let connectFallbackTimer = null;
    let connectResolve = null;
    let connectReject = null;

    const connectResultPromise = new Promise((resolve, reject) => {
      connectResolve = resolve;
      connectReject = reject;
    });

    const sendConnectOnce = async (nonce) => {
      if (connectSent) return;
      connectSent = true;
      if (connectFallbackTimer) {
        clearTimeout(connectFallbackTimer);
        connectFallbackTimer = null;
      }
      if (useDevice && !this.deviceIdentity) {
        await deviceIdentityPromise;
      }
      void this
        .sendReq('connect', {
          minProtocol: this.minProtocol,
          maxProtocol: this.maxProtocol,
          client: {
            id: this.clientId,
            displayName: 'avatar-electron',
            version: this.app.getVersion?.() || '0.1.0',
            platform: process.platform,
            mode: this.clientMode,
          },
          role: this.role,
          scopes: this.scopes,
          caps: [],
          auth: { token },
          // 先连通：默认不带 device（可通过 options.useDevice 显式开启）
          device: useDevice ? this.buildSignedDevice(token) : undefined,
        })
        .then((payload) => connectResolve?.(payload))
        .catch((err) => connectReject?.(err));
    };

    ws.on('message', (data) => {
      let parsed = null;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        parsed = null;
      }
      if (parsed?.type === 'event' && parsed?.event === 'connect.challenge') {
        const nonce = parsed?.payload?.nonce;
        if (typeof nonce === 'string' && nonce.trim()) {
          this.connectNonce = nonce.trim();
          sendConnectOnce(this.connectNonce);
        } else {
          sendConnectOnce(undefined);
        }
        return;
      }
      this.handleIncoming(data);
    });

    ws.on('open', () => {
      // First frame must be connect; on loopback nonce is optional.
      void sendConnectOnce(undefined);
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
        this.setError('Gateway 连接已断开');
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
    connectFallbackTimer = setTimeout(() => {
      void sendConnectOnce(undefined);
    }, 200);

    const connectPayload = await connectResultPromise;

    const deviceToken = extractDeviceToken(connectPayload);
    if (deviceToken) {
      await this.savePairing(deviceToken);
    }

    this.gatewayConnected = true;
    await this.sendHello();
    this.startPullLoop();
    this.state.phase = 'connected';
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
    const paired = await this.readPairing();
    if (paired?.deviceToken) {
      this.state.paired = true;
      this.emitStatus();
      try {
        await this.openSocket(paired.deviceToken, { useDevice: true });
        return this.getStatus();
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes('protocol mismatch') &&
          typeof err.details?.expectedProtocol === 'number'
        ) {
          const expected = err.details.expectedProtocol;
          this.minProtocol = expected;
          this.maxProtocol = expected;
          await this.openSocket(paired.deviceToken, { useDevice: true });
          return this.getStatus();
        }
        this.state.lastError =
          err instanceof Error ? err.message : 'deviceToken 连接失败，尝试 bootstrap';
        this.emitStatus();
      }
    }

    const bootstrap = process.env.AVATAR_TOKEN || process.env.GATEWAY_TOKEN || null;
    if (bootstrap) {
      // 首次引导：允许不带 device 先连通，成功后若返回 deviceToken 会自动保存
      try {
        await this.openSocket(bootstrap, { useDevice: false });
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes('protocol mismatch') &&
          typeof err.details?.expectedProtocol === 'number'
        ) {
          const expected = err.details.expectedProtocol;
          this.minProtocol = expected;
          this.maxProtocol = expected;
          await this.openSocket(bootstrap, { useDevice: false });
        } else {
          throw err;
        }
      }
      return this.getStatus();
    }

    this.state.phase = 'idle';
    this.state.paired = false;
    this.state.lastError =
      '未发现可用凭证。首次请在主进程环境变量设置 AVATAR_TOKEN（或 GATEWAY_TOKEN）完成引导。';
    this.emitStatus();
    return this.getStatus();
  }

  async disconnect() {
    if (this.connectPromise) {
      // Let in-flight connect resolve/reject naturally; avoid racing teardown.
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
