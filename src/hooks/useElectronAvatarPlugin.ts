import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/app/state';
import type { EmotionType, RenderMessage } from '@/protocol/types';

const BRIDGE_SESSION_ID = 'avatar-plugin';

type PluginPhase = 'idle' | 'pairing' | 'connecting' | 'connected' | 'error';

interface PluginStatus {
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

function deriveWireState(action: string | undefined, text: string | undefined): RenderMessage['state'] {
  const a = (action || '').trim().toLowerCase();
  if (a === 'thinking') return 'thinking';
  if (a === 'talking') return 'speaking';
  return 'idle';
}

function resolveGestureName(action: string | undefined, clipNames: string[]): string | undefined {
  if (!action) return undefined;
  const raw = action.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const matched = clipNames.find((name) => name.trim().toLowerCase() === lower);
  return matched ?? raw;
}

function isElectronPluginAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.avatarBridge?.connectPlugin);
}

export function useElectronAvatarPlugin(clipNames: string[], expressions: string[]) {
  const applyMessage = useAppStore((s) => s.applyMessage);
  const [status, setStatus] = useState<PluginStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = useState(false);

  const enabled = useMemo(() => isElectronPluginAvailable(), []);

  useEffect(() => {
    if (!enabled || !window.avatarBridge) return;

    let disposed = false;
    const offEvent = window.avatarBridge.onPluginEvent((event) => {
      const gesture = resolveGestureName(event.action, clipNames);
      const msg: RenderMessage = {
        type: 'render',
        session_id: BRIDGE_SESSION_ID,
        state: deriveWireState(gesture, event.text),
        emotion: normalizeEmotion(event.emotion),
        intensity:
          typeof event.intensity === 'number' && Number.isFinite(event.intensity)
            ? Math.max(0, Math.min(1, event.intensity))
            : 0.8,
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
  }, [enabled, applyMessage, clipNames]);

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
