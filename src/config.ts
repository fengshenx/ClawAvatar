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

/**
 * 获取鉴权 token（V3/V4：连接 Adapter 时携带）
 * Electron：由主进程从环境变量 AVATAR_TOKEN 读取并经由 preload 暴露（异步）；Web：可选 VITE_AVATAR_TOKEN（同步）
 */
export async function getAvatarToken(): Promise<string | null> {
  if (isElectron() && typeof window !== 'undefined') {
    const bridge = (window as Window & { avatarBridge?: { getAvatarToken: () => Promise<string | null> } }).avatarBridge;
    if (bridge?.getAvatarToken) return bridge.getAvatarToken() ?? null;
  }
  const env = import.meta.env?.VITE_AVATAR_TOKEN;
  if (typeof env === 'string' && env.trim()) return env.trim();
  return null;
}
