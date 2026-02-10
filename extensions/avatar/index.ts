import { createServer, type Server as HttpServer } from "node:http";
import type { OpenClawPluginApi, RuntimeLogger } from "openclaw/plugin-sdk";
import { WebSocketServer, type WebSocket } from "ws";
import { AvatarState } from "./src/avatar-state.js";
import { createAvatarExpressTool } from "./src/avatar-tool.js";

type AvatarPluginConfig = {
  enabled: boolean;
  queueLimit: number;
  wsPort: number;
};

type WsClientState = {
  sessionKey: string;
  connectionId?: string;
};

type WsReqFrame = {
  type?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type MethodResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; message: string };

const AVATAR_WS_HOST = "127.0.0.1";
const AVATAR_WS_PATH = "/extension";
const AVATAR_WS_DEFAULT_PORT = 18802;
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
  const wsPortRaw =
    typeof cfg.wsPort === "number" && Number.isFinite(cfg.wsPort)
      ? cfg.wsPort
      : AVATAR_WS_DEFAULT_PORT;
  const wsPort = Math.max(1, Math.min(65535, Math.trunc(wsPortRaw)));
  return { enabled, queueLimit, wsPort };
}

function normalizeSessionKey(params: unknown): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "main";
  }
  const raw = (params as { sessionKey?: unknown }).sessionKey;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "main";
}

function createAvatarMethodHandlers(state: AvatarState, cfg: AvatarPluginConfig) {
  return {
    hello(params: unknown): MethodResult {
      if (!cfg.enabled) {
        return { ok: false, message: "avatar plugin disabled" };
      }
      const capsRaw =
        params && typeof params === "object" && !Array.isArray(params)
          ? (params as { capabilities?: unknown }).capabilities
          : undefined;
      if (!capsRaw || typeof capsRaw !== "object" || Array.isArray(capsRaw)) {
        return { ok: false, message: "capabilities object required" };
      }
      const input = params as {
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
      const ack = state.hello({
        sessionKey: input.sessionKey,
        connectionId: input.connectionId,
        avatarId: input.avatarId,
        protocolVersion: input.protocolVersion,
        capabilities: capsRaw as {
          emotions?: unknown;
          actions?: unknown;
          viseme?: unknown;
          fallback?: unknown;
        },
      });
      return {
        ok: true,
        payload: {
          event: "avatar.helloAck",
          ...ack,
        },
      };
    },
    goodbye(params: unknown): MethodResult {
      let sessionKey: string | undefined;
      let connectionId: string | undefined;
      if (params && typeof params === "object" && !Array.isArray(params)) {
        const cast = params as {
          sessionKey?: unknown;
          connectionId?: unknown;
        };
        sessionKey = typeof cast.sessionKey === "string" ? cast.sessionKey : undefined;
        connectionId = typeof cast.connectionId === "string" ? cast.connectionId : undefined;
      }
      const removed = state.goodbye(sessionKey, connectionId);
      return { ok: true, payload: { ok: true, removed } };
    },
    status(params: unknown): MethodResult {
      const sessionKey = normalizeSessionKey(params);
      const profile = state.getProfile(sessionKey);
      return {
        ok: true,
        payload: {
          sessionKey,
          connected: Boolean(profile),
          profile,
          pendingEvents: state.pendingCount(sessionKey),
        },
      };
    },
    pull(params: unknown): MethodResult {
      const sessionKey = normalizeSessionKey(params);
      let max: number | undefined;
      if (params && typeof params === "object" && !Array.isArray(params)) {
        const raw = (params as { max?: unknown }).max;
        max = typeof raw === "number" ? raw : undefined;
      }
      const events = state.pull(sessionKey, max);
      return {
        ok: true,
        payload: {
          sessionKey,
          events,
          pendingEvents: state.pendingCount(sessionKey),
        },
      };
    },
  };
}

function sendWsError(ws: WebSocket, id: string, message: string): void {
  ws.send(
    JSON.stringify({
      type: "res",
      id,
      ok: false,
      error: {
        message,
      },
    }),
  );
}

function sendWsOk(ws: WebSocket, id: string, payload: Record<string, unknown>): void {
  ws.send(
    JSON.stringify({
      type: "res",
      id,
      ok: true,
      payload,
    }),
  );
}

function createLocalExtensionService(params: {
  state: AvatarState;
  cfg: AvatarPluginConfig;
  logger: RuntimeLogger;
}) {
  const { state, cfg, logger } = params;
  const handlers = createAvatarMethodHandlers(state, cfg);
  let server: HttpServer | null = null;
  let wss: WebSocketServer | null = null;

  const service = {
    id: "avatar-local-ws",
    async start() {
      if (!cfg.enabled) {
        return;
      }
      if (server || wss) {
        return;
      }

      server = createServer((_req, res) => {
        res.statusCode = 404;
        res.end();
      });
      wss = new WebSocketServer({ noServer: true });

      server.on("upgrade", (req, socket, head) => {
        const host = req.headers.host ?? `${AVATAR_WS_HOST}:${cfg.wsPort}`;
        const parsed = new URL(req.url ?? "/", `http://${host}`);

        if (parsed.pathname !== AVATAR_WS_PATH) {
          socket.destroy();
          return;
        }

        const remote = req.socket.remoteAddress;
        if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
          socket.destroy();
          return;
        }

        wss?.handleUpgrade(req, socket, head, (ws) => {
          wss?.emit("connection", ws, req);
        });
      });

      wss.on("connection", (ws) => {
        const client: WsClientState = { sessionKey: "main" };

        ws.on("message", (raw) => {
          let frame: WsReqFrame;
          try {
            frame = JSON.parse(String(raw)) as WsReqFrame;
          } catch {
            return;
          }

          if (frame.type !== "req" || typeof frame.id !== "string" || typeof frame.method !== "string") {
            return;
          }

          if (frame.method === "avatar.hello") {
            const params =
              frame.params && typeof frame.params === "object" && !Array.isArray(frame.params)
                ? (frame.params as { sessionKey?: unknown; connectionId?: unknown })
                : {};
            const sessionKey =
              typeof params.sessionKey === "string" && params.sessionKey.trim()
                ? params.sessionKey.trim()
                : "main";
            client.sessionKey = sessionKey;
            client.connectionId =
              typeof params.connectionId === "string" && params.connectionId.trim()
                ? params.connectionId
                : undefined;
          }

          const handler =
            frame.method === "avatar.hello"
              ? handlers.hello
              : frame.method === "avatar.goodbye"
                ? handlers.goodbye
                : frame.method === "avatar.status"
                  ? handlers.status
                  : frame.method === "avatar.pull"
                    ? handlers.pull
                    : null;

          if (!handler) {
            sendWsError(ws, frame.id, `method not found: ${frame.method}`);
            return;
          }

          const result = handler(frame.params);
          if (result.ok) {
            sendWsOk(ws, frame.id, result.payload);
            return;
          }
          sendWsError(ws, frame.id, result.message);
        });

        ws.on("close", () => {
          state.goodbye(client.sessionKey, client.connectionId);
        });
      });

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server?.once("error", onError);
        server?.listen(cfg.wsPort, AVATAR_WS_HOST, () => {
          server?.off("error", onError);
          resolve();
        });
      });

      logger.info(`avatar local websocket listening on ws://${AVATAR_WS_HOST}:${cfg.wsPort}${AVATAR_WS_PATH}`);
    },
    async stop() {
      const sockets = wss;
      const http = server;
      wss = null;
      server = null;

      if (sockets) {
        await new Promise<void>((resolve) => {
          sockets.close(() => resolve());
        });
      }

      if (http) {
        await new Promise<void>((resolve, reject) => {
          http.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }).catch(() => undefined);
      }
    },
  };

  return service;
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
      wsPort: {
        label: "Local WS Port",
        help: "Local extension websocket port (127.0.0.1 only).",
        advanced: true,
      },
    },
  },
  register(api: OpenClawPluginApi) {
    const cfg = parseConfig(api.pluginConfig);
    const state = getSharedAvatarState(cfg.queueLimit);
    const handlers = createAvatarMethodHandlers(state, cfg);

    api.registerGatewayMethod("avatar.hello", ({ params, respond }) => {
      const result = handlers.hello(params);
      if (result.ok) {
        respond(true, result.payload);
        return;
      }
      respond(false, { error: result.message });
    });

    api.registerGatewayMethod("avatar.goodbye", ({ params, respond }) => {
      const result = handlers.goodbye(params);
      respond(true, result.payload);
    });

    api.registerGatewayMethod("avatar.status", ({ params, respond }) => {
      const result = handlers.status(params);
      respond(true, result.payload);
    });

    api.registerGatewayMethod("avatar.pull", ({ params, respond }) => {
      const result = handlers.pull(params);
      respond(true, result.payload);
    });

    api.registerService(
      createLocalExtensionService({
        state,
        cfg,
        logger: api.logger,
      }),
    );

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

      // Natural avatar expression - treat as natural part of conversation
      return {
        prependContext: [
          "<avatar_expression>",
          "You can show your emotional state through facial expressions and gestures. This is natural - like when a person smiles while saying something kind, or looks focused while explaining.",
          `Available expressions: ${emotions}`,
          `Available gestures: ${actions}`,
          "",
          "When to use naturally:",
          "• When your emotional tone matches your words (warmth, encouragement, empathy)",
          "• When you want to emphasize something important",
          "• When the conversation shifts to a different emotional context",
          "• Small, genuine expressions work better than dramatic ones",
          "",
          "You're encouraged to call this whenever it feels right - don't hold back on expressing yourself naturally.",
          "",
          "If the avatar isn't connected, simply continue your response normally.",
          "</avatar_expression>",
        ].join("\n"),
      };
    });
  },
};

export default plugin;
