import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/app/state';
import type { EmotionType, RenderMessage } from '@/protocol/types';

const BRIDGE_SESSION_ID = 'avatar-plugin';

type PluginPhase = 'idle' | 'pairing' | 'connecting' | 'connected' | 'error';

export interface PluginStatus {
  phase: PluginPhase;
  paired: boolean;
  lastError: string | null;
  gatewayUrl: string;
  sessionKey: string;
  avatarId: string;
  connectionId: string;
  capabilities: {
    emotions: string[];
    actions: string[];
  };
}

const DEFAULT_STATUS: PluginStatus = {
  phase: 'idle',
  paired: false,
  lastError: null,
  gatewayUrl: '',
  sessionKey: 'main',
  avatarId: 'avt_fox_v1',
  connectionId: '',
  capabilities: { emotions: [], actions: [] },
};

const KNOWN_EMOTIONS: EmotionType[] = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'relaxed',
  'sorry',
  'confused',
];

function normalizeEmotion(value: string | undefined): EmotionType | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return KNOWN_EMOTIONS.includes(v as EmotionType) ? (v as EmotionType) : undefined;
}

function deriveWireState(): RenderMessage['state'] {
  // 简化状态：统一返回 idle，thinking/talking 相关的微动画已移除
  return 'idle';
}

function resolveGestureName(action: string | undefined, clipNames: string[]): string | undefined {
  if (!action) return undefined;
  const raw = action.trim();
  if (!raw) return undefined;
  const normalized = normalizeActionToken(raw);
  const matched = clipNames.find((name) => normalizeActionToken(name) === normalized);
  return matched ?? raw;
}

function normalizeActionToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^idel\b/, 'idle')
    .replace(/[\s-]+/g, '_');
}

function isElectronPluginAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.avatarBridge?.connectPlugin);
}

export function useElectronAvatarPlugin(clipNames: string[], expressions: string[], wsUrl?: string) {
  const applyMessage = useAppStore((s) => s.applyMessage);
  const [status, setStatus] = useState<PluginStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = useState(false);

  const enabled = useMemo(() => isElectronPluginAvailable(), []);
  const lastLogSignatureRef = useRef('');

  useEffect(() => {
    if (!enabled || !window.avatarBridge) return;
    if (wsUrl?.trim()) {
      window.avatarBridge.setPluginGatewayUrl(wsUrl).catch(() => undefined);
    }

    let disposed = false;
    const offEvent = window.avatarBridge.onPluginEvent((event) => {
      const rawAction =
        (typeof event.action === 'string' ? event.action : undefined) ??
        (typeof (event as { gesture?: unknown }).gesture === 'string'
          ? (event as { gesture: string }).gesture
          : undefined) ??
        (typeof (event as { actionName?: unknown }).actionName === 'string'
          ? (event as { actionName: string }).actionName
          : undefined) ??
        (typeof (event as { event?: { action?: unknown } }).event?.action === 'string'
          ? ((event as { event: { action: string } }).event.action)
          : undefined);
      const gesture = resolveGestureName(rawAction, clipNames);
      const normalizedEmotion = normalizeEmotion(event.emotion);
      const normalizedIntensity =
        typeof event.intensity === 'number' && Number.isFinite(event.intensity)
          ? Math.max(0, Math.min(1, event.intensity))
          : 0.8;
      const signature = `${rawAction ?? ''}|${normalizedEmotion ?? ''}|${normalizedIntensity}|${event.text ?? ''}|${gesture ?? ''}`;
      if (lastLogSignatureRef.current !== signature) {
        lastLogSignatureRef.current = signature;
        console.log('[AvatarPlugin] Incoming sync event', {
          action: rawAction,
          emotion: event.emotion,
          intensity: event.intensity,
          text: event.text,
          mappedGesture: gesture,
          mappedEmotion: normalizedEmotion,
          mappedIntensity: normalizedIntensity,
        });
      }
      const msg: RenderMessage = {
        type: 'render',
        session_id: BRIDGE_SESSION_ID,
        state: deriveWireState(),
        emotion: normalizedEmotion,
        intensity: normalizedIntensity,
        gesture,
        text: event.text,
      };
      applyMessage(msg);
    });

    const offStatus = window.avatarBridge.onPluginStatus((next) => {
      if (!disposed) {
        setStatus((prev) => ({ ...prev, ...next }));
      }
    });

    window.avatarBridge
      .getPluginStatus()
      .then((initial) => {
        if (!disposed && initial) setStatus((prev) => ({ ...prev, ...initial }));
      })
      .catch(() => undefined);

    window.avatarBridge.connectPlugin().catch(() => undefined);

    return () => {
      disposed = true;
      offEvent?.();
      offStatus?.();
    };
  }, [enabled, applyMessage, clipNames, wsUrl]);

  useEffect(() => {
    if (!enabled || !window.avatarBridge) return;
    const actions = clipNames.filter((name) => Boolean(name?.trim()));
    const emotions = expressions.filter((name) => Boolean(name?.trim()));
    window.avatarBridge
      .setPluginCapabilities({ actions, emotions })
      .catch(() => undefined);
  }, [enabled, clipNames, expressions]);

  const connect = useCallback(async () => {
    if (!window.avatarBridge) return;
    setBusy(true);
    try {
      await window.avatarBridge.connectPlugin();
      const next = await window.avatarBridge.getPluginStatus();
      if (next) setStatus((prev) => ({ ...prev, ...next }));
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!window.avatarBridge) return;
    await window.avatarBridge.disconnectPlugin();
    const next = await window.avatarBridge.getPluginStatus();
    if (next) setStatus((prev) => ({ ...prev, ...next }));
  }, []);

  const clearPairing = useCallback(async () => {
    if (!window.avatarBridge) return;
    await window.avatarBridge.clearPluginPairing();
    const next = await window.avatarBridge.getPluginStatus();
    if (next) setStatus((prev) => ({ ...prev, ...next }));
  }, []);

  return {
    enabled,
    status,
    busy,
    connect,
    disconnect,
    clearPairing,
  };
}
