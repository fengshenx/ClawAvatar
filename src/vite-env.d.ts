/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AVATAR_WS_URL?: string;
  readonly VITE_AVATAR_TOKEN?: string;
  readonly VITE_AVATAR_EXTENSION_PORT?: string;
  readonly VITE_AVATAR_EXTENSION_WS_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Electron 桌面端预加载暴露的 API（仅在使用 electron 启动时存在） */
interface ElectronAPI {
  getPlatform: () => Promise<string>;
  readClipboardText: () => Promise<string>;
  getOptions: () => Promise<{
    alwaysOnTop: boolean;
    clickThrough: boolean;
    dockEdge: 'left' | 'right' | 'top' | null;
  }>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setClickThrough: (value: boolean) => Promise<void>;
  setDockEdge: (edge: 'left' | 'right' | 'top' | null) => Promise<void>;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
  /** 移动窗口（dx, dy 为偏移量） */
  moveWindow: (dx: number, dy: number) => void;
}

/** Avatar Channel 鉴权等（V4：Electron 下由 preload 暴露） */
interface AvatarBridge {
  getPluginStatus: () => Promise<{
    phase: 'idle' | 'pairing' | 'connecting' | 'connected' | 'error';
    paired: boolean;
    lastError: string | null;
    gatewayUrl: string;
    sessionKey: string;
    avatarId: string;
    connectionId: string;
    capabilities: {
      emotions: string[];
      actions: string[];
      viseme?: { supported: boolean; mode: string };
      fallback?: Record<string, string>;
    };
  } | null>;
  getPluginCapabilities: () => Promise<{
    emotions: string[];
    actions: string[];
    viseme?: { supported: boolean; mode: string };
    fallback?: Record<string, string>;
  } | null>;
  setPluginCapabilities: (capabilities: {
    emotions?: string[];
    actions?: string[];
    viseme?: { supported?: boolean; mode?: string };
    fallback?: Record<string, string>;
  }) => Promise<unknown>;
  setPluginGatewayUrl: (gatewayUrl: string) => Promise<unknown>;
  connectPlugin: () => Promise<unknown>;
  disconnectPlugin: () => Promise<unknown>;
  clearPluginPairing: () => Promise<unknown>;
  onPluginEvent: (handler: (payload: {
    eventId?: string;
    sessionKey?: string;
    ts?: number;
    source?: string;
    emotion?: string;
    action?: string;
    intensity?: number;
    durationMs?: number;
    text?: string;
  }) => void) => () => void;
  onPluginStatus: (handler: (payload: {
    phase: 'idle' | 'pairing' | 'connecting' | 'connected' | 'error';
    paired: boolean;
    lastError: string | null;
    gatewayUrl: string;
    sessionKey: string;
    avatarId: string;
    connectionId: string;
    capabilities: {
      emotions: string[];
      actions: string[];
      viseme?: { supported: boolean; mode: string };
      fallback?: Record<string, string>;
    };
  }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    avatarBridge?: AvatarBridge;
  }
}

export {};
