/**
 * Electron 预加载脚本：安全暴露桌面端 API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPlatform: () => ipcRenderer.invoke('electron:getPlatform'),
  readClipboardText: () => ipcRenderer.invoke('electron:readClipboardText'),
  getOptions: () => ipcRenderer.invoke('electron:getOptions'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('electron:setAlwaysOnTop', value),
  setClickThrough: (value) => ipcRenderer.invoke('electron:setClickThrough', value),
  setDockEdge: (edge) => ipcRenderer.invoke('electron:setDockEdge', edge),

  /** 供 hover 区域使用：鼠标进入时取消穿透，离开时恢复穿透（由前端根据 clickThrough 状态调用） */
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send('electron:setIgnoreMouseEvents', ignore, options),

  /** 拖拽 Avatar 时移动窗口 */
  moveWindow: (dx, dy) => ipcRenderer.send('electron:moveWindow', dx, dy),
});

/** Avatar 插件桥接 API */
contextBridge.exposeInMainWorld('avatarBridge', {
  getPluginStatus: () => ipcRenderer.invoke('avatar:pluginStatus'),
  getPluginCapabilities: () => ipcRenderer.invoke('avatar:pluginCapabilities'),
  setPluginCapabilities: (capabilities) =>
    ipcRenderer.invoke('avatar:pluginSetCapabilities', capabilities),
  setPluginGatewayUrl: (gatewayUrl) => ipcRenderer.invoke('avatar:pluginSetGatewayUrl', gatewayUrl),
  connectPlugin: () => ipcRenderer.invoke('avatar:pluginConnect'),
  disconnectPlugin: () => ipcRenderer.invoke('avatar:pluginDisconnect'),
  clearPluginPairing: () => ipcRenderer.invoke('avatar:pluginClearPairing'),
  onPluginEvent: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('avatar:pluginEvent', wrapped);
    return () => ipcRenderer.removeListener('avatar:pluginEvent', wrapped);
  },
  onPluginStatus: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('avatar:pluginStatus', wrapped);
    return () => ipcRenderer.removeListener('avatar:pluginStatus', wrapped);
  },
});
