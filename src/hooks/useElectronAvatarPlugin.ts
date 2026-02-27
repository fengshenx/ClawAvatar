import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/app/state';
import type { EmotionType, ProtocolMessage, RenderMessage } from '@/protocol/types';

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

function resolveGestureName(
  action: string | undefined,
  clipNames: string[],
  motionGroupNames: string[],
): string | undefined {
  if (!action) return undefined;
  const raw = action.trim();
  if (!raw) return undefined;
  const normalized = normalizeActionToken(raw);

  // 如果 action 是 emotion 名称或动作组名称，不作为 gesture 处理
  const isEmotion = KNOWN_EMOTIONS.some((e) => normalizeActionToken(e) === normalized);
  const isMotionGroup = motionGroupNames.some(
    (g) => normalizeActionToken(g) === normalized,
  );
  if (isEmotion || isMotionGroup) {
    return undefined;
  }

  const matched = clipNames.find((name) => normalizeActionToken(name) === normalized);
  return matched;
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

function normalizeNameList(list: string[]): string[] {
  const uniq = new Set<string>();
  for (const item of list) {
    const value = item?.trim();
    if (value) uniq.add(value);
  }
  return Array.from(uniq);
}

function createCapabilitiesSignature(actions: string[], emotions: string[]): string {
  return `${actions.join('\u0001')}|${emotions.join('\u0001')}`;
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function samePluginStatus(a: PluginStatus, b: PluginStatus): boolean {
  return (
    a.phase === b.phase &&
    a.paired === b.paired &&
    a.lastError === b.lastError &&
    a.gatewayUrl === b.gatewayUrl &&
    a.sessionKey === b.sessionKey &&
    a.avatarId === b.avatarId &&
    a.connectionId === b.connectionId &&
    sameStringArray(a.capabilities.actions, b.capabilities.actions) &&
    sameStringArray(a.capabilities.emotions, b.capabilities.emotions)
  );
}

export function useElectronAvatarPlugin(
  clipNames: string[],
  expressions: string[],
  wsUrl?: string,
  getMotionGroupNames?: () => string[],
  playRandomInGroup?: (groupName: string) => string | null,
) {
  const applyMessage = useCallback((message: ProtocolMessage) => {
    useAppStore.getState().applyMessage(message);
  }, []);
  const [status, setStatus] = useState<PluginStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = useState(false);

  const enabled = useMemo(() => isElectronPluginAvailable(), []);
  const lastLogSignatureRef = useRef('');
  const clipNamesRef = useRef<string[]>(clipNames);
  const getMotionGroupNamesRef = useRef<typeof getMotionGroupNames>(getMotionGroupNames);
  const playRandomInGroupRef = useRef<typeof playRandomInGroup>(playRandomInGroup);
  const lastCapabilitiesSignatureRef = useRef('');

  useEffect(() => {
    clipNamesRef.current = clipNames;
    getMotionGroupNamesRef.current = getMotionGroupNames;
    playRandomInGroupRef.current = playRandomInGroup;
  }, [clipNames, getMotionGroupNames, playRandomInGroup]);

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

      // 获取当前的动作组名称（每次事件触发时获取最新的）
      const motionGroupNames = getMotionGroupNamesRef.current?.() || [];

      // 检查 action 或 emotion 是否是动作组名称
      let gesture: string | undefined;
      const normalizedAction = rawAction?.trim().toLowerCase();
      const normalizedEmotionForGroup = event.emotion?.trim().toLowerCase();

      // 优先检查 action 是否是动作组名称
      let groupNameToPlay: string | undefined;
      if (normalizedAction && motionGroupNames.map((n) => n.toLowerCase()).includes(normalizedAction)) {
        groupNameToPlay = normalizedAction;
      } else if (normalizedEmotionForGroup && motionGroupNames.map((n) => n.toLowerCase()).includes(normalizedEmotionForGroup)) {
        // 其次检查 emotion 是否是动作组名称
        groupNameToPlay = normalizedEmotionForGroup;
      }

      if (groupNameToPlay) {
        // 是动作组名称，随机播放该组中的一个 motion
        const played = playRandomInGroupRef.current?.(groupNameToPlay);
        if (played) {
          gesture = played;
        }
      } else {
        gesture = resolveGestureName(rawAction, clipNamesRef.current, motionGroupNames);
      }

      const normalizedEmotionResult = normalizeEmotion(event.emotion);
      const normalizedIntensity =
        typeof event.intensity === 'number' && Number.isFinite(event.intensity)
          ? Math.max(0, Math.min(1, event.intensity))
          : 0.8;
      const signature = `${rawAction ?? ''}|${normalizedEmotionResult ?? ''}|${normalizedIntensity}|${event.text ?? ''}|${gesture ?? ''}`;
      if (lastLogSignatureRef.current !== signature) {
        lastLogSignatureRef.current = signature;
        console.log('[AvatarPlugin] Incoming sync event', {
          action: rawAction,
          emotion: event.emotion,
          intensity: event.intensity,
          text: event.text,
          mappedGesture: gesture,
          mappedEmotion: normalizedEmotionResult,
          mappedIntensity: normalizedIntensity,
        });
      }
      const msg: RenderMessage = {
        type: 'render',
        session_id: BRIDGE_SESSION_ID,
        state: deriveWireState(),
        emotion: normalizedEmotionResult,
        intensity: normalizedIntensity,
        gesture,
        text: event.text,
      };
      applyMessage(msg);
    });

    const offStatus = window.avatarBridge.onPluginStatus((next) => {
      if (!disposed) {
        setStatus((prev) => {
          const merged = { ...prev, ...next };
          return samePluginStatus(prev, merged) ? prev : merged;
        });
      }
    });

    window.avatarBridge
      .getPluginStatus()
      .then((initial) => {
        if (!disposed && initial) {
          setStatus((prev) => {
            const merged = { ...prev, ...initial };
            return samePluginStatus(prev, merged) ? prev : merged;
          });
        }
      })
      .catch(() => undefined);

    window.avatarBridge.connectPlugin().catch(() => undefined);

    return () => {
      disposed = true;
      offEvent?.();
      offStatus?.();
    };
  }, [enabled, applyMessage, wsUrl]);

  useEffect(() => {
    if (!enabled || !window.avatarBridge) return;
    const motionGroupNames = getMotionGroupNamesRef.current?.() || [];
    const actions = normalizeNameList([...clipNames, ...motionGroupNames]);
    const emotions = normalizeNameList(expressions);
    const signature = createCapabilitiesSignature(actions, emotions);

    if (lastCapabilitiesSignatureRef.current === signature) {
      return;
    }
    lastCapabilitiesSignatureRef.current = signature;

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
