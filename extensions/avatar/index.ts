import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { AvatarState } from "./src/avatar-state.js";
import { createAvatarExpressTool } from "./src/avatar-tool.js";

type AvatarPluginConfig = {
  enabled: boolean;
  queueLimit: number;
};

const AVATAR_SHARED_STATE_KEY = Symbol.for("openclaw.avatar.sharedState");

type AvatarSharedState = {
  state?: AvatarState;
  queueLimit?: number;
};

function getSharedAvatarState(queueLimit: number): AvatarState {
  const root = globalThis as typeof globalThis & {
    [AVATAR_SHARED_STATE_KEY]?: AvatarSharedState;
  };
  const shared = (root[AVATAR_SHARED_STATE_KEY] ??= {});
  if (!shared.state) {
    shared.state = new AvatarState(queueLimit);
    shared.queueLimit = queueLimit;
  }
  return shared.state;
}

export function resetSharedAvatarStateForTest(): void {
  const root = globalThis as typeof globalThis & {
    [AVATAR_SHARED_STATE_KEY]?: AvatarSharedState;
  };
  delete root[AVATAR_SHARED_STATE_KEY];
}

function parseConfig(raw: unknown): AvatarPluginConfig {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const cfg = value as Record<string, unknown>;
  const enabled = typeof cfg.enabled === "boolean" ? cfg.enabled : true;
  const queueLimitRaw =
    typeof cfg.queueLimit === "number" && Number.isFinite(cfg.queueLimit)
      ? cfg.queueLimit
      : 128;
  const queueLimit = Math.max(16, Math.min(2048, Math.trunc(queueLimitRaw)));
  return { enabled, queueLimit };
}

const plugin = {
  id: "avatar",
  name: "Avatar",
  description: "Avatar handshake + expressive tooling for non-verbal emotional cues",
  configSchema: {
    parse: parseConfig,
    uiHints: {
      enabled: {
        label: "Enabled",
        help: "Toggle avatar plugin runtime.",
      },
      queueLimit: {
        label: "Queue Limit",
        help: "Max queued avatar events per session.",
        advanced: true,
      },
    },
  },
  register(api: OpenClawPluginApi) {
    const cfg = parseConfig(api.pluginConfig);
    const state = getSharedAvatarState(cfg.queueLimit);

    api.registerGatewayMethod("avatar.hello", ({ params, respond }) => {
      if (!cfg.enabled) {
        respond(false, { error: "avatar plugin disabled" });
        return;
      }
      const capsRaw = params?.capabilities;
      if (!capsRaw || typeof capsRaw !== "object" || Array.isArray(capsRaw)) {
        respond(false, { error: "capabilities object required" });
        return;
      }
      const ack = state.hello({
        sessionKey: params?.sessionKey as string | undefined,
        connectionId: params?.connectionId as string | undefined,
        avatarId: params?.avatarId as string | undefined,
        protocolVersion: params?.protocolVersion as string | undefined,
        capabilities: capsRaw as {
          emotions?: unknown;
          actions?: unknown;
          viseme?: unknown;
          fallback?: unknown;
        },
      });
      respond(true, {
        event: "avatar.helloAck",
        ...ack,
      });
    });

    api.registerGatewayMethod("avatar.goodbye", ({ params, respond }) => {
      const removed = state.goodbye(
        params?.sessionKey as string | undefined,
        params?.connectionId as string | undefined,
      );
      respond(true, { ok: true, removed });
    });

    api.registerGatewayMethod("avatar.status", ({ params, respond }) => {
      const sessionKey = (typeof params?.sessionKey === "string" && params.sessionKey.trim()) || "main";
      const profile = state.getProfile(sessionKey);
      respond(true, {
        sessionKey,
        connected: Boolean(profile),
        profile,
        pendingEvents: state.pendingCount(sessionKey),
      });
    });

    api.registerGatewayMethod("avatar.pull", ({ params, respond }) => {
      const sessionKey = (typeof params?.sessionKey === "string" && params.sessionKey.trim()) || "main";
      const max = typeof params?.max === "number" ? params.max : undefined;
      const events = state.pull(sessionKey, max);
      respond(true, {
        sessionKey,
        events,
        pendingEvents: state.pendingCount(sessionKey),
      });
    });

    api.registerTool((ctx) => {
      if (!cfg.enabled) {
        return null;
      }
      return createAvatarExpressTool({
        state,
        logger: api.logger,
        ctx,
      });
    });

    api.on("before_agent_start", async (_event, hookCtx) => {
      if (!cfg.enabled) {
        return;
      }
      const sessionKey = hookCtx.sessionKey?.trim() || "main";
      const profile = state.getProfileForRuntime(sessionKey);
      if (!profile) {
        return;
      }
      const capabilities = profile.acceptedCapabilities;
      const emotions = capabilities.emotions.join(", ") || "(none)";
      const actions = capabilities.actions.join(", ") || "(none)";
      return {
        prependContext: [
          "<avatar_capability>",
          "Avatar front-end is connected for this session.",
          `sessionKey: ${sessionKey}`,
          `avatarId: ${profile.avatarId}`,
          `available_emotions: ${emotions}`,
          `available_actions: ${actions}`,
          "Use tool `avatar_express` only when non-verbal cues improve communication (e.g., empathy, celebration, apology, emphasis).",
          "Do not call avatar_express for every sentence. Keep text clarity first.",
          "If avatar_express returns accepted=false, continue normal text response without retry loops.",
          "</avatar_capability>",
        ].join("\n"),
      };
    });
  },
};

export default plugin;
