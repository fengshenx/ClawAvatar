import { randomUUID } from "node:crypto";

export const AVATAR_PROTOCOL_VERSION = "1.0";

const DEFAULT_QUEUE_LIMIT = 128;
const DEFAULT_PULL_LIMIT = 20;

export type AvatarVisemeCapability = {
  supported: boolean;
  mode: "auto" | "manual";
};

export type AvatarCapabilities = {
  emotions: string[];
  actions: string[];
  viseme?: AvatarVisemeCapability;
  fallback: Record<string, string>;
};

export type AvatarProfile = {
  connectionId: string;
  sessionKey: string;
  avatarId: string;
  negotiatedVersion: typeof AVATAR_PROTOCOL_VERSION;
  acceptedCapabilities: AvatarCapabilities;
  negotiatedAt: number;
  lastSeenAt: number;
};

export type AvatarEvent = {
  eventId: string;
  sessionKey: string;
  ts: number;
  source: "tool" | "autopilot";
  emotion?: string;
  action?: string;
  intensity?: number;
  gesture?: string;
  durationMs?: number;
  text?: string;
  runId?: string;
  meta?: Record<string, unknown>;
};

export type AvatarHelloInput = {
  sessionKey?: string;
  connectionId?: string;
  avatarId?: string;
  protocolVersion?: string;
  capabilities?: {
    emotions?: unknown;
    actions?: unknown;
    viseme?: unknown;
    fallback?: unknown;
  };
};

export type AvatarHelloAck = {
  connectionId: string;
  sessionKey: string;
  avatarId: string;
  negotiatedVersion: typeof AVATAR_PROTOCOL_VERSION;
  acceptedCapabilities: AvatarCapabilities;
  serverTs: number;
};

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const dedup = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) {
      continue;
    }
    dedup.add(trimmed);
  }
  return Array.from(dedup);
}

function normalizeFallback(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [key, mapped] of Object.entries(value)) {
    const from = key.trim().toLowerCase();
    const to = typeof mapped === "string" ? mapped.trim().toLowerCase() : "";
    if (!from || !to) {
      continue;
    }
    next[from] = to;
  }
  return next;
}

function normalizeSessionKey(value: unknown): string {
  if (typeof value !== "string") {
    return "main";
  }
  const trimmed = value.trim();
  return trimmed || "main";
}

function normalizeAvatarId(value: unknown): string {
  if (typeof value !== "string") {
    return "avatar-default";
  }
  const trimmed = value.trim();
  return trimmed || "avatar-default";
}

function normalizeConnectionId(value: unknown): string {
  if (typeof value !== "string") {
    return `avatar-${randomUUID()}`;
  }
  const trimmed = value.trim();
  return trimmed || `avatar-${randomUUID()}`;
}

function normalizeViseme(value: unknown): AvatarVisemeCapability | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as { supported?: unknown; mode?: unknown };
  const supported = record.supported === true;
  if (!supported) {
    return {
      supported: false,
      mode: "auto",
    };
  }
  const mode = record.mode === "manual" ? "manual" : "auto";
  return { supported, mode };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export class AvatarState {
  private profilesBySession = new Map<string, AvatarProfile>();
  private eventsBySession = new Map<string, AvatarEvent[]>();

  constructor(private queueLimit = DEFAULT_QUEUE_LIMIT) {}

  hello(input: AvatarHelloInput): AvatarHelloAck {
    const sessionKey = normalizeSessionKey(input.sessionKey);
    const connectionId = normalizeConnectionId(input.connectionId);
    const avatarId = normalizeAvatarId(input.avatarId);
    const emotions = normalizeStringList(input.capabilities?.emotions);
    const actions = normalizeStringList(input.capabilities?.actions);
    const fallback = normalizeFallback(input.capabilities?.fallback);
    const viseme = normalizeViseme(input.capabilities?.viseme);
    const now = Date.now();

    const profile: AvatarProfile = {
      connectionId,
      sessionKey,
      avatarId,
      negotiatedVersion: AVATAR_PROTOCOL_VERSION,
      acceptedCapabilities: {
        emotions,
        actions,
        viseme,
        fallback,
      },
      negotiatedAt: now,
      lastSeenAt: now,
    };

    this.profilesBySession.set(sessionKey, profile);

    return {
      connectionId,
      sessionKey,
      avatarId,
      negotiatedVersion: AVATAR_PROTOCOL_VERSION,
      acceptedCapabilities: profile.acceptedCapabilities,
      serverTs: now,
    };
  }

  goodbye(sessionKeyInput: unknown, connectionIdInput?: unknown): boolean {
    const sessionKey = normalizeSessionKey(sessionKeyInput);
    const existing = this.profilesBySession.get(sessionKey);
    if (!existing) {
      return false;
    }
    if (typeof connectionIdInput === "string" && connectionIdInput.trim()) {
      if (existing.connectionId !== connectionIdInput.trim()) {
        return false;
      }
    }
    this.profilesBySession.delete(sessionKey);
    this.eventsBySession.delete(sessionKey);
    return true;
  }

  getProfile(sessionKeyInput: unknown): AvatarProfile | undefined {
    const sessionKey = normalizeSessionKey(sessionKeyInput);
    const existing = this.profilesBySession.get(sessionKey);
    if (!existing) {
      return undefined;
    }
    existing.lastSeenAt = Date.now();
    return existing;
  }

  getProfileForRuntime(sessionKeyInput: unknown): AvatarProfile | undefined {
    const requested = normalizeSessionKey(sessionKeyInput);
    const direct = this.profilesBySession.get(requested);
    if (direct) {
      direct.lastSeenAt = Date.now();
      return direct;
    }
    const main = this.profilesBySession.get("main");
    if (main) {
      main.lastSeenAt = Date.now();
      return main;
    }
    if (this.profilesBySession.size === 1) {
      const only = this.profilesBySession.values().next().value as AvatarProfile | undefined;
      if (only) {
        only.lastSeenAt = Date.now();
      }
      return only;
    }
    return undefined;
  }

  pull(sessionKeyInput: unknown, maxInput?: unknown): AvatarEvent[] {
    const sessionKey = normalizeSessionKey(sessionKeyInput);
    const queue = this.eventsBySession.get(sessionKey);
    if (!queue || queue.length === 0) {
      return [];
    }
    const requested = typeof maxInput === "number" ? Math.trunc(maxInput) : DEFAULT_PULL_LIMIT;
    const max = clamp(requested, 1, 200);
    return queue.splice(0, max);
  }

  pendingCount(sessionKeyInput: unknown): number {
    const sessionKey = normalizeSessionKey(sessionKeyInput);
    return this.eventsBySession.get(sessionKey)?.length ?? 0;
  }

  emitFromTool(params: {
    sessionKey?: string;
    toolCallId: string;
    emotion?: string;
    action?: string;
    intensity?: number;
    gesture?: string;
    durationMs?: number;
    text?: string;
    runId?: string;
  }):
    | { accepted: false; reason: string; sessionKey: string }
    | {
        accepted: true;
        sessionKey: string;
        event: AvatarEvent;
        downgraded?: { emotionFrom?: string; actionFrom?: string };
      } {
    const sessionKey = normalizeSessionKey(params.sessionKey);
    const profile = this.getProfileForRuntime(sessionKey);
    if (!profile) {
      return {
        accepted: false,
        reason: "avatar_unavailable",
        sessionKey,
      };
    }
    const resolvedSessionKey = profile.sessionKey;

    const capabilities = profile.acceptedCapabilities;
    const requestedEmotion = params.emotion?.trim().toLowerCase();
    const requestedAction = params.action?.trim().toLowerCase();

    let emotion = requestedEmotion;
    let action = requestedAction;
    const downgraded: { emotionFrom?: string; actionFrom?: string } = {};

    if (emotion && !capabilities.emotions.includes(emotion)) {
      const fallbackEmotion = capabilities.emotions.includes("neutral")
        ? "neutral"
        : capabilities.emotions[0];
      if (fallbackEmotion) {
        downgraded.emotionFrom = emotion;
        emotion = fallbackEmotion;
      } else {
        emotion = undefined;
      }
    }

    if (action && !capabilities.actions.includes(action)) {
      const mapped = capabilities.fallback[action];
      if (mapped && capabilities.actions.includes(mapped)) {
        downgraded.actionFrom = action;
        action = mapped;
      } else {
        const fallbackAction = capabilities.actions[0];
        if (fallbackAction) {
          downgraded.actionFrom = action;
          action = fallbackAction;
        } else {
          action = undefined;
        }
      }
    }

    const intensity =
      typeof params.intensity === "number" && Number.isFinite(params.intensity)
        ? clamp(params.intensity, 0, 1)
        : undefined;
    const durationMs =
      typeof params.durationMs === "number" && Number.isFinite(params.durationMs)
        ? Math.trunc(clamp(params.durationMs, 200, 5000))
        : undefined;

    const event: AvatarEvent = {
      eventId: `evt_${params.toolCallId}_${randomUUID()}`,
      sessionKey: resolvedSessionKey,
      ts: Date.now(),
      source: "tool",
      emotion,
      action,
      intensity,
      gesture: params.gesture,
      durationMs,
      text: params.text,
      runId: params.runId,
      meta: {
        toolCallId: params.toolCallId,
        requestedSessionKey: sessionKey,
      },
    };

    this.enqueueEvent(resolvedSessionKey, event);

    return {
      accepted: true,
      sessionKey: resolvedSessionKey,
      event,
      downgraded: Object.keys(downgraded).length > 0 ? downgraded : undefined,
    };
  }

  private enqueueEvent(sessionKey: string, event: AvatarEvent) {
    const queue = this.eventsBySession.get(sessionKey) ?? [];
    queue.push(event);
    if (queue.length > this.queueLimit) {
      queue.splice(0, queue.length - this.queueLimit);
    }
    this.eventsBySession.set(sessionKey, queue);
  }
}
