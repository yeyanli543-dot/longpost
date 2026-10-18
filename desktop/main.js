'use strict';

/**
 * LongPost 桌面版 —— Electron 主进程
 *
 * 职责：建窗口、读写本机数据、附件导入、导出。
 * 除 WebDAV 同步与 AI 助手的出站请求外，不主动联网；没有账号体系，
 * 所有数据都落在 app.getPath('userData') 下。
 */

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const store = require('./lib/store');
const buildHtml = require('./lib/export-html');
const updater = require('./lib/updater');

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // F12 开 DevTools（排查问题用）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const rendererHtml = path.join(__dirname, 'renderer', 'index.html');
  mainWindow.loadFile(rendererHtml);

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


// ============================================================================
// AI 助手：在主进程发起请求
// ============================================================================
//
// 为什么不在渲染层直接 fetch：渲染层是 file:// 页面，跨域请求会被 CORS 拦掉，
// 而各家大模型的响应头并不统一（有的根本不让浏览器直连）。放在主进程里发，
// 既绕开 CORS，也不会把 API Key 暴露给页面上下文之外的任何地方。

/**
 * 把响应体转成一句话错误信息（最多带 300 字上游原文，够定位问题又不刷屏）。
 */
async function aiHttpError(res) {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    detail = '';
  }
  return 'HTTP ' + res.status + (detail ? '：' + detail : '');
}

/** 按行读取 body，逐行交给 onLine（Ollama 的 NDJSON 用它）。 */
async function aiConsumeLines(res, onLine) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) onLine(line);
    }
  }
  const tail = buf.trim();
  if (tail) onLine(tail);
}

/** 按 SSE 事件读取 body，把每个 data: 负载交给 onData（OpenAI / Gemini 用它）。 */
async function aiConsumeSse(res, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '').trim();
      buf = buf.slice(idx + 1);
      if (!line || line.startsWith(':') || line.startsWith('event:')) continue;
      if (!line.startsWith('data:')) continue;
      onData(line.slice(5).trim());
    }
  }
}

/**
 * 执行一次流式对话，边收边通过 onDelta 回调。
 * 支持三种协议：
 *   - openai：任何 OpenAI 兼容网关（DeepSeek、Moonshot、自建 one-api 等）
 *   - gemini：Google Generative Language API
 *   - ollama：本机 Ollama（http://127.0.0.1:11434）
 */
async function runAiChat(payload, onDelta, signal) {
  const provider = payload.provider || 'openai';
  const baseUrl = String(payload.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(payload.apiKey || '').trim();
  const model = String(payload.model || '').trim();
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  if (!baseUrl) throw new Error('还没有配置服务地址');
  if (!model) throw new Error('还没有配置模型名称');
  if (!messages.length) throw new Error('没有要发送的内容');

  // ---------------------------------------------------------------- Gemini
  if (provider === 'gemini') {
    if (!apiKey) throw new Error('Gemini 需要填写 API Key');
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url =
      baseUrl +
      '/v1beta/models/' +
      encodeURIComponent(model) +
      ':streamGenerateContent?alt=sse';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      }),
      signal,
    });
    if (!res.ok) throw new Error(await aiHttpError(res));

    let full = '';
    await aiConsumeSse(res, (data) => {
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        return;
      }
      const parts =
        json && json.candidates && json.candidates[0] && json.candidates[0].content
          ? json.candidates[0].content.parts || []
          : [];
      const text = parts.map((p) => p.text || '').join('');
      if (text) {
        full += text;
        onDelta(text);
      }
    });
    return full;
  }

  // ---------------------------------------------------------------- Ollama
  if (provider === 'ollama') {
    const res = await fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
    if (!res.ok) throw new Error(await aiHttpError(res));

    let full = '';
    await aiConsumeLines(res, (line) => {
      let json;
      try {
        json = JSON.parse(line);
      } catch {
        return;
      }
      const text = json && json.message && json.message.content;
      if (text) {
        full += text;
        onDelta(text);
      }
    });
    return full;
  }

  // ------------------------------------------------------- OpenAI 兼容协议
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

  const res = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
    }),
    signal,
  });
  if (!res.ok) throw new Error(await aiHttpError(res));

  let full = '';
  await aiConsumeSse(res, (data) => {
    if (data === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const text =
      json && json.choices && json.choices[0] && json.choices[0].delta
        ? json.choices[0].delta.content
        : '';
    if (text) {
      full += text;
      onDelta(text);
    }
  });
  return full;
}

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

  // WebDAV 跨设备同步通道（在主进程发起免除浏览器 CORS 限制）
  ipcMain.handle('webdav:request', async (_e, { url, method = 'GET', headers = {}, body = null }) => {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? require('node:https') : require('node:http');

        const reqHeaders = { ...headers };
        let payload = null;
        if (body !== null && body !== undefined) {
          payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
          if (!reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
            reqHeaders['Content-Length'] = payload.length;
          }
        }

        const options = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: method.toUpperCase(),
          headers: reqHeaders,
          timeout: 25000,
        };

        const req = client.request(options, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            const text = buf.toString('utf8');
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage || '',
              headers: res.headers,
              data: text,
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error('请求超时'));
        });

        req.on('error', (err) => {
          resolve({
            ok: false,
            status: 0,
            statusText: err.message,
            headers: {},
            data: '',
            error: err.message,
          });
        });

        if (payload) {
          req.write(payload);
        }
        req.end();
      } catch (err) {
        resolve({
          ok: false,
          status: 0,
          statusText: err.message,
          headers: {},
          data: '',
          error: err.message,
        });
      }
    });
  });


  // ---------------------------------------------------------------- AI 助手
  // 流式回传：每收到一段就发 ai:chunk 给渲染层，渲染层边收边渲染。
  const aiControllers = new Map();

  ipcMain.handle('ai:chat', async (event, payload = {}) => {
    const requestId = String(payload.requestId || Date.now());
    const controller = new AbortController();
    aiControllers.set(requestId, controller);

    const sender = event.sender;
    const send = (delta) => {
      if (sender.isDestroyed()) return;
      try {
        sender.send('ai:chunk', { requestId, delta });
      } catch {
        // 窗口已关，忽略
      }
    };

    try {
      const text = await runAiChat(payload, send, controller.signal);
      return { ok: true, requestId, text };
    } catch (err) {
      if (controller.signal.aborted) return { ok: false, requestId, aborted: true, error: '已取消' };
      return { ok: false, requestId, error: (err && err.message) || String(err) };
    } finally {
      aiControllers.delete(requestId);
    }
  });

  ipcMain.handle('ai:abort', (_e, requestId) => {
    const controller = aiControllers.get(String(requestId));
    if (controller) controller.abort();
    return true;
  });


  // ---------------------------------------------------------------- 应用内更新
  ipcMain.handle('update:check', async (_e, feed) => {
    try {
      const settings = await store.getSettings();
      const info = await updater.checkForUpdates({ feed: feed || settings.updateFeed || undefined });
      return { ok: true, info };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });

  ipcMain.handle('update:download', async (event, info) => {
    const sender = event.sender;
    try {
      const res = await updater.downloadUpdate(info, {
        onProgress: (received, total) => {
          if (sender.isDestroyed()) return;
          sender.send('update:progress', { received, total });
        },
      });
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });

  ipcMain.handle('update:install', async (_e, filePath) => {
    try {
      await updater.installUpdate(filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });

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

  ipcMain.handle('export:pdf', async (_e, { title, html, options = {} }) => {
    const suggested = (title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '导出为学术 PDF',
      defaultPath: `${suggested}.pdf`,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    let printWindow = null;
    try {
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((r) => setTimeout(r, 600));

      const pdfData = await printWindow.webContents.printToPDF({
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:9px;color:#888;width:100%;text-align:right;padding-right:20mm;"><span>${title || 'LongPost'}</span></div>`,
        footerTemplate: `<div style="font-size:9px;color:#888;width:100%;text-align:center;"><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        printBackground: true,
        margins: {
          top: 1.2,
          bottom: 1.2,
          left: 1,
          right: 1,
        },
        ...options,
      });

      fs.writeFileSync(res.filePath, pdfData);
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    } finally {
      if (printWindow) {
        printWindow.destroy();
      }
    }
  });

  ipcMain.handle('export:save-image', async (_e, payload = {}) => {
    const defaultName = path.basename(String(payload.defaultName || 'longpost-export.png')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '保存长图',
      defaultPath: defaultName,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const base64Data = (payload.dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(res.filePath, Buffer.from(base64Data, 'base64'));
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
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
