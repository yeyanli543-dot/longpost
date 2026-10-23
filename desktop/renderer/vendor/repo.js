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
      // 皮肤：classic（现状）| argon（深蓝宽留白）
      skin: 'classic',
      lastArticleId: '',
      showPreview: true,
      sidebarWidth: 280,
      sort: 'updated',
      readingMode: false,
      showOutline: false,
      fontSize: 16,
      // AI 助手：默认不填 Key，等于关闭；填了才会联网请求
      aiProvider: 'openai',
      aiBaseUrl: 'https://api.deepseek.com/v1',
      aiModel: 'deepseek-chat',
      aiApiKey: '',
      // 自定义更新清单地址；留空用 GitHub Releases
      updateFeed: '',
      // Chrome 剪藏本地桥：默认关闭，设置里手动开启
      clipBridgeEnabled: true,
      clipBridgeToken: '',
      clipBridgePort: 0,
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
    const proposals = Array.isArray(a.proposals) ? a.proposals : [];
    const proposalsCount = proposals.filter((p) => !p.resolved).length;
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
      proposalsCount,
      createdAt: a.createdAt || 0,
      updatedAt: a.updatedAt || 0,
      spaceKey: String(a.spaceKey || ''),
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
    // ------------------------------------------------------------ 文章与空间隔离

    async function readAll() {
      const arr = await backend.readArticles();
      return Array.isArray(arr) ? arr : [];
    }

    async function writeAll(list) {
      await backend.writeArticles(list);
      return list;
    }

    /** 根据当前登录的通行码或 Google 账号返回独立文章空间 Key；未登录时返回空串（默认公共空间）。 */
    async function getActiveSpaceKey() {
      const saved = await backend.readSettings();
      const u = saved && typeof saved === 'object' ? saved.authUser : null;
      if (!u || typeof u !== 'object') return '';
      if (u.spaceKey) return String(u.spaceKey);
      if (u.provider === 'passcode' && u.code) {
        return 'code:' + String(u.code).trim().toUpperCase();
      }
      if (u.provider === 'google' && u.email) {
        return 'google:' + String(u.email).trim().toLowerCase();
      }
      return '';
    }

    /** 将空间密钥单向散列为固定指纹，避免在 articles.json 中明文暴露通行码或口令。 */
    function hashSpaceKey(spaceKey) {
      const s = String(spaceKey || '');
      if (!s) return '';
      let h1 = 0x811c9dc5;
      let h2 = 0x01000193;
      const input = 'lp-space-v1:' + s;
      for (let i = 0; i < input.length; i += 1) {
        const c = input.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= c + (i & 0xff);
        h2 = Math.imul(h2, 0x85ebca6b);
      }
      return 'sh:' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
    }

    /** 使用空间密钥对私密空间文章字段进行流式加密（公共空间保持明文以兼容既有工具）。 */
    function cipherField(plain, spaceKey) {
      const text = String(plain == null ? '' : plain);
      const key = String(spaceKey || '');
      if (!key || !text) return text;
      let state = 0x9e3779b9;
      for (let i = 0; i < key.length; i += 1) {
        state = Math.imul(state ^ key.charCodeAt(i), 0x85ebca6b) >>> 0;
      }
      let out = 'enc1:';
      for (let i = 0; i < text.length; i += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const mask = (state >>> 16) & 0xffff;
        const enc = (text.charCodeAt(i) ^ mask) & 0xffff;
        out += enc.toString(16).padStart(4, '0');
      }
      return out;
    }

    function decipherField(stored, spaceKey) {
      const raw = String(stored == null ? '' : stored);
      if (!raw.startsWith('enc1:')) return raw;
      const key = String(spaceKey || '');
      if (!key) return '';
      const hex = raw.slice(5);
      let state = 0x9e3779b9;
      for (let i = 0; i < key.length; i += 1) {
        state = Math.imul(state ^ key.charCodeAt(i), 0x85ebca6b) >>> 0;
      }
      let out = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const mask = (state >>> 16) & 0xffff;
        const val = parseInt(hex.slice(i, i + 4), 16);
        out += String.fromCharCode((val ^ mask) & 0xffff);
      }
      return out;
    }

    function decodeArticle(a, spaceKey) {
      if (!a || !spaceKey) return a;
      const history = Array.isArray(a.history)
        ? a.history.map((h) => ({
            ...h,
            title: decipherField(h.title, spaceKey),
            content: decipherField(h.content, spaceKey),
          }))
        : [];
      return {
        ...a,
        title: decipherField(a.title, spaceKey),
        content: decipherField(a.content, spaceKey),
        summary: decipherField(a.summary, spaceKey),
        history,
      };
    }

    function inSpace(article, spaceKey) {
      const k = String(spaceKey || '');
      const aHash = String((article && article.spaceHash) || '');
      if (aHash) {
        return Boolean(k) && aHash === hashSpaceKey(k);
      }
      return String((article && article.spaceKey) || '') === k;
    }

    async function listArticles(options) {
      const opts = options || {};
      const all = await readAll();
      const spaceKey = opts.spaceKey != null ? String(opts.spaceKey) : await getActiveSpaceKey();
      const live = all
        .filter((a) => !a.deletedAt && inSpace(a, spaceKey))
        .map((a) => decodeArticle(a, spaceKey));
      return sortList(live.map(toListItem), opts.sort);
    }

    async function listTrash() {
      const all = await readAll();
      const spaceKey = await getActiveSpaceKey();
      return all
        .filter((a) => a.deletedAt && inSpace(a, spaceKey))
        .map((a) => {
          const decoded = decodeArticle(a, spaceKey);
          const item = toListItem(decoded);
          item.deletedAt = a.deletedAt;
          return item;
        })
        .sort((x, y) => (y.deletedAt || 0) - (x.deletedAt || 0));
    }

    async function getArticle(id) {
      const spaceKey = await getActiveSpaceKey();
      const raw = (await readAll()).find((a) => a.id === id);
      if (!raw || !inSpace(raw, spaceKey)) return null;
      const found = decodeArticle(raw, spaceKey);
      return {
        ...found,
        title: found.title || '未命名',
        content: found.content || '',
        tags: normalizeTags(found.tags),
        pinnedAt: found.pinnedAt || 0,
        deletedAt: found.deletedAt || 0,
        spaceKey: spaceKey,
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
      const summary = makeSummary(content);
      const tags = normalizeTags(input.tags);
      const activeSpace = input.spaceKey != null ? String(input.spaceKey) : await getActiveSpaceKey();
      const spaceHash = hashSpaceKey(activeSpace);
      const index = input.id ? list.findIndex((a) => a.id === input.id) : -1;

      if (index === -1) {
        const storedArticle = {
          id: newId(),
          title: cipherField(title, activeSpace),
          content: cipherField(content, activeSpace),
          tags,
          summary: cipherField(summary, activeSpace),
          pinnedAt: input.pinnedAt || 0,
          deletedAt: 0,
          spaceKey: activeSpace ? '' : '',
          spaceHash,
          history: [],
          createdAt: now,
          updatedAt: now,
        };
        list.unshift(storedArticle);
        await writeAll(list);
        return {
          ...storedArticle,
          title,
          content,
          summary,
          spaceKey: activeSpace,
        };
      }

      const prevRaw = list[index];
      const prevDecoded = decodeArticle(prevRaw, activeSpace);
      const history = Array.isArray(prevRaw.history) ? prevRaw.history.slice() : [];
      if (shouldSnapshot(prevDecoded, { content })) {
        history.push({
          at: prevRaw.updatedAt || now,
          title: cipherField(prevDecoded.title || '未命名', activeSpace),
          content: cipherField(String(prevDecoded.content || ''), activeSpace),
        });
        while (history.length > MAX_REVISIONS) history.shift();
      }

      const nextStored = {
        ...prevRaw,
        title: cipherField(title, activeSpace),
        content: cipherField(content, activeSpace),
        tags,
        summary: cipherField(summary, activeSpace),
        pinnedAt: input.pinnedAt == null ? prevRaw.pinnedAt || 0 : input.pinnedAt || 0,
        spaceKey: '',
        spaceHash: spaceHash || String(prevRaw.spaceHash || ''),
        history,
        updatedAt: now,
      };
      list[index] = nextStored;
      await writeAll(list);
      return {
        ...decodeArticle(nextStored, activeSpace),
        spaceKey: activeSpace,
      };
    }

    /** 软删除：先进回收站，还能捞回来。 */
    async function deleteArticle(id) {
      const list = await readAll();
      const spaceKey = await getActiveSpaceKey();
      const index = list.findIndex((a) => a.id === id && inSpace(a, spaceKey));
      if (index === -1) return { ok: false, error: '文章不存在' };
      list[index] = { ...list[index], deletedAt: Date.now() };
      await writeAll(list);
      return { ok: true };
    }

    async function restoreArticle(id) {
      const list = await readAll();
      const spaceKey = await getActiveSpaceKey();
      const index = list.findIndex((a) => a.id === id && inSpace(a, spaceKey));
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
      const spaceKey = await getActiveSpaceKey();
      const next = list.filter((a) => !(a.deletedAt && inSpace(a, spaceKey)));
      const removed = list.length - next.length;
      if (removed) await writeAll(next);
      return { ok: true, removed };
    }

    async function togglePin(id) {
      const list = await readAll();
      const spaceKey = await getActiveSpaceKey();
      const index = list.findIndex((a) => a.id === id && inSpace(a, spaceKey));
      if (index === -1) return { ok: false, error: '文章不存在' };
      const next = !list[index].pinnedAt;
      list[index] = { ...list[index], pinnedAt: next ? Date.now() : 0 };
      await writeAll(list);
      return { ok: true, pinned: next };
    }

    async function setTags(id, tags) {
      const list = await readAll();
      const spaceKey = await getActiveSpaceKey();
      const index = list.findIndex((a) => a.id === id && inSpace(a, spaceKey));
      if (index === -1) return { ok: false, error: '文章不存在' };
      const clean = normalizeTags(tags);
      list[index] = { ...list[index], tags: clean, updatedAt: Date.now() };
      await writeAll(list);
      return { ok: true, tags: clean };
    }

    /** 当前空间所有文章用过的标签，按出现次数排序，给标签筛选用。 */
    async function listTags() {
      const all = await readAll();
      const spaceKey = await getActiveSpaceKey();
      const count = {};
      for (const a of all) {
        if (a.deletedAt || !inSpace(a, spaceKey)) continue;
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
          content: String(h.content || ''),
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
      const spaceKey = await getActiveSpaceKey();
      const list = await readAll();
      const i = list.findIndex((a) => a.id === id && inSpace(a, spaceKey));
      if (i === -1) return { ok: false, error: '文章不存在' };
      const prev = list[i];
      const history = Array.isArray(prev.history) ? prev.history.slice() : [];
      history.push({
        at: prev.updatedAt || Date.now(),
        title: prev.title || cipherField('未命名', spaceKey),
        content: String(prev.content || ''),
      });
      while (history.length > MAX_REVISIONS) history.shift();
      const nextTitle = h.title || found.title || '未命名';
      const nextContent = String(h.content || '');
      list[i] = {
        ...prev,
        title: cipherField(nextTitle, spaceKey),
        content: cipherField(nextContent, spaceKey),
        summary: cipherField(makeSummary(nextContent), spaceKey),
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

    // ------------------------------------------------------------ 提议 / 建议通道

    async function getProposals(articleId) {
      if (!articleId) return [];
      const all = await readAll();
      const found = all.find((a) => a.id === articleId);
      return found && Array.isArray(found.proposals) ? found.proposals : [];
    }

    async function saveProposals(articleId, proposals) {
      if (!articleId) return [];
      const list = await readAll();
      const idx = list.findIndex((a) => a.id === articleId);
      if (idx === -1) return [];
      const valid = Array.isArray(proposals) ? proposals : [];
      list[idx].proposals = valid;
      list[idx].unresolvedProposalsCount = valid.filter((p) => !p.resolved).length;
      await writeAll(list);
      return valid;
    }

    async function listUnresolvedProposals() {
      const all = await readAll();
      const spaceKey = await getActiveSpaceKey();
      const out = [];
      for (const a of all) {
        if (a.deletedAt || !inSpace(a, spaceKey)) continue;
        const unres = (a.proposals || []).filter((p) => !p.resolved);
        if (unres.length > 0) {
          out.push({
            articleId: a.id,
            title: a.title || '未命名',
            count: unres.length,
            proposals: unres,
          });
        }
      }
      return out;
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
      getProposals,
      saveProposals,
      listUnresolvedProposals,
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
