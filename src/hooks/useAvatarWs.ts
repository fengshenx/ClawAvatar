/**
 * WebSocket 连接 Avatar Channel Adapter，将收到的 agent_state / render 应用到状态机
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/app/state';
import { getAvatarWsUrl } from '@/config';
import {
  createAvatarWsClient,
  type AvatarWsStatus,
} from '@/ws/avatarClient';

export interface UseAvatarWsResult {
  status: AvatarWsStatus;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  wsUrl: string;
}

export function useAvatarWs(): UseAvatarWsResult {
  const [status, setStatus] = useState<AvatarWsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const applyMessage = useAppStore((s) => s.applyMessage);
  const clientRef = useRef<ReturnType<typeof createAvatarWsClient> | null>(null);
  const wsUrl = getAvatarWsUrl();

  useEffect(() => {
    const client = createAvatarWsClient(wsUrl, {
      onStatus: (next, err) => {
        setStatus(next);
        setError(err ?? null);
      },
      onMessage: (msg) => applyMessage(msg),
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [wsUrl, applyMessage]);

  const connect = () => {
    if (clientRef.current) clientRef.current.connect();
    else {
      const client = createAvatarWsClient(wsUrl, {
        onStatus: (next, err) => {
          setStatus(next);
          setError(err ?? null);
        },
        onMessage: (msg) => applyMessage(msg),
      });
      clientRef.current = client;
      client.connect();
    }
  };

  const disconnect = () => {
    clientRef.current?.disconnect();
  };

  return { status, error, connect, disconnect, wsUrl };
}
