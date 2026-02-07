/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AVATAR_WS_URL?: string;
  readonly VITE_AVATAR_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Electron 桌面端预加载暴露的 API（仅在使用 electron 启动时存在） */
interface ElectronAPI {
  getPlatform: () => Promise<string>;
  getOptions: () => Promise<{
    alwaysOnTop: boolean;
    clickThrough: boolean;
    dockEdge: 'left' | 'right' | 'top' | null;
  }>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setClickThrough: (value: boolean) => Promise<void>;
  setDockEdge: (edge: 'left' | 'right' | 'top' | null) => Promise<void>;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
}

/** Avatar Channel 鉴权等（V4：Electron 下由 preload 暴露） */
interface AvatarBridge {
  getAvatarToken: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    avatarBridge?: AvatarBridge;
  }
}
