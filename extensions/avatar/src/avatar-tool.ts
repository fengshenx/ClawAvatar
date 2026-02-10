import type { OpenClawPluginToolContext, RuntimeLogger } from "openclaw/plugin-sdk";
import { AvatarState } from "./avatar-state.js";

export const AvatarExpressToolSchema = {
  type: "object",
  properties: {
    sessionKey: { type: "string", description: "Override target session key." },
    emotion: { type: "string", description: "Target emotion label." },
    action: { type: "string", description: "Target action label." },
    intensity: { type: "number", minimum: 0, maximum: 1 },
    gesture: { type: "string", description: "Optional gesture hint." },
    durationMs: { type: "integer", minimum: 200, maximum: 5000 },
    text: { type: "string", description: "Optional text shown on avatar side." },
    runId: { type: "string", description: "Optional run correlation id." },
  },
  additionalProperties: false,
} as const;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readOptionalString(params: Record<string, unknown>, key: string): string | undefined {
  const raw = params[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function readOptionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const raw = params[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toToolResult(details: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(details, null, 2),
      },
    ],
    details,
  };
}

export function createAvatarExpressTool(params: {
  state: AvatarState;
  logger: RuntimeLogger;
  ctx: OpenClawPluginToolContext;
}) {
  return {
    name: "avatar_express",
    label: "Avatar Express",
    description:
      "Show how you're feeling through facial expressions and body language. " +
      "Use this naturally when your emotional state matches what you're saying - " +
      "like a warm smile when being friendly, a nod when agreeing, or a thoughtful look when considering something. " +
      "The avatar will display the expression alongside your response. " +
      "If the avatar isn't connected, this does nothing - just continue with your response.",
    parameters: AvatarExpressToolSchema,
    execute: async (toolCallId: string, rawParams: unknown) => {
      const payload = asObject(rawParams);
      const fallbackSession = params.ctx.sessionKey?.trim() || "main";
      const sessionKey = readOptionalString(payload, "sessionKey") ?? fallbackSession;
      const emotion = readOptionalString(payload, "emotion")?.toLowerCase();
      const action = readOptionalString(payload, "action")?.toLowerCase();

      const result = params.state.emitFromTool({
        sessionKey,
        toolCallId,
        emotion,
        action,
        intensity: readOptionalNumber(payload, "intensity"),
        gesture: readOptionalString(payload, "gesture"),
        durationMs: readOptionalNumber(payload, "durationMs"),
        text: readOptionalString(payload, "text"),
        runId: readOptionalString(payload, "runId"),
      });

      if (!result.accepted) {
        return toToolResult({
          ok: true,
          accepted: false,
          reason: result.reason,
          sessionKey: result.sessionKey,
          hint: "Avatar capability handshake required. Call avatar.hello from the avatar client.",
        });
      }

      params.logger.debug?.(
        `[avatar] avatar_express accepted session=${result.sessionKey} action=${result.event.action ?? "-"} emotion=${result.event.emotion ?? "-"}`,
      );

      return toToolResult({
        ok: true,
        accepted: true,
        sessionKey: result.sessionKey,
        event: result.event,
        downgraded: result.downgraded,
      });
    },
  };
}
