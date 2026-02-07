/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AVATAR_WS_URL?: string;
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

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
