/**
 * Avatar Channel Adapter WebSocket 客户端（V4：OpenClaw Channel 客户端）
 * 连接 Adapter、携带 token、接收 init(session_id)、解析 agent_state/render、发送 user_input，支持断线重连
 */

import { getContextApp } from '@/config';
import type { InitMessage, ProtocolMessage, UserInputMessage } from '@/protocol/types';
import {
  isAgentStateMessage,
  isRenderMessage,
} from '@/protocol/types';

export type AvatarWsStatus =
  | 'idle'       // 未连接
  | 'connecting' // 连接中
  | 'connected'  // 已连接
  | 'error'      // 连接错误 / 解析错误
  | 'reconnecting'; // 断线重连中

export interface AvatarWsCallbacks {
  onStatus: (status: AvatarWsStatus, error?: string) => void;
  onMessage: (message: ProtocolMessage) => void;
  /** V4：Adapter 下发 session_id 时回调 */
  onSessionId?: (sessionId: string) => void;
}

export interface AvatarWsClientOptions {
  /** V4：鉴权 token，连接时拼到 URL query */
  getToken?: () => Promise<string | null>;
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 15000;
const DEFAULT_LOCALE = 'zh-CN';

function appendTokenToUrl(url: string, token: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

function parseIncoming(data: string): ProtocolMessage | InitMessage | null {
  try {
    const raw = JSON.parse(data) as unknown;
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return null;
    const t = (raw as { type: string }).type;
    if (t === 'init') {
      const init = raw as InitMessage;
      return typeof init.session_id === 'string' ? init : null;
    }
    const msg = raw as ProtocolMessage;
    if (isAgentStateMessage(msg) || isRenderMessage(msg)) return msg;
    return null;
  } catch {
    return null;
  }
}

export function createAvatarWsClient(
  url: string,
  callbacks: AvatarWsCallbacks,
  options?: AvatarWsClientOptions
) {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = RECONNECT_DELAY_MS;
  let intentionalClose = false;
  let sessionId = '';
  let resolvedUrl = url;

  function close() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      ws = null;
    }
    callbacks.onStatus('idle');
  }

  async function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;
    intentionalClose = false;
    callbacks.onStatus('connecting');
    try {
      if (options?.getToken) {
        const token = await options.getToken();
        resolvedUrl = token ? appendTokenToUrl(url, token) : url;
      } else {
        resolvedUrl = url;
      }
      ws = new WebSocket(resolvedUrl);
    } catch (e) {
      callbacks.onStatus('error', e instanceof Error ? e.message : String(e));
      return;
    }

    ws.onopen = () => {
      reconnectDelay = RECONNECT_DELAY_MS;
      callbacks.onStatus('connected');
    };

    ws.onmessage = (event) => {
      const text =
        typeof event.data === 'string'
          ? event.data
          : event.data instanceof Blob
            ? null
            : null;
      if (text === null) return;
      const parsed = parseIncoming(text);
      if (!parsed) return;
      if (parsed.type === 'init') {
        sessionId = parsed.session_id;
        callbacks.onSessionId?.(parsed.session_id);
        return;
      }
      callbacks.onMessage(parsed);
    };

    ws.onerror = () => {
      callbacks.onStatus('error', 'WebSocket 错误');
    };

    ws.onclose = () => {
      ws = null;
      if (intentionalClose) {
        callbacks.onStatus('idle');
        return;
      }
      callbacks.onStatus('reconnecting');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
        reconnectDelay = Math.min(
          reconnectDelay + RECONNECT_DELAY_MS,
          MAX_RECONNECT_DELAY_MS
        );
      }, reconnectDelay);
    };
  }

  function sendUserInput(text: string) {
    if (!text.trim()) return;
    const payload: UserInputMessage = {
      type: 'user_input',
      session_id: sessionId,
      text: text.trim(),
      context: { app: getContextApp(), locale: DEFAULT_LOCALE },
    };
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function getSessionId(): string {
    return sessionId;
  }

  return { connect, disconnect: close, sendUserInput, getSessionId };
}
