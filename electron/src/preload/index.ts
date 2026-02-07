/**
 * Electron Preload Script
 *
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  setState: (state: string, message: string) =>
    ipcRenderer.invoke('set-state', { state, message }),

  minimize: () =>
    ipcRenderer.invoke('minimize'),

  quit: () =>
    ipcRenderer.invoke('quit'),

  onUpdateState: (callback: (data: { state: string; message: string }) => void) => {
    ipcRenderer.on('update-state', (_event, data) => callback(data));
  },

  platform: process.platform
});
