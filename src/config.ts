/**
 * 前端配置（WebSocket 等）
 * 可通过环境变量 VITE_AVATAR_WS_URL 覆盖默认地址
 */

const DEFAULT_AVATAR_WS_URL = 'ws://localhost:8765/avatar';

export function getAvatarWsUrl(): string {
  const env = import.meta.env?.VITE_AVATAR_WS_URL;
  if (typeof env === 'string' && env.trim()) return env.trim();
  return DEFAULT_AVATAR_WS_URL;
}

/** 是否运行在 Electron 桌面壳内（用于 user_input.context.app：desktop | web） */
export function isElectron(): boolean {
  return typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent);
}

/** user_input.context.app 取值：Electron 下为 desktop，否则 web */
export function getContextApp(): 'desktop' | 'web' {
  return isElectron() ? 'desktop' : 'web';
}
