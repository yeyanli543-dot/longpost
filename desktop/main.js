'use strict';

/**
 * LongPost 桌面版 —— Electron 主进程
 *
 * 职责：建窗口、读写本机数据、附件导入、导出。
 * 这里没有任何网络请求，没有账号体系，所有数据都落在 app.getPath('userData') 下。
 */

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const store = require('./lib/store');
const buildHtml = require('./lib/export-html');

app.setName('LongPost');

let mainWindow = null;

/**
 * 自检开关（测试用，删掉不影响功能）：
 *   electron . --smoke=/tmp/shot.png
 * 界面加载完成后截一张图存到指定路径，把渲染进程的 console 打到终端，然后退出。
 * 用于在没有人盯着屏幕的环境里确认界面确实渲染出来了。
 */
const SMOKE_OUT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--smoke='));
  return arg ? arg.slice('--smoke='.length) : null;
})();

/** 自检时可选：截图前先在渲染层跑一段脚本（用来模拟点按钮、打字）。 */
const SMOKE_SCRIPT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--smoke-script='));
  return arg ? arg.slice('--smoke-script='.length) : null;
})();

/**
 * 注册私有协议 lp://。
 * 预览区里，附件统一写成 lp://files/<stored>，由主进程映射到本机数据目录，
 * 这样渲染层永远拿不到任意路径的读取能力。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lp',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** 把相对路径限制在 base 目录内，阻止 ../ 逃逸。 */
function safeResolve(base, rel) {
  const abs = path.resolve(base, rel);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (!abs.startsWith(prefix)) return null;
  return abs;
}

function registerLpProtocol() {
  const base = store.dataDir();
  protocol.handle('lp', async (request) => {
    try {
      const url = new URL(request.url);
      // lp://files/xxx.png  ->  hostname "files"，pathname "/xxx.png"
      const rel = decodeURIComponent(url.hostname + url.pathname);
      const abs = safeResolve(base, rel);
      if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
      }
      return net.fetch(pathToFileURL(abs).toString());
    } catch {
      return new Response('Bad Request', { status: 400, headers: { 'content-type': 'text/plain' } });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 940,
    minHeight: 600,
    title: 'LongPost',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // F12 开 DevTools（排查问题用）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE_OUT) attachSmokeHooks();
}

/** 自检：把渲染进程的日志转出来，等界面稳定后截图再退出。 */
function attachSmokeHooks() {
  const wc = mainWindow.webContents;

  wc.on('console-message', (...args) => {
    const d = args[1];
    if (d && typeof d === 'object' && 'message' in d) {
      console.log('[渲染层:' + d.level + '] ' + d.message);
    } else {
      console.log('[渲染层:' + args[1] + '] ' + args[2]);
    }
  });

  wc.on('render-process-gone', (_e, details) => {
    console.log('[渲染进程崩溃] ' + JSON.stringify(details));
  });

  wc.on('did-fail-load', (_e, code, desc) => {
    console.log('[加载失败] ' + code + ' ' + desc);
  });

  wc.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 2500));

    if (SMOKE_SCRIPT) {
      try {
        const code = fs.readFileSync(SMOKE_SCRIPT, 'utf8');
        const result = await wc.executeJavaScript(code, true);
        console.log('SMOKE_SCRIPT_RESULT ' + JSON.stringify(result));
      } catch (err) {
        console.log('SMOKE_SCRIPT_ERROR ' + String(err && err.message ? err.message : err));
      }
      await new Promise((r) => setTimeout(r, 1800));
    }

    try {
      const image = await wc.capturePage();
      fs.writeFileSync(SMOKE_OUT, image.toPNG());
      console.log('SMOKE_OK ' + SMOKE_OUT + ' (' + image.getSize().width + 'x' + image.getSize().height + ')');
    } catch (err) {
      console.log('SMOKE_FAIL ' + String(err && err.message ? err.message : err));
    }
    app.quit();
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];

  if (isMac) {
    template.push({ role: 'appMenu' });
  }

  template.push({
    label: '文件',
    submenu: [
      {
        label: '打开数据目录',
        click: () => shell.openPath(store.dataDir()),
      },
      { type: 'separator' },
      isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
    ],
  });

  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' },
    ],
  });

  template.push({
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('articles:list', () => store.listArticles());
  ipcMain.handle('articles:get', (_e, id) => store.getArticle(id));
  ipcMain.handle('articles:save', (_e, payload) => store.saveArticle(payload));
  ipcMain.handle('articles:delete', (_e, id) => store.deleteArticle(id));

  ipcMain.handle('files:pick', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择要附加的文件',
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled || !res.filePaths.length) return [];
    return res.filePaths.map((p) => store.importFile(p));
  });

  ipcMain.handle('files:pickImage', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    });
    if (res.canceled || !res.filePaths.length) return [];
    return res.filePaths.map((p) => store.importFile(p));
  });

  ipcMain.handle('files:list', () => store.listFiles());

  ipcMain.handle('export:html', async (_e, id) => {
    const article = store.getArticle(id);
    if (!article) return { ok: false, error: '文章不存在' };

    const suggested = (article.title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '导出为 HTML',
      defaultPath: `${suggested}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    try {
      const outDir = path.dirname(res.filePath);
      const base = path.basename(res.filePath, '.html');
      const assetDir = path.join(outDir, `${base}.files`);
      const { html, files } = buildHtml(article, store.filesDir(), `${base}.files`);

      if (files.length) {
        fs.mkdirSync(assetDir, { recursive: true });
        for (const f of files) {
          fs.copyFileSync(path.join(store.filesDir(), f.stored), path.join(assetDir, f.stored));
        }
      }
      fs.writeFileSync(res.filePath, html, 'utf8');
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle('export:markdown', async (_e, id) => {
    const article = store.getArticle(id);
    if (!article) return { ok: false, error: '文章不存在' };
    const suggested = (article.title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '导出为 Markdown',
      defaultPath: `${suggested}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const body = `# ${article.title}\n\n${article.content}\n`;
      fs.writeFileSync(res.filePath, body, 'utf8');
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: store.dataDir(),
    filesDir: store.filesDir(),
    platform: process.platform,
  }));

  ipcMain.handle('app:openDataDir', async () => {
    await shell.openPath(store.dataDir());
    return true;
  });

  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (_e, patch) => store.setSettings(patch));
}

// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  registerLpProtocol();
  buildMenu();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
