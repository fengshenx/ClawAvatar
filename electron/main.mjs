/**
 * Electron 主进程 - ClawAvatar 桌面端
 * 优先针对 macOS 优化：常驻、置顶、贴边吸附、点击穿透
 */
import { app, BrowserWindow, screen, ipcMain, Menu, clipboard } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { AvatarPluginClient } from './avatarPlugin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';
const isDev = process.env.ELECTRON_DEV === '1' || process.argv.includes('--dev');
const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === '1';

const WIN_WIDTH = 320;
const WIN_HEIGHT = 420;
const MARGIN = 20;
const SNAP_THRESHOLD = 24; // 距离边缘多少 px 内触发吸附

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {AvatarPluginClient | null} */
let avatarPluginClient = null;

/** 贴边：'left' | 'right' | 'top' | null */
let dockEdge = null;
let alwaysOnTop = true;
let clickThrough = false;

function getWorkArea() {
  const primary = screen.getPrimaryDisplay();
  return primary.workArea;
}

/** 获取完整屏幕边界（用于贴边定位） */
function getFullBounds() {
  const primary = screen.getPrimaryDisplay();
  return primary.bounds;
}

function createWindow() {
  const bounds = getFullBounds();
  const work = getWorkArea();
  const x = bounds.x + bounds.width - WIN_WIDTH - MARGIN;
  const y = bounds.y + bounds.height - WIN_HEIGHT - MARGIN;

  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop,
    resizable: false,
    hasShadow: isMac,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 贴边吸附：窗口移动结束后检查是否靠近边缘
  mainWindow.on('move', () => {
    if (!mainWindow) return;
    const [winX, winY] = mainWindow.getPosition();
    const work = getWorkArea();
    const w = mainWindow.getBounds().width;
    const h = mainWindow.getBounds().height;

    // 仅当未在拖拽中时做吸附（避免拖拽时频繁跳动）；Electron 无 move-end，用 debounce 模拟“移动结束”
    scheduleSnap();
  });

  let snapTimer = null;
  function scheduleSnap() {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      snapTimer = null;
      applyEdgeSnap();
    }, 150);
  }

  function applyEdgeSnap() {
    if (!mainWindow) return;
    const [winX, winY] = mainWindow.getPosition();
    const bounds = getFullBounds();
    const work = getWorkArea();
    const w = mainWindow.getBounds().width;
    const h = mainWindow.getBounds().height;

    let targetX = winX;
    let targetY = winY;
    let newEdge = null;

    // 优先检查左右（Mac 常见贴边）
    if (winX - bounds.x <= SNAP_THRESHOLD) {
      targetX = bounds.x;
      newEdge = 'left';
    } else if (bounds.x + bounds.width - (winX + w) <= SNAP_THRESHOLD) {
      targetX = bounds.x + bounds.width - w;
      newEdge = 'right';
    }

    // 顶部贴紧屏幕顶部（使用 bounds.y 而非 work.y，避免被菜单栏遮挡）
    if (bounds.y >= 0 && winY - bounds.y <= SNAP_THRESHOLD) {
      targetY = bounds.y;
      if (!newEdge) newEdge = 'top';
    }

    // 若已设置 dock 偏好，则强制贴该边
    if (dockEdge === 'left') {
      targetX = bounds.x;
      newEdge = 'left';
    } else if (dockEdge === 'right') {
      targetX = bounds.x + bounds.width - w;
      newEdge = 'right';
    } else if (dockEdge === 'top') {
      targetY = bounds.y;
      newEdge = 'top';
    } else if (dockEdge === null && newEdge != null) {
      // 用户拖到边缘则吸附
    }

    if (targetX !== winX || targetY !== winY) {
      mainWindow.setPosition(Math.round(targetX), Math.round(targetY));
    }
  }

  // 点击穿透状态
  updateClickThrough();

  return mainWindow;
}

function updateClickThrough() {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: clickThrough });
}

function updateMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: '视图',
      submenu: [
        {
          label: '始终置顶',
          type: 'checkbox',
          checked: alwaysOnTop,
          click: () => {
            alwaysOnTop = !alwaysOnTop;
            if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTop);
            updateMenu();
          },
        },
        {
          label: '点击穿透',
          type: 'checkbox',
          checked: clickThrough,
          click: () => {
            clickThrough = !clickThrough;
            updateClickThrough();
            updateMenu();
          },
        },
        { type: 'separator' },
        {
          label: '贴边',
          submenu: [
            {
              label: '无',
              type: 'radio',
              checked: dockEdge === null,
              click: () => {
                dockEdge = null;
                updateMenu();
              },
            },
            {
              label: '左侧',
              type: 'radio',
              checked: dockEdge === 'left',
              click: () => {
                dockEdge = 'left';
                if (mainWindow) {
                  const work = getWorkArea();
                  mainWindow.setPosition(work.x, mainWindow.getPosition()[1]);
                }
                updateMenu();
              },
            },
            {
              label: '右侧',
              type: 'radio',
              checked: dockEdge === 'right',
              click: () => {
                dockEdge = 'right';
                if (mainWindow) {
                  const work = getWorkArea();
                  const w = mainWindow.getBounds().width;
                  mainWindow.setPosition(work.x + work.width - w, mainWindow.getPosition()[1]);
                }
                updateMenu();
              },
            },
            {
              label: '顶部',
              type: 'radio',
              checked: dockEdge === 'top',
              click: () => {
                dockEdge = 'top';
                if (mainWindow) {
                  const work = getWorkArea();
                  mainWindow.setPosition(mainWindow.getPosition()[0], work.y);
                }
                updateMenu();
              },
            },
          ],
        },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    ...(isDev
      ? [
          {
            label: '开发',
            submenu: [
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
            ],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function broadcastAvatarStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('avatar:pluginStatus', status);
}

function broadcastAvatarEvent(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('avatar:pluginEvent', event);
}

// --------------- IPC ---------------
ipcMain.handle('electron:getPlatform', () => process.platform);
ipcMain.handle('electron:readClipboardText', () => clipboard.readText());

/** V4：渲染进程获取鉴权 token（从环境变量读取，由 Adapter/Gateway 校验） */
ipcMain.handle('avatar:getToken', () => process.env.AVATAR_TOKEN ?? null);
ipcMain.handle('avatar:pluginStatus', () => avatarPluginClient?.getStatus() ?? null);
ipcMain.handle('avatar:pluginCapabilities', () => avatarPluginClient?.getCapabilities() ?? null);
ipcMain.handle('avatar:pluginSetCapabilities', async (_, capabilities) => {
  if (!avatarPluginClient) return null;
  await avatarPluginClient.setCapabilities(capabilities);
  return avatarPluginClient.getStatus();
});
ipcMain.handle('avatar:pluginConnect', async () => {
  if (!avatarPluginClient) return null;
  return avatarPluginClient.connect();
});
ipcMain.handle('avatar:pluginPair', async (_, bootstrapToken) => {
  if (!avatarPluginClient) return null;
  return avatarPluginClient.pair(bootstrapToken);
});
ipcMain.handle('avatar:pluginDisconnect', async () => {
  if (!avatarPluginClient) return null;
  await avatarPluginClient.disconnect();
  return avatarPluginClient.getStatus();
});
ipcMain.handle('avatar:pluginClearPairing', async () => {
  if (!avatarPluginClient) return null;
  await avatarPluginClient.clearPairing();
  return avatarPluginClient.getStatus();
});

ipcMain.handle('electron:getOptions', () => ({
  alwaysOnTop,
  clickThrough,
  dockEdge,
}));

ipcMain.handle('electron:setAlwaysOnTop', (_, value) => {
  alwaysOnTop = !!value;
  if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTop);
  updateMenu();
});

ipcMain.handle('electron:setClickThrough', (_, value) => {
  clickThrough = !!value;
  updateClickThrough();
  updateMenu();
});

ipcMain.handle('electron:setDockEdge', (_, edge) => {
  dockEdge = edge; // 'left' | 'right' | 'top' | null
  if (mainWindow && edge) {
    const bounds = getFullBounds();
    const [wx, wy] = mainWindow.getPosition();
    const w = mainWindow.getBounds().width;
    const h = mainWindow.getBounds().height;
    if (edge === 'left') mainWindow.setPosition(bounds.x, wy);
    else if (edge === 'right') mainWindow.setPosition(bounds.x + bounds.width - w, wy);
    else if (edge === 'top') mainWindow.setPosition(wx, bounds.y);
  }
  updateMenu();
});

// 渲染进程请求"忽略鼠标"（用于 hover 时临时穿透）
ipcMain.on('electron:setIgnoreMouseEvents', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(ignore, options || { forward: true });
});

// 拖拽 Avatar 时移动窗口
ipcMain.on('electron:moveWindow', (event, dx, dy) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  }
});

// --------------- App lifecycle ---------------
app.whenReady().then(() => {
  avatarPluginClient = new AvatarPluginClient({
    app,
    onEvent: (event) => broadcastAvatarEvent(event),
    onStatus: (status) => broadcastAvatarStatus(status),
  });
  createWindow();
  updateMenu();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  await avatarPluginClient?.disconnect();
});
