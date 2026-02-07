/**
 * Electron 预加载脚本：安全暴露桌面端 API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPlatform: () => ipcRenderer.invoke('electron:getPlatform'),
  getOptions: () => ipcRenderer.invoke('electron:getOptions'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('electron:setAlwaysOnTop', value),
  setClickThrough: (value) => ipcRenderer.invoke('electron:setClickThrough', value),
  setDockEdge: (edge) => ipcRenderer.invoke('electron:setDockEdge', edge),

  /** 供 hover 区域使用：鼠标进入时取消穿透，离开时恢复穿透（由前端根据 clickThrough 状态调用） */
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send('electron:setIgnoreMouseEvents', ignore, options),
});

/** V4：OpenClaw Channel 鉴权 token（主进程从 AVATAR_TOKEN 环境变量读取） */
contextBridge.exposeInMainWorld('avatarBridge', {
  getAvatarToken: () => ipcRenderer.invoke('avatar:getToken'),
});
