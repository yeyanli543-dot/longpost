/**
 * 仓库层的「IndexedDB 后端」—— 给网页 / 手机（Capacitor）用。
 *
 * 刻意跟磁盘后端保持同一个形状：文章集合和设置都是「整份读、整份写」，
 * 一一对应桌面上的 articles.json / settings.json。这样同一篇文章在两端
 * 的表现完全一样，也方便以后做桌面 ⇄ 手机的文件互导。
 *
 * 附件按单条记录存 Blob，键名仍然是 lp://files/<stored>，正文不用改。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LPIdbBackend = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'longpost';
  const DB_VERSION = 1;
  const KV = 'kv';
  const FILES = 'files';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('这个环境没有 IndexedDB，无法保存数据'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'stored' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('打不开本地数据库'));
      req.onblocked = () => reject(new Error('本地数据库被另一个窗口占用'));
    });
  }

  function createIdbBackend() {
    let dbPromise = null;

    function db() {
      if (!dbPromise) dbPromise = openDb();
      return dbPromise;
    }

    function tx(store, mode, run) {
      return db().then(
        (d) =>
          new Promise((resolve, reject) => {
            const t = d.transaction(store, mode);
            const os = t.objectStore(store);
            let result;
            try {
              result = run(os);
            } catch (err) {
              reject(err);
              return;
            }
            t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
            t.onerror = () => reject(t.error || new Error('本地数据库写入失败'));
            t.onabort = () => reject(t.error || new Error('本地数据库写入被中断'));
          }),
      );
    }

    function get(store, key) {
      return db().then(
        (d) =>
          new Promise((resolve, reject) => {
            const t = d.transaction(store, 'readonly');
            const req = t.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
            req.onerror = () => reject(req.error);
          }),
      );
    }

    function put(store, value) {
      return db().then(
        (d) =>
          new Promise((resolve, reject) => {
            const t = d.transaction(store, 'readwrite');
            t.objectStore(store).put(value);
            t.oncomplete = () => resolve(value);
            t.onerror = () => reject(t.error || new Error('本地数据库写入失败'));
            t.onabort = () => reject(t.error || new Error('本地数据库写入被中断'));
          }),
      );
    }

    function all(store) {
      return db().then(
        (d) =>
          new Promise((resolve, reject) => {
            const t = d.transaction(store, 'readonly');
            const req = t.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
          }),
      );
    }

    function del(store, key) {
      return db().then(
        (d) =>
          new Promise((resolve, reject) => {
            const t = d.transaction(store, 'readwrite');
            t.objectStore(store).delete(key);
            t.oncomplete = () => resolve(true);
            t.onerror = () => reject(t.error || new Error('删除失败'));
          }),
      );
    }

    return {
      dataDir() {
        return '本机浏览器存储（IndexedDB）';
      },
      filesDir() {
        return '本机浏览器存储（IndexedDB）';
      },

      async readArticles() {
        const rec = await get(KV, 'articles');
        const arr = rec && rec.value;
        return Array.isArray(arr) ? arr : [];
      },
      writeArticles(list) {
        return put(KV, { key: 'articles', value: list });
      },

      async readSettings() {
        const rec = await get(KV, 'settings');
        return rec && rec.value && typeof rec.value === 'object' ? rec.value : {};
      },
      writeSettings(obj) {
        return put(KV, { key: 'settings', value: obj });
      },

      /** ref 是浏览器里的 File 对象（来自 <input type=file> 或拖放）。 */
      async importFile(file) {
        if (!file) throw new Error('没有拿到文件');
        const stored = storedNameFor(file.name);
        const blob = file instanceof Blob ? file : new Blob([file]);
        const rec = {
          stored,
          name: file.name || stored,
          size: typeof blob.size === 'number' ? blob.size : 0,
          isImage: isImageName(file.name || stored),
          blob,
        };
        await put(FILES, rec);
        return {
          name: rec.name,
          stored,
          size: rec.size,
          isImage: rec.isImage,
          url: 'lp://files/' + stored,
        };
      },

      async listFiles() {
        const rows = await all(FILES);
        return rows
          .map((r) => ({
            stored: r.stored,
            size: r.size || 0,
            isImage: !!r.isImage,
            name: r.name || r.stored,
            url: 'lp://files/' + r.stored,
          }))
          .sort((a, b) => a.stored.localeCompare(b.stored));
      },

      async readFileBlob(stored) {
        const rec = await get(FILES, stored);
        return rec && rec.blob ? rec.blob : null;
      },

      async deleteFile(stored) {
        try {
          await del(FILES, stored);
          return true;
        } catch {
          return false;
        }
      },

      async fileSize(stored) {
        const rec = await get(FILES, stored);
        return rec && rec.size ? rec.size : 0;
      },

      /** 只给测试 / 维护用：清空整个本地库。 */
      async wipe() {
        await put(KV, { key: 'articles', value: [] });
        for (const row of await all(FILES)) await del(FILES, row.stored);
      },
    };
  }

  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'];

  function isImageName(name) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
    return !!m && IMAGE_EXTS.indexOf(m[1].toLowerCase()) !== -1;
  }

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256);
    let out = '';
    for (let i = 0; i < arr.length; i += 1) out += arr[i].toString(16).padStart(2, '0');
    return out;
  }

  function storedNameFor(originalName) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(originalName || ''));
    const ext = m ? '.' + m[1].toLowerCase() : '';
    return Date.now().toString(36) + '-' + randomHex(4) + ext;
  }

  return { createIdbBackend, isImageName, storedNameFor };
});
