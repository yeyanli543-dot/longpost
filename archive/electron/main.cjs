'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 严格校验 URL 协议，仅当以 https:// 或 http:// 开头时才调用 shell.openExternal
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  createWindow();

  // export:save-image 严格路径消毒
  ipcMain.handle('export:save-image', async (_event, payload = {}) => {
    const rawName = String(payload.defaultName || 'longpost-export.png');
    const sanitizedName = path.basename(rawName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

    const res = await dialog.showSaveDialog(mainWindow, {
      title: '保存长图',
      defaultPath: sanitizedName,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });

    if (res.canceled || !res.filePath) {
      return { ok: false, canceled: true };
    }

    try {
      const base64Data = (payload.dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(res.filePath, Buffer.from(base64Data, 'base64'));
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
});
