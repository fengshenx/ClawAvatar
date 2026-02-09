import { describe, expect, it } from "vitest";
import { AvatarState } from "./avatar-state.js";

describe("AvatarState", () => {
  it("stores handshake profile and normalizes capabilities", () => {
    const state = new AvatarState();
    const ack = state.hello({
      sessionKey: "main",
      avatarId: "fox",
      capabilities: {
        emotions: ["Happy", " happy ", "Sad"],
        actions: ["Wave", " nod "],
        fallback: { wave: "nod" },
      },
    });

    expect(ack.sessionKey).toBe("main");
    expect(ack.acceptedCapabilities.emotions).toEqual(["happy", "sad"]);
    expect(ack.acceptedCapabilities.actions).toEqual(["wave", "nod"]);
    expect(ack.acceptedCapabilities.fallback.wave).toBe("nod");
  });

  it("returns no-op when tool emit is requested without handshake", () => {
    const state = new AvatarState();
    const result = state.emitFromTool({
      toolCallId: "call_1",
      sessionKey: "main",
      emotion: "happy",
      action: "wave",
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("avatar_unavailable");
    }
  });

  it("downgrades unsupported actions using fallback map", () => {
    const state = new AvatarState();
    state.hello({
      sessionKey: "main",
      capabilities: {
        emotions: ["neutral"],
        actions: ["thinking"],
        fallback: {
          talking: "thinking",
        },
      },
    });

    const result = state.emitFromTool({
      toolCallId: "call_2",
      sessionKey: "main",
      action: "talking",
      emotion: "happy",
      intensity: 2,
      durationMs: 9000,
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.event.action).toBe("thinking");
      expect(result.event.emotion).toBe("neutral");
      expect(result.event.intensity).toBe(1);
      expect(result.event.durationMs).toBe(5000);
      expect(result.downgraded).toEqual({ actionFrom: "talking", emotionFrom: "happy" });
    }

    const pulled = state.pull("main", 10);
    expect(pulled).toHaveLength(1);
    expect(state.pendingCount("main")).toBe(0);
  });

  it("falls back to main handshake when emitting from another session", () => {
    const state = new AvatarState();
    state.hello({
      sessionKey: "main",
      capabilities: {
        emotions: ["neutral", "happy"],
        actions: ["wave"],
      },
    });

    const result = state.emitFromTool({
      toolCallId: "call_3",
      sessionKey: "telegram:chat:123",
      emotion: "happy",
      action: "wave",
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.sessionKey).toBe("main");
      expect(result.event.sessionKey).toBe("main");
    }
  });
});
