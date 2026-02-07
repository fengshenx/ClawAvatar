/**
 * Avatar Channel Adapter WebSocket 客户端
 * 连接 Adapter、解析 agent_state / render、驱动状态机，支持断线重连
 */

import type { ProtocolMessage } from '@/protocol/types';
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
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 15000;

function parseMessage(data: string): ProtocolMessage | null {
  try {
    const raw = JSON.parse(data) as unknown;
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return null;
    const msg = raw as ProtocolMessage;
    if (isAgentStateMessage(msg) || isRenderMessage(msg)) return msg;
    return null;
  } catch {
    return null;
  }
}

export function createAvatarWsClient(
  url: string,
  callbacks: AvatarWsCallbacks
) {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = RECONNECT_DELAY_MS;
  let intentionalClose = false;

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

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;
    intentionalClose = false;
    callbacks.onStatus('connecting');
    try {
      ws = new WebSocket(url);
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
      const msg = parseMessage(text);
      if (msg) callbacks.onMessage(msg);
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

  return { connect, disconnect: close };
}
