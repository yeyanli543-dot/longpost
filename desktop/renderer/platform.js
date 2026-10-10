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
  const APP_VERSION = '1.0.0';

  if (!window.LPRepo || !window.LPIdbBackend) {
    window.LPPlatform = null;
    return;
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
      },
      // lp:// 已经由主进程注册的私有协议接管，渲染层不用管
      assetUrl: (url) => Promise.resolve(url),
      releaseAsset: () => {},
      releaseAllAssets: () => {},
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

  window.LPPlatform = Object.assign({}, repo, {
    isDesktop: false,
    platformLabel: '手机版',
    capabilities: {
      pickFiles: true,
      openDataDir: false,
      nativeSaveDialog: false,
      folderExport: false,
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
