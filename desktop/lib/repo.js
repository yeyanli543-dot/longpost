/**
 * 与平台无关的数据层。
 *
 * 为什么要有这一层：桌面版跑在 Electron 里（数据是磁盘上的 JSON + 文件），
 * 手机版跑在 WebView 里（数据是 IndexedDB）。如果把业务逻辑写在各自那一边，
 * 两边迟早会长得不一样 —— 同一篇文章在桌面能搜到、在手机搜不到这种事就会发生。
 *
 * 所以：所有「文章怎么排序、回收站怎么算、什么算一次历史版本」这类规则全部写在
 * 这里，只把最原始的读写动作交给注入进来的 backend：
 *
 *   readArticles() / writeArticles(list)      文章集合
 *   readSettings() / writeSettings(obj)       界面设置
 *   importFile(ref)                           把一个文件收进仓库
 *   listFiles()                               仓库里有哪些文件
 *   readFileBlob(stored)                      取回文件内容
 *   dataDir() / filesDir()                    给用户看的路径
 *
 * 这个文件要同时被 Node（require）和浏览器（script 标签）加载，所以用双模写法。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LPRepo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'];
  /** 每篇文章最多留几个历史版本。 */
  const MAX_REVISIONS = 20;
  /** 距上一个版本不足这个间隔的连续修改合并掉，不然敲几个字就存一版。 */
  const REVISION_MIN_GAP = 5 * 60 * 1000;
  /** 一句话里超过这个长度就不再进列表，避免手机端内存被拖垮。 */
  const SEARCH_LIMIT = 20000;
  const MAX_TAGS = 12;

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < bytes; i += 1) arr[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < arr.length; i += 1) out += arr[i].toString(16).padStart(2, '0');
    return out;
  }

  function newId() {
    return 'a' + Date.now().toString(36) + randomHex(3);
  }

  function defaultSettings() {
    return {
      theme: 'dark',
      lastArticleId: '',
      showPreview: true,
      sidebarWidth: 280,
      sort: 'updated',
      readingMode: false,
      fontSize: 16,
    };
  }

  function extOf(name) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function isImageName(name) {
    return IMAGE_EXTS.indexOf(extOf(name)) !== -1;
  }

  /** 生成只含小写字母数字的安全文件名，避开大小写与路径问题。 */
  function storedName(originalName) {
    const ext = extOf(originalName);
    return Date.now().toString(36) + '-' + randomHex(4) + (ext ? '.' + ext : '');
  }

  /** 从正文里抽一段纯文本做摘要（去掉图表围栏与 Markdown 记号）。 */
  function makeSummary(content) {
    return String(content || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function normalizeTags(input) {
    if (!Array.isArray(input)) return [];
    const seen = [];
    for (const raw of input) {
      const t = String(raw == null ? '' : raw)
        .replace(/^#/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) continue;
      if (t.length > 24) continue;
      if (seen.indexOf(t) === -1) seen.push(t);
      if (seen.length >= MAX_TAGS) break;
    }
    return seen;
  }

  function countCharts(content) {
    return (String(content || '').match(/^```chart\s*$/gm) || []).length;
  }

  /** 估个阅读时长：中文按 400 字/分钟，英文按 200 词/分钟，取较快的一侧。 */
  function readingMinutes(content) {
    const text = String(content || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
    const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
    const latin = (text.match(/[A-Za-z0-9']+/g) || []).length;
    const minutes = cjk / 400 + latin / 200;
    return Math.max(1, Math.round(minutes));
  }

  function toListItem(a) {
    const content = String(a.content || '');
    return {
      id: a.id,
      title: a.title || '未命名',
      summary: a.summary || '',
      tags: normalizeTags(a.tags),
      chars: content.length,
      charts: countCharts(content),
      minutes: readingMinutes(content),
      pinnedAt: a.pinnedAt || 0,
      revisionCount: Array.isArray(a.history) ? a.history.length : 0,
      createdAt: a.createdAt || 0,
      updatedAt: a.updatedAt || 0,
      // 列表里的搜索用的是这份预先算好的小写文本，避免每次输入都重扫全部正文
      searchText: (String(a.title || '') + '\n' + content).slice(0, SEARCH_LIMIT).toLowerCase(),
    };
  }

  function sortList(list, sort) {
    const arr = list.slice();
    const pinnedFirst = (x, y) => (y.pinnedAt ? 1 : 0) - (x.pinnedAt ? 1 : 0);
    if (sort === 'created') {
      arr.sort((x, y) => pinnedFirst(x, y) || (y.createdAt || 0) - (x.createdAt || 0));
    } else if (sort === 'title') {
      arr.sort(
        (x, y) =>
          pinnedFirst(x, y) ||
          String(x.title || '').localeCompare(String(y.title || ''), 'zh-Hans-CN'),
      );
    } else if (sort === 'chars') {
      arr.sort((x, y) => pinnedFirst(x, y) || (y.chars || 0) - (x.chars || 0));
    } else {
      arr.sort((x, y) => pinnedFirst(x, y) || (y.updatedAt || 0) - (x.updatedAt || 0));
    }
    return arr;
  }

  function createRepo(backend) {
    // ------------------------------------------------------------ 文章

    async function readAll() {
      const arr = await backend.readArticles();
      return Array.isArray(arr) ? arr : [];
    }

    async function writeAll(list) {
      await backend.writeArticles(list);
      return list;
    }

    async function listArticles(options) {
      const opts = options || {};
      const all = await readAll();
      const live = all.filter((a) => !a.deletedAt);
      return sortList(live.map(toListItem), opts.sort);
    }

    async function listTrash() {
      const all = await readAll();
      return all
        .filter((a) => a.deletedAt)
        .map((a) => {
          const item = toListItem(a);
          item.deletedAt = a.deletedAt;
          return item;
        })
        .sort((x, y) => (y.deletedAt || 0) - (x.deletedAt || 0));
    }

    async function getArticle(id) {
      const found = (await readAll()).find((a) => a.id === id);
      if (!found) return null;
      return {
        ...found,
        title: found.title || '未命名',
        content: found.content || '',
        tags: normalizeTags(found.tags),
        pinnedAt: found.pinnedAt || 0,
        deletedAt: found.deletedAt || 0,
        history: Array.isArray(found.history) ? found.history : [],
      };
    }

    /** 判断这次保存是否值得留一个历史版本。 */
    function shouldSnapshot(prev, next) {
      if (!prev) return false;
      if (String(prev.content || '') === String(next.content || '')) return false;
      const hist = Array.isArray(prev.history) ? prev.history : [];
      const last = hist[hist.length - 1];
      if (!last) return true;
      return Date.now() - (last.at || 0) > REVISION_MIN_GAP;
    }

    async function saveArticle(payload) {
      const list = await readAll();
      const now = Date.now();
      const input = payload || {};
      const title = String(input.title || '').trim() || '未命名';
      const content = String(input.content == null ? '' : input.content);
      const tags = normalizeTags(input.tags);
      const index = input.id ? list.findIndex((a) => a.id === input.id) : -1;

      if (index === -1) {
        const article = {
          id: newId(),
          title,
          content,
          tags,
          summary: makeSummary(content),
          pinnedAt: input.pinnedAt || 0,
          deletedAt: 0,
          history: [],
          createdAt: now,
          updatedAt: now,
        };
        list.unshift(article);
        await writeAll(list);
        return { ...article };
      }

      const prev = list[index];
      const history = Array.isArray(prev.history) ? prev.history.slice() : [];
      if (shouldSnapshot(prev, { content })) {
        history.push({
          at: prev.updatedAt || now,
          title: prev.title || '未命名',
          content: String(prev.content || ''),
        });
        while (history.length > MAX_REVISIONS) history.shift();
      }

      const next = {
        ...prev,
        title,
        content,
        tags,
        summary: makeSummary(content),
        pinnedAt: input.pinnedAt == null ? prev.pinnedAt || 0 : input.pinnedAt || 0,
        history,
        updatedAt: now,
      };
      list[index] = next;
      await writeAll(list);
      return { ...next };
    }

    /** 软删除：先进回收站，还能捞回来。 */
    async function deleteArticle(id) {
      const list = await readAll();
      const index = list.findIndex((a) => a.id === id);
      if (index === -1) return { ok: false, error: '文章不存在' };
      list[index] = { ...list[index], deletedAt: Date.now() };
      await writeAll(list);
      return { ok: true };
    }

    async function restoreArticle(id) {
      const list = await readAll();
      const index = list.findIndex((a) => a.id === id);
      if (index === -1) return { ok: false, error: '文章不存在' };
      list[index] = { ...list[index], deletedAt: 0 };
      await writeAll(list);
      return { ok: true };
    }

    /** 彻底删掉，不进回收站。用户主动清空时才走这里。 */
    async function purgeArticle(id) {
      const list = await readAll();
      const next = list.filter((a) => a.id !== id);
      if (next.length === list.length) return { ok: false, error: '文章不存在' };
      await writeAll(next);
      return { ok: true };
    }

    async function emptyTrash() {
      const list = await readAll();
      const next = list.filter((a) => !a.deletedAt);
      const removed = list.length - next.length;
      if (removed) await writeAll(next);
      return { ok: true, removed };
    }

    async function togglePin(id) {
      const list = await readAll();
      const index = list.findIndex((a) => a.id === id);
      if (index === -1) return { ok: false, error: '文章不存在' };
      const next = !list[index].pinnedAt;
      list[index] = { ...list[index], pinnedAt: next ? Date.now() : 0 };
      await writeAll(list);
      return { ok: true, pinned: next };
    }

    async function setTags(id, tags) {
      const list = await readAll();
      const index = list.findIndex((a) => a.id === id);
      if (index === -1) return { ok: false, error: '文章不存在' };
      const clean = normalizeTags(tags);
      list[index] = { ...list[index], tags: clean, updatedAt: Date.now() };
      await writeAll(list);
      return { ok: true, tags: clean };
    }

    /** 所有文章用过的标签，按出现次数排序，给标签筛选用。 */
    async function listTags() {
      const all = await readAll();
      const count = {};
      for (const a of all) {
        if (a.deletedAt) continue;
        for (const t of normalizeTags(a.tags)) count[t] = (count[t] || 0) + 1;
      }
      return Object.keys(count)
        .map((name) => ({ name, count: count[name] }))
        .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'zh-Hans-CN'));
    }

    async function listRevisions(id) {
      const found = await getArticle(id);
      if (!found) return [];
      return found.history
        .map((h, i) => ({
          index: i,
          at: h.at || 0,
          title: h.title || '未命名',
          chars: String(h.content || '').length,
          summary: makeSummary(h.content),
        }))
        .reverse();
    }

    async function getRevision(id, index) {
      const found = await getArticle(id);
      if (!found) return null;
      const h = found.history[index];
      if (!h) return null;
      return { at: h.at, title: h.title, content: h.content };
    }

    /** 把正文回滚到某个历史版本；当前内容会先被存成一个新版本，不会丢。 */
    async function restoreRevision(id, index) {
      const found = await getArticle(id);
      if (!found) return { ok: false, error: '文章不存在' };
      const h = found.history[index];
      if (!h) return { ok: false, error: '这个版本已不在' };
      const list = await readAll();
      const i = list.findIndex((a) => a.id === id);
      const prev = list[i];
      const history = Array.isArray(prev.history) ? prev.history.slice() : [];
      history.push({
        at: prev.updatedAt || Date.now(),
        title: prev.title || '未命名',
        content: String(prev.content || ''),
      });
      while (history.length > MAX_REVISIONS) history.shift();
      list[i] = {
        ...prev,
        title: h.title || prev.title,
        content: String(h.content || ''),
        summary: makeSummary(h.content),
        history,
        updatedAt: Date.now(),
      };
      await writeAll(list);
      return { ok: true, article: await getArticle(id) };
    }

    // ------------------------------------------------------------ 附件

    async function importFile(ref) {
      return backend.importFile(ref);
    }

    async function listFiles() {
      return backend.listFiles();
    }

    async function readFileBlob(stored) {
      return backend.readFileBlob(stored);
    }

    /** 正文里引用了哪些附件。 */
    function collectRefs(content) {
      const re = /lp:\/\/files\/([A-Za-z0-9._-]+)/g;
      const found = [];
      let m;
      while ((m = re.exec(String(content || ''))) !== null) {
        if (found.indexOf(m[1]) === -1) found.push(m[1]);
      }
      return found;
    }

    /** 有多少文件已经没有任何文章引用了。 */
    async function listOrphanFiles() {
      const all = await readAll();
      const used = {};
      for (const a of all) {
        for (const s of collectRefs(a.content)) used[s] = true;
      }
      const files = await backend.listFiles();
      return files.filter((f) => !used[f.stored]);
    }

    async function deleteFiles(storeds) {
      if (typeof backend.deleteFile !== 'function') {
        return { ok: false, error: '这个平台不支持删除文件' };
      }
      let removed = 0;
      for (const s of storeds || []) {
        if (await backend.deleteFile(s)) removed += 1;
      }
      return { ok: true, removed };
    }

    // ------------------------------------------------------------ 设置

    async function getSettings() {
      const saved = await backend.readSettings();
      return { ...defaultSettings(), ...(saved && typeof saved === 'object' ? saved : {}) };
    }

    async function setSettings(patch) {
      const next = { ...(await getSettings()), ...(patch || {}) };
      await backend.writeSettings(next);
      return next;
    }

    return {
      listArticles,
      listTrash,
      getArticle,
      saveArticle,
      deleteArticle,
      restoreArticle,
      purgeArticle,
      emptyTrash,
      togglePin,
      setTags,
      listTags,
      listRevisions,
      getRevision,
      restoreRevision,
      importFile,
      listFiles,
      readFileBlob,
      listOrphanFiles,
      deleteFiles,
      collectRefs,
      getSettings,
      setSettings,
      dataDir: () => backend.dataDir(),
      filesDir: () => backend.filesDir(),
    };
  }

  return {
    createRepo,
    defaultSettings,
    makeSummary,
    isImageName,
    storedName,
    normalizeTags,
    readingMinutes,
    countCharts,
    newId,
    randomHex,
    MAX_REVISIONS,
  };
});
