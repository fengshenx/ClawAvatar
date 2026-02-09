import { beforeEach, describe, expect, it } from "vitest";
import plugin, { resetSharedAvatarStateForTest } from "./index.js";
import type {
  OpenClawPluginApi,
  OpenClawPluginToolContext,
  GatewayRequestHandler,
} from "openclaw/plugin-sdk";

type Captured = {
  methods: Map<string, GatewayRequestHandler>;
  toolFactory?: (ctx: OpenClawPluginToolContext) => unknown;
  beforeAgentStart?: (event: unknown, ctx: { sessionKey?: string }) => Promise<unknown> | unknown;
};

function createFakeApi(captured: Captured): OpenClawPluginApi {
  return {
    id: "avatar",
    name: "avatar",
    source: "test",
    config: {},
    pluginConfig: {},
    // oxlint-disable-next-line typescript/no-explicit-any
    runtime: { version: "test" } as any,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registerGatewayMethod(method, handler) {
      captured.methods.set(method, handler);
    },
    registerTool(tool) {
      if (typeof tool === "function") {
        captured.toolFactory = tool;
      }
    },
    on(hookName, handler) {
      if (hookName === "before_agent_start") {
        captured.beforeAgentStart = handler as Captured["beforeAgentStart"];
      }
    },
    registerHook() {},
    registerHttpHandler() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerCommand() {},
    resolvePath: (input) => input,
  };
}

describe("avatar plugin", () => {
  beforeEach(() => {
    resetSharedAvatarStateForTest();
  });

  it("registers hello/pull/status methods and injects prompt context after handshake", async () => {
    const captured: Captured = {
      methods: new Map(),
    };

    plugin.register(createFakeApi(captured));

    const hello = captured.methods.get("avatar.hello");
    expect(hello).toBeDefined();

    let helloPayload: unknown;
    hello?.({
      req: { type: "req", id: "1", method: "avatar.hello" },
      params: {
        sessionKey: "main",
        avatarId: "fox",
        capabilities: {
          emotions: ["happy", "neutral"],
          actions: ["wave", "thinking"],
        },
      },
      client: null,
      // oxlint-disable-next-line @typescript-eslint/no-unused-vars
      isWebchatConnect: (_params) => false,
      respond: (_ok, payload) => {
        helloPayload = payload;
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      context: {} as any,
    });

    expect(helloPayload).toBeTruthy();

    const before = captured.beforeAgentStart;
    expect(before).toBeDefined();
    const hookResult = await before?.({ prompt: "hi", messages: [] }, { sessionKey: "main" });
    expect(hookResult).toBeTruthy();
    expect(String((hookResult as { prependContext?: string }).prependContext)).toContain(
      "available_emotions: happy, neutral",
    );
  });

  it("tool returns accepted=false when no session handshake exists", async () => {
    const captured: Captured = {
      methods: new Map(),
    };
    plugin.register(createFakeApi(captured));

    const tool = captured.toolFactory?.({
      config: {},
      sessionKey: "main",
      workspaceDir: "/tmp",
      sandboxed: false,
    });

    expect(tool).toBeTruthy();

    const execute = (tool as { execute: (id: string, params: unknown) => Promise<unknown> }).execute;
    const result = await execute("call", {
      emotion: "happy",
      action: "wave",
    });

    const details = (result as { details?: { accepted?: boolean } }).details;
    expect(details?.accepted).toBe(false);
  });
});
