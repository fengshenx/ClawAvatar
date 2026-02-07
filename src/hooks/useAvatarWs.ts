/**
 * WebSocket 连接 Avatar Channel Adapter（V4：OpenClaw Channel 客户端）
 * 将收到的 agent_state / render 应用到状态机，支持发送 user_input、接收 session_id
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/app/state';
import { getAvatarToken, getAvatarWsUrl } from '@/config';
import {
  createAvatarWsClient,
  type AvatarWsStatus,
} from '@/ws/avatarClient';

export interface UseAvatarWsResult {
  status: AvatarWsStatus;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  sendUserInput: (text: string) => void;
  sessionId: string;
  wsUrl: string;
}

export function useAvatarWs(): UseAvatarWsResult {
  const [status, setStatus] = useState<AvatarWsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const applyMessage = useAppStore((s) => s.applyMessage);
  const clientRef = useRef<ReturnType<typeof createAvatarWsClient> | null>(null);
  const wsUrl = getAvatarWsUrl();

  useEffect(() => {
    const client = createAvatarWsClient(
      wsUrl,
      {
        onStatus: (next, err) => {
          setStatus(next);
          setError(err ?? null);
        },
        onMessage: (msg) => applyMessage(msg),
        onSessionId: (id) => setSessionId(id),
      },
      { getToken: getAvatarToken }
    );
    clientRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      clientRef.current = null;
      setSessionId('');
    };
  }, [wsUrl, applyMessage]);

  const connect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.connect();
    } else {
      const client = createAvatarWsClient(
        wsUrl,
        {
          onStatus: (next, err) => {
            setStatus(next);
            setError(err ?? null);
          },
          onMessage: (msg) => applyMessage(msg),
          onSessionId: (id) => setSessionId(id),
        },
        { getToken: getAvatarToken }
      );
      clientRef.current = client;
      client.connect();
    }
  }, [wsUrl, applyMessage]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const sendUserInput = useCallback((text: string) => {
    clientRef.current?.sendUserInput(text);
  }, []);

  return {
    status,
    error,
    connect,
    disconnect,
    sendUserInput,
    sessionId,
    wsUrl,
  };
}
