/**
 * Shared Type Definitions
 *
 * Types shared between Electron main, preload, and renderer
 */

export type AvatarState = 'idle' | 'working' | 'thinking' | 'happy' | 'sleeping';

export interface OpenClawMessage {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  event?: string;
  params?: any;
  payload?: any;
  ok?: boolean;
  error?: string;
}

export interface AvatarStatus {
  state: AvatarState;
  message: string;
  timestamp: number;
}

export interface ElectronAPI {
  setState: (state: string, message: string) => Promise<{ ok: boolean }>;
  minimize: () => Promise<{ ok: boolean }>;
  quit: () => Promise<{ ok: boolean }>;
  onUpdateState: (callback: (data: { state: string; message: string }) => void) => void;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
