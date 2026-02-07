"use strict";
/**
 * Electron Preload Script
 *
 * Exposes safe APIs to the renderer process
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    setState: (state, message) => electron_1.ipcRenderer.invoke('set-state', { state, message }),
    minimize: () => electron_1.ipcRenderer.invoke('minimize'),
    quit: () => electron_1.ipcRenderer.invoke('quit'),
    onUpdateState: (callback) => {
        electron_1.ipcRenderer.on('update-state', (_event, data) => callback(data));
    },
    platform: process.platform
});
