"use strict";
/**
 * Electron Main Process Entry Point
 *
 * Cross-platform main process with platform-specific implementations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const os = __importStar(require("os"));
const PLATFORM = os.platform(); // 'darwin', 'win32', 'linux'
let avatarWindow = null;
/**
 * Create the avatar window
 */
function createAvatarWindow() {
    // Platform-specific window configuration
    const windowConfig = {
        width: 300,
        height: 400,
        frame: false, // 无边框
        transparent: true, // 透明窗口
        alwaysOnTop: true, // 置顶
        resizable: false,
        skipTaskbar: true, // 不显示在任务栏
        webPreferences: {
            preload: `${__dirname}/preload/index.js`,
            contextIsolation: true,
            nodeIntegration: false
        }
    };
    avatarWindow = new electron_1.BrowserWindow(windowConfig);
    // Load the renderer
    if (process.env.NODE_ENV === 'development') {
        avatarWindow.loadURL('http://localhost:5173');
        avatarWindow.webContents.openDevTools();
    }
    else {
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
function positionWindowBottomRight(window) {
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
electron_1.app.whenReady().then(() => {
    createAvatarWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createAvatarWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    // On macOS, keep app running even when all windows are closed
    if (PLATFORM !== 'darwin') {
        electron_1.app.quit();
    }
});
/**
 * IPC handlers
 */
electron_1.ipcMain.handle('set-state', (_event, { state, message }) => {
    if (avatarWindow) {
        avatarWindow.webContents.send('update-state', { state, message });
    }
    return { ok: true };
});
electron_1.ipcMain.handle('minimize', () => {
    if (avatarWindow) {
        avatarWindow.minimize();
    }
    return { ok: true };
});
electron_1.ipcMain.handle('quit', () => {
    electron_1.app.quit();
    return { ok: true };
});
