/**
 * 渲染层的平台门面。
 *
 * 界面代码只认 window.LPPlatform，不关心自己跑在 Electron 里还是手机 WebView 里：
 *   - 桌面：包一层 preload 暴露的 window.lp（数据在磁盘上）
 *   - 网页 / 手机：用 lib/repo.js + IndexedDB 后端就地实现同一套方法
 *
 * 两边的规则来自同一份 repo.js，所以排序、回收站、历史版本这些行为天然一致，
 * 不会出现「桌面能搜到、手机搜不到」这种分叉。
 *
 * 另外补了两个平台差异点：
 *   assetUrl(url)  把正文里的 lp://files/xxx 变成浏览器能显示的东西
 *   capabilities   告诉界面哪些功能这台设备上做不了（比如「打开数据目录」）
 */
(function () {
  'use strict';

  /** 跟 desktop/package.json 的 version 保持一致，自检里有断言盯着。 */
  const APP_VERSION = '3.4.0';

  if (!window.LPRepo || !window.LPIdbBackend) {
    const missing = [];
    if (!window.LPRepo) missing.push('LPRepo (vendor/repo.js)');
    if (!window.LPIdbBackend) missing.push('LPIdbBackend (backend-idb.js)');
    window.LPPlatformError = '缺少核心模块: ' + missing.join(', ');
    console.error('[LPPlatform]', window.LPPlatformError);
    window.LPPlatform = null;
    return;
  }

  // ------------------------------------------------------------ 分享 / 复制

  /** 有没有可用的系统分享面板（手机上才有）。 */
  function nativeShare() {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    return plugins && plugins.Share ? plugins.Share : null;
  }

  /**
   * 复制到剪贴板。
   *
   * navigator.clipboard 在 Electron 的 file:// 页面里可用（file: 属于可信来源），
   * 但某些 WebView / 非聚焦窗口会被拒绝，所以留一条 textarea + execCommand 的老路。
   */
  function copyToClipboard(text) {
    const value = String(text == null ? '' : text);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(value).then(
        () => ({ ok: true, mode: 'clipboard' }),
        () => legacyCopy(value),
      );
    }
    return Promise.resolve(legacyCopy(value));
  }

  function legacyCopy(value) {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, value.length);
      const done = document.execCommand('copy');
      ta.remove();
      return done ? { ok: true, mode: 'clipboard' } : { ok: false, error: '剪贴板不可用' };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  /**
   * 分享一段文字。
   *   - 手机（有 Capacitor Share 插件）：唤起系统分享面板，能直接发到微信 / 备忘录等
   *   - 桌面 / 网页：写进剪贴板
   * 两边返回同一种结构，界面代码不用分平台写两套。
   *
   * @param {{title?:string, text:string, dialogTitle?:string}} payload
   * @returns {Promise<{ok:boolean, mode?:'share'|'clipboard', canceled?:boolean, error?:string}>}
   */
  async function shareText(payload) {
    const title = (payload && payload.title) || 'LongPost';
    const text = String((payload && payload.text) || '');
    const dialogTitle = (payload && payload.dialogTitle) || title;

    const Share = nativeShare();
    if (Share) {
      try {
        await Share.share({ title: title, text: text, dialogTitle: dialogTitle });
        return { ok: true, mode: 'share' };
      } catch (err) {
        const msg = String((err && err.message) || err);
        if (msg.toLowerCase().indexOf('cancel') !== -1) return { ok: false, canceled: true };
        // 分享失败（比如插件在当前环境不可用）就退回剪贴板，不要让功能彻底断掉
      }
    }
    return copyToClipboard(text);
  }

  // ------------------------------------------------------------ 桌面
  if (window.lp && typeof window.lp.listArticles === 'function') {
    const desktop = window.lp;
    window.LPPlatform = Object.assign({}, desktop, {
      isDesktop: true,
      platformLabel: '桌面版',
      capabilities: {
        pickFiles: true,
        openDataDir: true,
        nativeSaveDialog: true,
        folderExport: true,
        share: false,
        clipboard: true,
      },
      // lp:// 已经由主进程注册的私有协议接管，渲染层不用管
      assetUrl: (url) => Promise.resolve(url),
      releaseAsset: () => {},
      releaseAllAssets: () => {},
      // 桌面版没有系统分享面板，但也没这个必要：剪贴板是更快的路径
      shareText: shareText,
      copyText: (text) => copyToClipboard(text),
      copyImage: (dataUrl) => desktop.writeImage(dataUrl),
    });
    return;
  }

  // ------------------------------------------------------------ 网页 / 手机
  const backend = window.LPIdbBackend.createIdbBackend();
  const repo = window.LPRepo.createRepo(backend);

  const objectUrls = new Map();

  function pickWithInput(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.multiple = !!multiple;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      document.body.appendChild(input);

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try {
          input.remove();
        } catch {
          /* 忽略 */
        }
        resolve(value);
      };

      input.addEventListener('change', () => {
        finish(Array.prototype.slice.call(input.files || []));
      });
      // 用户点「取消」时不会触发 change，靠焦点回到窗口兜一下
      window.addEventListener(
        'focus',
        () => {
          setTimeout(() => finish([]), 900);
        },
        { once: true },
      );

      input.click();
    });
  }

  async function importPicked(files) {
    const out = [];
    for (const f of files) {
      try {
        out.push(await repo.importFile(f));
      } catch (err) {
        out.push({ error: String((err && err.message) || err), name: f && f.name });
      }
    }
    return out;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        const comma = s.indexOf(',');
        resolve(comma === -1 ? '' : s.slice(comma + 1));
      };
      reader.onerror = () => reject(reader.error || new Error('读取失败'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 把导出的文件交到用户手上。
   *
   * Android WebView 里 <a download> 是不生效的（没有下载管理器接管），
   * 所以在手机上改用 Capacitor 的 Filesystem + Share：先写进缓存目录，
   * 再唤起系统分享面板，用户存下来或直接发出去都行。
   * 桌面浏览器没有 Capacitor，就走原来的 blob 下载。
   */
  async function saveFile(filename, blob) {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if (plugins && plugins.Filesystem && plugins.Share) {
      try {
        const base64 = await blobToBase64(blob);
        const written = await plugins.Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: 'CACHE',
          recursive: true,
        });
        await plugins.Share.share({
          title: filename,
          url: written.uri,
          files: [written.uri],
        });
        return { ok: true, path: filename + '（已交给系统分享）' };
      } catch (err) {
        // 分享被取消或插件不可用时，继续往下走 blob 下载
        if (String((err && err.message) || err).indexOf('cancel') !== -1) {
          return { ok: false, canceled: true };
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
      } catch {
        /* 忽略 */
      }
      URL.revokeObjectURL(url);
    }, 4000);
    return { ok: true, path: filename + '（已存到「下载」）' };
  }

  function safeFileName(name) {
    return String(name || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '未命名';
  }

  // ------------------------------------------------------------ AI（网页 / 手机）
  //
  // 桌面版由主进程代发请求（见 desktop/main.js 的 ai:chat），这里只处理
  // 网页 / 手机：没有 IPC 代理，只能自己 fetch。云端大模型多数会放行跨域，
  // 万一被浏览器拦下，错误信息会直接告诉用户改用桌面版，而不是静默失败。

  const aiAborters = new Map();
  const aiListeners = new Set();

  function aiEmit(data) {
    aiListeners.forEach((fn) => {
      try {
        fn(data);
      } catch {
        /* 单个监听器出错不影响其它 */
      }
    });
  }

  async function aiReadSse(res, onData) {
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

  async function aiReadLines(res, onLine) {
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

  async function aiChat(payload) {
    const requestId = String(payload.requestId || Date.now());
    const controller = new AbortController();
    aiAborters.set(requestId, controller);
    const delta = (text) => aiEmit({ requestId, delta: text });

    try {
      const baseUrl = String(payload.baseUrl || '').trim().replace(/\/+$/, '');
      const apiKey = String(payload.apiKey || '').trim();
      const model = String(payload.model || '').trim();
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      if (!baseUrl) throw new Error('还没有配置服务地址');
      if (!model) throw new Error('还没有配置模型名称');

      const provider = payload.provider || 'openai';
      let full = '';

      if (provider === 'gemini') {
        if (!apiKey) throw new Error('Gemini 需要填写 API Key');
        const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const contents = messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const res = await fetch(
          baseUrl + '/v1beta/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents, ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}) }),
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await aiReadSse(res, (data) => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            return;
          }
          const parts = (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
          const text = parts.map((p) => p.text || '').join('');
          if (text) {
            full += text;
            delta(text);
          }
        });
        return { ok: true, requestId, text: full };
      }

      if (provider === 'ollama') {
        const res = await fetch(baseUrl + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await aiReadLines(res, (line) => {
          let json;
          try {
            json = JSON.parse(line);
          } catch {
            return;
          }
          const text = json && json.message && json.message.content;
          if (text) {
            full += text;
            delta(text);
          }
        });
        return { ok: true, requestId, text: full };
      }

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
      const res = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await aiReadSse(res, (data) => {
        if (data === '[DONE]') return;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          return;
        }
        const text = json && json.choices && json.choices[0] && json.choices[0].delta ? json.choices[0].delta.content : '';
        if (text) {
          full += text;
          delta(text);
        }
      });
      return { ok: true, requestId, text: full };
    } catch (err) {
      if (controller.signal.aborted) return { ok: false, requestId, aborted: true, error: '已取消' };
      const msg = String((err && err.message) || err);
      const hint = /Failed to fetch|NetworkError|Load failed/i.test(msg)
        ? '（浏览器跨域限制，建议改用桌面版）'
        : '';
      return { ok: false, requestId, error: msg + hint };
    } finally {
      aiAborters.delete(requestId);
    }
  }

  function onAiChunk(handler) {
    aiListeners.add(handler);
    return () => aiListeners.delete(handler);
  }

  function aiAbort(requestId) {
    const controller = aiAborters.get(String(requestId));
    if (controller) controller.abort();
    return true;
  }

  window.LPPlatform = Object.assign({}, repo, {
    isDesktop: false,
    platformLabel: '手机版',
    bridgeInfo: async () => ({ enabled: false }),
    openExtensionDir: async () => ({ ok: false }),
    installSendTo: async () => ({ ok: false }),
    setBridgeEnabled: async () => ({ ok: false }),
    rotateBridgeToken: async () => ({ ok: false }),
    bridgeLog: async () => [],
    onClipped: () => () => {},
    aiChat: aiChat,
    onAiChunk: onAiChunk,
    aiAbort: aiAbort,
    capabilities: {
      pickFiles: true,
      openDataDir: false,
      nativeSaveDialog: false,
      folderExport: false,
      // 装没装 @capacitor/share 决定了「分享」是唤起系统面板还是复制到剪贴板
      share: !!nativeShare(),
      clipboard: true,
    },

    shareText: shareText,
    copyText: (text) => copyToClipboard(text),

    async copyImage(dataUrl) {
      try {
        const comma = dataUrl.indexOf(',');
        const raw = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
        const byteChars = atob(raw);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArray], { type: 'image/png' });
        const filename = 'chart-' + Date.now() + '.png';
        const res = await saveFile(filename, blob);
        return { ok: Boolean(res && res.ok), mode: 'share', path: res && res.path, error: res && res.error };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    },

    async pickFiles() {
      const files = await pickWithInput('', true);
      if (!files.length) return [];
      return importPicked(files);
    },

    async pickImages() {
      const files = await pickWithInput('image/*', true);
      if (!files.length) return [];
      return importPicked(files);
    },

    /**
     * 导入正文：手机 / 网页上没有系统「打开文件」对话框，用 <input type="file">
     * 选一个 Markdown / 文本文件，把文字读出来当新文章的正文。
     * 返回结构和桌面版保持一致，界面代码就不用分平台写两套。
     */
    async importArticle() {
      const files = await pickWithInput('.md,.markdown,.txt,text/markdown,text/plain', false);
      if (!files.length) return { canceled: true };
      const f = files[0];
      if (f.size > 20 * 1024 * 1024) return { error: '文件超过 20 MB，先精简一下再导入' };
      try {
        const text = await f.text();
        const base = String(f.name || '').replace(/\.[^.]+$/, '');
        return { title: base || '导入的文章', content: String(text).replace(/^\uFEFF/, '') };
      } catch (err) {
        return { error: String((err && err.message) || err) };
      }
    },

    /** 拖放进来的文件直接收下，跟点按钮选文件等价。 */
    importDropped(files) {
      return importPicked(Array.prototype.slice.call(files || []));
    },

    assetUrl(url) {
      const m = /^lp:\/\/files\/([A-Za-z0-9._-]+)$/.exec(String(url || ''));
      if (!m) return Promise.resolve(url);
      const stored = m[1];
      if (objectUrls.has(stored)) return Promise.resolve(objectUrls.get(stored));
      return backend.readFileBlob(stored).then((blob) => {
        if (!blob) return '';
        const objUrl = URL.createObjectURL(blob);
        objectUrls.set(stored, objUrl);
        return objUrl;
      });
    },

    releaseAsset(url) {
      const m = /^lp:\/\/files\/([A-Za-z0-9._-]+)$/.exec(String(url || ''));
      if (!m) return;
      const stored = m[1];
      const objUrl = objectUrls.get(stored);
      if (objUrl) {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {
          /* 忽略 */
        }
        objectUrls.delete(stored);
      }
    },

    releaseAllAssets() {
      for (const [, objUrl] of objectUrls) {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {
          /* 忽略 */
        }
      }
      objectUrls.clear();
    },

    async exportHtml(id) {
      const article = await repo.getArticle(id);
      if (!article) return { ok: false, error: '文章不存在' };
      const built = await window.LPExportWeb.buildSelfContained(article, {
        readFileBlob: (stored) => backend.readFileBlob(stored),
        listFiles: () => backend.listFiles(),
        echartsUrl: 'vendor/echarts.min.js',
      });
      if (!built.ok) return built;
      const saved = await saveFile(
        safeFileName(article.title) + '.html',
        new Blob([built.html], { type: 'text/html' }),
      );
      if (!saved.ok) return saved;
      const note =
        built.skipped && built.skipped.length
          ? '，另有 ' + built.skipped.length + ' 个较大的附件未打包'
          : '';
      return { ok: true, path: saved.path + note };
    },

    async exportMarkdown(id) {
      const article = await repo.getArticle(id);
      if (!article) return { ok: false, error: '文章不存在' };
      const body = '# ' + (article.title || '未命名') + '\n\n' + (article.content || '') + '\n';
      return saveFile(safeFileName(article.title) + '.md', new Blob([body], { type: 'text/markdown' }));
    },

    async exportJson(id) {
      const article = await repo.getArticle(id);
      if (!article) return { ok: false, error: '文章不存在' };
      const payload = { kind: 'longpost-article', version: 1, exportedAt: Date.now(), article };
      return saveFile(
        safeFileName(article.title) + '.longpost.json',
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      );
    },

    appInfo() {
      return Promise.resolve({
        version: APP_VERSION,
        platform: navigator.userAgent.indexOf('Android') !== -1 ? 'android' : 'web',
        dataDir: backend.dataDir(),
        filesDir: backend.filesDir(),
      });
    },

    openDataDir() {
      return Promise.resolve(false);
    },
  });
})();
