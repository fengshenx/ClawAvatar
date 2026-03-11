/**
 * Electron API 类型定义
 */

export interface ElectronAPI {
  getPlatform: () => NodeJS.Platform;
  readClipboardText: () => string;
  getOptions: () => {
    alwaysOnTop: boolean;
    clickThrough: boolean;
    dockEdge: 'left' | 'right' | 'top' | null;
  };
  setAlwaysOnTop: (value: boolean) => void;
  setClickThrough: (value: boolean) => void;
  setDockEdge: (edge: 'left' | 'right' | 'top' | null) => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
  moveWindow: (dx: number, dy: number) => void;
}

export interface AvatarBridge {
  getPluginStatus: () => {
    connected: boolean;
    sessionKey: string;
    avatarId: string;
  } | null;
  getPluginCapabilities: () => {
    motionNames: string[];
    expressionNames: string[];
    getMotionGroupNames: () => string[];
  } | null;
  setPluginCapabilities: (capabilities: unknown) => Promise<unknown>;
  setPluginGatewayUrl: (gatewayUrl: string) => boolean | null;
  connectPlugin: () => Promise<unknown>;
  disconnectPlugin: () => Promise<unknown>;
  clearPluginPairing: () => Promise<unknown>;
  installExtension: () => Promise<{
    success: boolean;
    message?: string;
    error?: string;
    targetDir?: string;
  }>;
  checkExtensionInstalled: () => Promise<boolean>;
  onInstallProgress: (handler: (payload: { status: 'progress' | 'error' | 'success'; message: string; progress?: number }) => void) => () => void;
  onPluginEvent: (handler: (payload: unknown) => void) => (() => void);
  onPluginStatus: (handler: (payload: unknown) => void) => (() => void);
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    avatarBridge: AvatarBridge;
  }
}
