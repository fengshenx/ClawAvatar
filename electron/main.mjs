/**
 * Electron 主进程 - ClawAvatar 桌面端
 * 优先针对 macOS 优化：常驻、置顶、贴边吸附、点击穿透
 */
import { app, BrowserWindow, screen, ipcMain, Menu, clipboard, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { AvatarPluginClient } from './avatarPlugin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';
const isDev = process.env.ELECTRON_DEV === '1' || process.argv.includes('--dev');
const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === '1' || process.env.ELECTRON_DEV === '1';
const useTransparentWindow = process.env.ELECTRON_OPAQUE !== '1';

const WIN_WIDTH = 320;
const WIN_HEIGHT = 720;
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

// --------------- Custom Protocol ---------------
// 注册 electron-local:// 协议来绕过 file:// 的 CORS 限制
const localProtocol = 'electron-local';
const distPath = path.join(__dirname, '../dist');

protocol.registerSchemesAsPrivileged([
  {
    scheme: localProtocol,
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
// ------------------------------------------------

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
    transparent: useTransparentWindow,
    backgroundColor: useTransparentWindow ? '#00000000' : '#0f172a',
    alwaysOnTop,
    resizable: false,
    hasShadow: isMac && useTransparentWindow,
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

ipcMain.handle('avatar:pluginStatus', () => avatarPluginClient?.getStatus() ?? null);
ipcMain.handle('avatar:pluginCapabilities', () => avatarPluginClient?.getCapabilities() ?? null);
ipcMain.handle('avatar:pluginSetCapabilities', async (_, capabilities) => {
  if (!avatarPluginClient) return null;
  await avatarPluginClient.setCapabilities(capabilities);
  return avatarPluginClient.getStatus();
});
ipcMain.handle('avatar:pluginSetGatewayUrl', (_, gatewayUrl) => {
  if (!avatarPluginClient) return null;
  return avatarPluginClient.setGatewayUrl(gatewayUrl);
});
ipcMain.handle('avatar:pluginConnect', async () => {
  if (!avatarPluginClient) return null;
  return avatarPluginClient.connect();
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

// 检查插件是否已安装
ipcMain.handle('avatar:checkExtensionInstalled', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, '.openclaw/extensions/avatar');

  return fs.existsSync(targetDir);
});

// 安装插件到 OpenClaw（异步，不阻塞UI）
ipcMain.handle('avatar:installExtension', async (event) => {
  const { exec } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const sendProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('avatar:installProgress', progress);
    }
  };

  try {
    // 插件源路径（打包在 app 内）
    const extensionSource = path.join(__dirname, '../extensions/avatar');

    // 目标路径（跨平台）
    const homeDir = os.homedir();
    const targetDir = path.join(homeDir, '.openclaw/extensions/avatar');

    // 检查插件是否存在
    if (!fs.existsSync(extensionSource)) {
      sendProgress({ status: 'error', message: '插件文件不存在，请确保使用的是打包版本。' });
      return {
        success: false,
        error: '插件文件不存在，请确保使用的是打包版本。',
      };
    }

    sendProgress({ status: 'progress', message: '正在创建目标目录...', progress: 10 });

    // 创建目标目录
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });

    sendProgress({ status: 'progress', message: '正在删除旧版本...', progress: 20 });

    // 如果已存在，先删除
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    sendProgress({ status: 'progress', message: '正在复制插件文件...', progress: 40 });

    // 复制插件文件
    fs.cpSync(extensionSource, targetDir, { recursive: true });

    // 安装依赖（如果 package.json 存在）
    const packageJsonPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      sendProgress({ status: 'progress', message: '正在安装依赖...', progress: 60 });

      await new Promise((resolve, reject) => {
        exec('npm install', { cwd: targetDir, stdio: 'pipe' }, (error, stdout, stderr) => {
          if (error) {
            console.log('Warning: npm install failed, but continuing...', error.message);
          }
          resolve();
        });
      });
    }

    sendProgress({ status: 'progress', message: '正在启用插件...', progress: 80 });

    // 尝试启用插件（如果 openclaw CLI 在 PATH 中）
    const enableResult = await new Promise((resolve) => {
      exec('openclaw plugins install ' + targetDir, { stdio: 'pipe' }, (error1, stdout1, stderr1) => {
        exec('openclaw plugins enable avatar', { stdio: 'pipe' }, (error2, stdout2, stderr2) => {
          resolve({ error1, error2 });
        });
      });
    });

    sendProgress({ status: 'progress', message: '安装完成！', progress: 100 });

    if (enableResult.error1 || enableResult.error2) {
      // openclaw CLI 可能不在 PATH 中
      return {
        success: true,
        message: '插件已安装！请运行：openclaw gateway restart',
        targetDir,
        needsManualEnable: true,
      };
    }

    return {
      success: true,
      message: '✅ 插件安装成功！请运行：openclaw gateway restart',
      targetDir,
    };
  } catch (error) {
    sendProgress({ status: 'error', message: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
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
  // 注册本地协议（必须在 app ready 后调用）
  protocol.registerFileProtocol(localProtocol, (request, callback) => {
    const url = request.url.replace(`${localProtocol}://`, '');
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      // 非法编码时回退原始 URL，避免协议处理直接中断
    }
    // 开发模式使用 public 目录，生产模式使用 dist 目录
    const basePath = isDev ? path.join(__dirname, '../public') : distPath;
    const filePath = path.join(basePath, decodedUrl.replace(/^\/+/, ''));
    callback(filePath);
  });

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
