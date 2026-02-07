/**
 * Electron Main Process Entry Point
 *
 * Cross-platform main process with platform-specific implementations
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as os from 'os';

const PLATFORM = os.platform(); // 'darwin', 'win32', 'linux'

let avatarWindow: BrowserWindow | null = null;

/**
 * Create the avatar window
 */
function createAvatarWindow(): void {
  // Platform-specific window configuration
  const windowConfig = {
    width: 300,
    height: 400,
    frame: false,           // 无边框
    transparent: true,      // 透明窗口
    alwaysOnTop: true,      // 置顶
    resizable: false,
    skipTaskbar: true,      // 不显示在任务栏
    webPreferences: {
      preload: `${__dirname}/preload/index.js`,
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  avatarWindow = new BrowserWindow(windowConfig);

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    avatarWindow.loadURL('http://localhost:5173');
    avatarWindow.webContents.openDevTools();
  } else {
    avatarWindow.loadFile('dist/renderer/index.html');
  }

  // Position window in bottom-right corner
  positionWindowBottomRight(avatarWindow);

  avatarWindow.on('closed', () => {
    avatarWindow = null;
  });
}

/**
 * Position window to bottom-right corner
 */
function positionWindowBottomRight(window: BrowserWindow): void {
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Calculate position (with margin)
  const margin = 20;
  const x = width - window.getBounds().width - margin;
  const y = height - window.getBounds().height - margin;

  window.setPosition(x, y);
}

/**
 * App lifecycle
 */
app.whenReady().then(() => {
  createAvatarWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAvatarWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (PLATFORM !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC handlers
 */
ipcMain.handle('set-state', (_event, { state, message }: { state: string; message: string }) => {
  if (avatarWindow) {
    avatarWindow.webContents.send('update-state', { state, message });
  }
  return { ok: true };
});

ipcMain.handle('minimize', () => {
  if (avatarWindow) {
    avatarWindow.minimize();
  }
  return { ok: true };
});

ipcMain.handle('quit', () => {
  app.quit();
  return { ok: true };
});
