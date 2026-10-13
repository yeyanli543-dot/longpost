'use strict';

/**
 * LongPost 桌面版 —— Electron 主进程
 *
 * 职责：建窗口、读写本机数据、附件导入、导出。
 * 这里没有任何网络请求，没有账号体系，所有数据都落在 app.getPath('userData') 下。
 */

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu, clipboard, nativeImage } = require('electron');
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

  const distHtml = path.join(__dirname, '..', 'dist', 'client', 'index.html');
  if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL('about:blank');
    console.error('[启动失败] 未检测到 dist/client/index.html，请先运行 npm run build:client 构建现代前端产物。');
  }

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

    // 自检失败必须体现在退出码上：以前这里吞掉异常照常 quit()，
    // CI 里截图失败也会被当成「通过」。
    let failed = false;

    if (SMOKE_SCRIPT) {
      try {
        const code = fs.readFileSync(SMOKE_SCRIPT, 'utf8');
        const result = await wc.executeJavaScript(code, true);
        console.log('SMOKE_SCRIPT_RESULT ' + JSON.stringify(result));
        if (typeof result === 'string' && result.startsWith('FAIL:')) {
          failed = true;
        }
      } catch (err) {
        failed = true;
        console.log('SMOKE_SCRIPT_ERROR ' + String(err && err.message ? err.message : err));
      }
      await new Promise((r) => setTimeout(r, 1800));
    }

    try {
      const image = await wc.capturePage();
      // 截图目录常常还不存在（例如默认的 .verify/）：
      // writeFileSync 不会建父目录，先补一刀，否则开箱就是 ENOENT。
      fs.mkdirSync(path.dirname(SMOKE_OUT), { recursive: true });
      fs.writeFileSync(SMOKE_OUT, image.toPNG());
      console.log('SMOKE_OK ' + SMOKE_OUT + ' (' + image.getSize().width + 'x' + image.getSize().height + ')');
    } catch (err) {
      failed = true;
      console.log('SMOKE_FAIL ' + String(err && err.message ? err.message : err));
    }
    if (failed) {
      console.log('SMOKE_EXIT 1');
      // 注意：Electron 里 `process.exitCode = 1` **管不了**最终退出码 —— app.quit()
      // 之后进程仍然是 0（实测：打印了 SMOKE_EXIT 1，`echo $?` 还是 0）。
      // 必须 app.exit(1) 才能让 CI 看到失败；同仓库 scripts/verify-export.js 就是这个写法。
      app.exit(1);
      return;
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
  // 排序方式由界面传进来（最近修改 / 创建时间 / 标题 / 字数），
  // 排序规则本身在 lib/repo.js 的 sortList 里，只有一个来源
  ipcMain.handle('articles:list', (_e, opts) => store.listArticles(opts));
  ipcMain.handle('articles:get', (_e, id) => store.getArticle(id));
  ipcMain.handle('articles:save', (_e, payload) => store.saveArticle(payload));
  ipcMain.handle('articles:delete', (_e, id) => store.deleteArticle(id));

  // 回收站。仓库层一直有这几个能力，但主进程之前没开通道，
  // 结果界面上「删除」就是永久的，这正是「装了跟没装差不多」的原因之一。
  ipcMain.handle('articles:trash', () => store.listTrash());
  ipcMain.handle('articles:restore', (_e, id) => store.restoreArticle(id));
  ipcMain.handle('articles:purge', (_e, id) => store.purgeArticle(id));

  // 置顶与标签
  ipcMain.handle('articles:pin', (_e, id) => store.togglePin(id));
  ipcMain.handle('articles:setTags', (_e, id, tags) => store.setTags(id, tags));
  ipcMain.handle('tags:list', () => store.listTags());

  // 历史版本
  ipcMain.handle('articles:revisions', (_e, id) => store.listRevisions(id));
  ipcMain.handle('articles:restoreRevision', (_e, id, index) => store.restoreRevision(id, index));

  // 诊断与提议通道（后台常驻监视提议落盘与跨端追踪）
  ipcMain.handle('proposals:get', (_e, id) => store.getProposals(id));
  ipcMain.handle('proposals:save', (_e, id, proposals) => store.saveProposals(id, proposals));
  ipcMain.handle('proposals:listUnresolved', () => store.listUnresolvedProposals());

  // 系统剪贴板图片写入
  ipcMain.handle('clipboard:writeImage', (_e, dataUrl) => {
    try {
      if (!dataUrl || typeof dataUrl !== 'string') {
        return { ok: false, error: '无效的图片数据' };
      }
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) {
        return { ok: false, error: '无法解析图片数据' };
      }
      clipboard.writeImage(image);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

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

  /**
   * 导入正文：把用户已有的 .md / .txt 读成一篇新文章。
   *
   * 只读用户在系统对话框里亲手选中的那一个文件，不做目录扫描，
   * 也不把文件路径交给渲染层 —— 渲染层拿到的只有标题和正文文字。
   */
  ipcMain.handle('article:import', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '导入 Markdown / 文本文件',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown / 文本', extensions: ['md', 'markdown', 'txt'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };

    const filePath = res.filePaths[0];
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return { error: '选中的不是一个文件' };
      if (stat.size > 20 * 1024 * 1024) return { error: '文件超过 20 MB，先精简一下再导入' };
      const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const base = path.basename(filePath).replace(/\.[^.]+$/, '');
      return { title: base || '导入的文章', content: content };
    } catch (err) {
      return { error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle('export:html', async (_e, id) => {
    const article = await store.getArticle(id);
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
    const article = await store.getArticle(id);
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
