import { Type } from "@sinclair/typebox";
import type { OpenClawPluginToolContext, RuntimeLogger } from "openclaw/plugin-sdk";
import { AvatarState } from "./avatar-state.js";

export const AvatarExpressToolSchema = Type.Object(
  {
    sessionKey: Type.Optional(Type.String({ description: "Override target session key." })),
    emotion: Type.Optional(Type.String({ description: "Target emotion label." })),
    action: Type.Optional(Type.String({ description: "Target action label." })),
    intensity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    gesture: Type.Optional(Type.String({ description: "Optional gesture hint." })),
    durationMs: Type.Optional(Type.Integer({ minimum: 200, maximum: 5000 })),
    text: Type.Optional(Type.String({ description: "Optional text shown on avatar side." })),
    runId: Type.Optional(Type.String({ description: "Optional run correlation id." })),
  },
  { additionalProperties: false },
);

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
      "Express non-verbal cues on the connected avatar front-end. " +
      "Use for emotion/action hints. If avatar is unavailable, this tool returns a safe no-op result.",
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
