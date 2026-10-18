/**
 * LongPost 渲染层主逻辑（无框架、无打包器的原生 JS）。
 *
 * 这个文件是桌面版（Electron）和手机版（Capacitor WebView）共用的，所以：
 *   - 数据一律走 window.LPPlatform，不直接碰文件系统 / IndexedDB；
 *   - 平台差异只通过 LP.capabilities 判断，不写 if (是不是安卓)；
 *   - 一行 ES2020 的语法都没有（可选链、空值合并），因为自检会用 new Function 编译它。
 *
 * 结构（从上往下读即可）：
 *   1. 引用与状态         2. 小工具       3. 提示 / 状态 / 忙碌条
 *   4. 历史栈与「返回」   5. 浮层 / 菜单   6. 列表与搜索
 *   7. 文章的读写        8. 预览渲染      9. 大纲
 *  10. 格式工具栏       11. 查找替换     12. 分享与统计
 *  13. 各个对话框       14. 视图 / 窄屏   15. 事件绑定与启动
 */
(function () {
  'use strict';

  const MD = window.LPMarkdown;
  const CH = window.LPChart;
  const OUTLINE = window.LPOutline;
  const PS = window.LPPageStyle;
  const WEBEXPORT = window.LPExportWeb;
  const LP = window.LPPlatform;
  const CAPS = (LP && LP.capabilities) || {};

  const $ = (id) => document.getElementById(id);
  /** 窄屏断点，跟 style-mobile.css 的 @media 保持一致。 */
  const NARROW = 820;
  const AUTOSAVE_DELAY = 900;
  const PREVIEW_DELAY = 180;
  const OUTLINE_DELAY = 420;
  /** 调度器：常驻空闲分析与后台监视心跳 */
  const rIC = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 15 }), 50));
  const cIC = window.cancelIdleCallback || ((id) => clearTimeout(id));
  let ambientIdleHandle = null;
  let ambientWatchTimer = null;
  let ambientDismissedArticleId = null;
  /** 附件 / 图片在正文里的引用格式，跟 lib/repo.js 的 lp:// 约定一致。 */
  const ASSET_RE = /lp:\/\/files\/([A-Za-z0-9._-]+)/g;

  // 手机上把文件收进 IndexedDB 的能力；桌面上没有（要走主进程，不在本轮范围）。
  const importDropped =
    LP && typeof LP.importDropped === 'function' ? LP.importDropped.bind(LP) : null;

  // ==========================================================================
  // 0. 第三方库句柄
  // --------------------------------------------------------------------------
  // 全部来自 renderer/vendor/ 下的本地文件（无 CDN、无内联脚本），清单与许可证见
  // 随包分发的许可证全文在 desktop/THIRD-PARTY-NOTICES.md（开发用明细在 VENDOR.md）。
  // 每个都用 typeof 探一下：任何一个库没加载进来，对应的增强就安静降级，
  // 不能让「少了个增强」变成「整个预览打不开」。
  // ==========================================================================

  const LIB = {
    katex: typeof katex !== 'undefined' ? katex : null,
    renderMath: typeof renderMathInElement === 'function' ? renderMathInElement : null,
    prism: typeof Prism !== 'undefined' ? Prism : null,
    mdIt: typeof markdownit === 'function' ? markdownit : null,
    mdTask: typeof markdownitTaskLists === 'function' ? markdownitTaskLists : null,
    mdFoot: typeof markdownitFootnote === 'function' ? markdownitFootnote : null,
    mdDef: typeof markdownitDeflist === 'function' ? markdownitDeflist : null,
    mdEmoji: typeof markdownitEmoji === 'function' ? markdownitEmoji : null,
    flex: typeof FlexSearch !== 'undefined' ? FlexSearch : null,
    papa: typeof Papa !== 'undefined' ? Papa : null,
    htmlToImage: typeof htmlToImage !== 'undefined' ? htmlToImage : null,
    pull: typeof PullToRefresh !== 'undefined' ? PullToRefresh : null,
    hammer: typeof Hammer !== 'undefined' ? Hammer : null,
  };

  /** 界面上那一行「增强能力」的小字，用户在设置里能看见到底装上了什么。 */
  const LIB_SUMMARY = (function () {
    const bits = [];
    if (LIB.prism) bits.push('代码高亮');
    if (LIB.katex) bits.push('公式');
    if (LIB.mdIt) bits.push('增强 Markdown');
    if (LIB.flex) bits.push('全文检索');
    if (LIB.papa) bits.push('表格解析');
    if (LIB.htmlToImage) bits.push('长图');
    return bits.length ? bits.join(' · ') : '（无增强库，功能按内置实现走）';
  })();

  // ==========================================================================
  // 1. 状态
  // ==========================================================================

  const state = {
    articles: [],
    current: null,
    dirty: false,
    query: '',
    tagFilter: '',
    /** 排序 / 主题等，来自 LP.getSettings()，写回时用 LP.setSettings()。 */
    settings: {
      theme: 'dark',
      showPreview: true,
      sort: 'updated',
      readingMode: false,
      showOutline: false,
      fontSize: 16,
      /** 新增：Markdown 引擎 auto | enhanced | light，以及两个渲染增强开关。 */
      mdEngine: 'auto',
      highlight: true,
      math: true,
      /** 工作区模式：lite (极简版) | pro (专业版) */
      workspaceMode: 'lite',
    },
    /** 每篇文章的滚动位置，切来切去不用重新找地方。 */
    scrollMem: new Map(),
    chartInstances: [],
    pendingChart: null,
    dialogType: 'bar',
    saveTimer: 0,
    previewTimer: 0,
    outlineTimer: 0,
    paneMode: 'write',
    find: { open: false, hits: [], index: 0, caseSensitive: false },
    confirmAction: null,
    menuItems: [],
    appInfo: null,
    /** 上次预览实际用的引擎，给状态栏和自检看。 */
    lastEngine: 'light',
    /** 上次预览的增强结果：{engine, highlighted, math}。 */
    enhance: null,
    /** 搜索命中来自哪条路（本地索引 / 子串），状态栏显示用。 */
    searchSource: '',
    /** 长图导出的数据，保存 / 分享时要用。 */
    longImage: null,
  };

  /** 打开中的浮层（对话框 / 大纲 / 编辑器视图），用来实现「返回」语义。 */
  const layers = [];
  let pendingPops = 0;
  /** 兜底定时器：见 programmaticBack()。 */
  let popGuardTimer = 0;

  // ==========================================================================
  // 2. 小工具
  // ==========================================================================

  function icon(name, cls) {
    return (
      '<svg class="icon' +
      (cls ? ' ' + cls : '') +
      '" aria-hidden="true"><use href="#i-' +
      name +
      '"></use></svg>'
    );
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => {
      if (c === '&') return '&amp;';
      if (c === '<') return '&lt;';
      if (c === '>') return '&gt;';
      if (c === '"') return '&quot;';
      return '&#39;';
    });
  }

  /** 把命中片段包成 <mark>，用于搜索高亮。query 已经是小写。 */
  function markHits(text, query) {
    const raw = String(text == null ? '' : text);
    if (!query) return esc(raw);
    const hay = raw.toLowerCase();
    let out = '';
    let i = 0;
    for (;;) {
      const at = hay.indexOf(query, i);
      if (at === -1) {
        out += esc(raw.slice(i));
        break;
      }
      out += esc(raw.slice(i, at));
      out += '<mark class="hit">' + esc(raw.slice(at, at + query.length)) + '</mark>';
      i = at + query.length;
      if (query.length === 0) break;
    }
    return out;
  }

  function isNarrow() {
    return window.matchMedia('(max-width: ' + NARROW + 'px)').matches;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.getFullYear() === now.getFullYear())
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function readingMinutes(text) {
    // 阅读时长以 lib/repo.js 的口径为准，列表卡片上的「约 N 分钟」跟这里同源。
    if (window.LPRepo && typeof window.LPRepo.readingMinutes === 'function') {
      return window.LPRepo.readingMinutes(String(text || ''));
    }
    return Math.max(1, Math.round(String(text || '').length / 400));
  }

  function countParagraphs(text) {
    return String(text || '')
      .split(/\n{2,}/)
      .filter((block) => block.replace(/```[\s\S]*?```/g, '').trim().length > 0).length;
  }

  /** 正文里引用到的附件（去重）。 */
  function attachmentRefs(text) {
    const out = [];
    const re = new RegExp(ASSET_RE.source, 'g');
    let m = re.exec(String(text || ''));
    while (m !== null) {
      if (out.indexOf(m[1]) === -1) out.push(m[1]);
      m = re.exec(String(text || ''));
    }
    return out;
  }

  // ==========================================================================
  // 3. 提示 / 状态 / 忙碌条
  // ==========================================================================

  let toastTimer = 0;

  function toast(message, kind) {
    const el = $('toast');
    el.textContent = String(message == null ? '' : message);
    el.className = 'toast show ' + (kind || 'info');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = 'toast ' + (kind || 'info');
      el.hidden = true;
    }, kind === 'err' ? 4200 : 2400);
  }

  function setStatus(text) {
    $('status').textContent = String(text == null ? '' : text);
  }

  function setBusy(on) {
    $('busyBar').hidden = !on;
  }

  // ==========================================================================
  // 4. 历史栈与「返回」
  // ==========================================================================

  /**
   * 打开一个可以「返回」掉的浮层。
   *
   * 每次打开都往浏览器历史上压一条记录，这样 Android 的返回键 / 鼠标侧键
   * 天然就是「关掉当前这一层」。如果日后装上 @capacitor/app，可以直接拿到
   * backButton 事件，这个栈就是它的实现（见 setupHardwareBack）。
   */
  function openLayer(name, onClose) {
    let pushed = false;
    try {
      history.pushState({ lpLayer: name }, '');
      pushed = true;
    } catch (err) {
      pushed = false;
    }
    layers.push({ name: name, onClose: onClose, pushed: pushed });
  }

  function closeLayerAt(index, fromHistory) {
    if (index < 0 || index >= layers.length) return false;
    const layer = layers.splice(index, 1)[0];
    if (layer.onClose) {
      try {
        layer.onClose();
      } catch (err) {
        /* 关不掉也不能连累后面的逻辑 */
      }
    }
    if (!fromHistory && layer.pushed && history.state && history.state.lpLayer) {
      programmaticBack();
    }
    return true;
  }

  /**
   * 我方主动 history.back()：给水位 +1，等对应的 popstate 把它消掉。
   *
   * history.back() 是异步的，极少数情况下（连续两次 back 被合并、已经在栈底）这一次
   * 不会换来 popstate。如果水位就这么挂着，之后用户按返回键会被当成「自己人」吞掉——
   * 「返回键用一次就失灵」这种 bug 用户说不清但一定会骂，所以这里放个兜底把水位还回来。
   */
  function programmaticBack() {
    pendingPops += 1;
    try {
      history.back();
    } catch (err) {
      pendingPops -= 1;
      return;
    }
    clearTimeout(popGuardTimer);
    popGuardTimer = setTimeout(function () {
      if (pendingPops > 0) pendingPops -= 1;
    }, 700);
  }

  function closeLayerByName(name, fromHistory) {
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      if (layers[i].name === name) return closeLayerAt(i, fromHistory);
    }
    return false;
  }

  function closeTopLayer(fromHistory) {
    return closeLayerAt(layers.length - 1, fromHistory);
  }

  /**
   * 「返回」的完整语义：先关身上最上面那层浮层，再退编辑器，最后才轮到系统。
   * 返回 true 表示这一下被 App 吃掉了，不该退出应用。
   */
  function goBack() {
    if (!$('ctxMenu').hidden) {
      closeMenu();
      return true;
    }
    if (layers.length) {
      closeTopLayer(true);
      return true;
    }
    if (!$('outlinePanel').hidden) {
      applyOutlineState(false);
      persistSetting('showOutline', false);
      return true;
    }
    if ($('app').dataset.view === 'editor') {
      $('app').dataset.view = 'list';
      syncTabs();
      saveScroll();
      return true;
    }
    return false;
  }

  window.addEventListener('popstate', () => {
    if (pendingPops > 0) {
      pendingPops -= 1;
      return;
    }
    goBack();
  });

  /**
   * Android 硬件返回键。
   *
   * Capacitor 默认会把返回键交给 WebView 的历史栈，所以 popstate 那条路已经能用；
   * 如果装了 @capacitor/app，这里会接管，语义更干净（不会误退出应用）。
   */
  function setupHardwareBack() {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if (!plugins || !plugins.App || typeof plugins.App.addListener !== 'function') return;
    plugins.App.addListener('backButton', () => {
      if (!goBack()) {
        try {
          plugins.App.exitApp();
        } catch (err) {
          /* 忽略 */
        }
      }
    });
  }

  // ==========================================================================
  // 5. 浮层 / 菜单
  // ==========================================================================

  const MODAL_IDS = [
    'chartModal',
    'settingsModal',
    'shareModal',
    'statsModal',
    'trashModal',
    'tagsModal',
    'historyModal',
    'confirmModal',
    'longImageModal',
    'graphModal',
    'labModal',
    'diffModal',
    'boardModal',
    'authModal',
  ];

  function openSheet(id) {
    const modal = $(id);
    if (!modal || !modal.hidden) return;
    modal.hidden = false;
    openLayer(id, () => {
      modal.hidden = true;
      // 图表对话框自带一个预览实例，关掉它别拖累正文里那些图表
      if (id === 'chartModal') disposePendingChart();
      if (id === 'confirmModal') state.confirmAction = null;
      syncTabs();
    });
    syncTabs();
  }

  function closeSheet(id) {
    closeLayerByName(id, false);
  }

  /** 遮罩点击关闭 + 抽屉把手下拉关闭。 */
  function setupModals() {
    MODAL_IDS.forEach((id) => {
      const modal = $(id);
      if (!modal) return;
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeSheet(id);
      });
      const dialog = modal.querySelector('.dialog');
      if (dialog) setupSheetDrag(dialog, id);
    });
  }

  function setupSheetDrag(dialog, modalId) {
    const handles = [dialog.querySelector('.sheet-grip'), dialog.querySelector('.dialog-head')];
    let startY = 0;
    let dy = 0;
    let dragging = false;

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      dialog.classList.remove('dragging');
      dialog.style.transform = '';
      if (dy > 90) closeSheet(modalId);
      dy = 0;
    };

    handles.forEach((handle) => {
      if (!handle) return;
      handle.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button')) return; // 头部的关闭按钮还得能点
        dragging = true;
        startY = event.clientY;
        dy = 0;
        dialog.classList.add('dragging');
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (err) {
          /* 忽略 */
        }
      });
      handle.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        dy = Math.max(0, event.clientY - startY);
        dialog.style.transform = 'translateY(' + dy + 'px)';
      });
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
  }

  // ------------------------------------------------------------ 上下文菜单

  let menuScrim = null;
  let menuAnchor = null;

  function ensureMenuScrim() {
    if (!isNarrow()) return null;
    if (!menuScrim) {
      menuScrim = document.createElement('div');
      menuScrim.className = 'scrim';
      menuScrim.id = 'menuScrim';
      menuScrim.addEventListener('click', closeMenu);
      document.body.appendChild(menuScrim);
    }
    menuScrim.hidden = false;
    return menuScrim;
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = 230;
    const height = menu.offsetHeight || 240;
    let left = rect.right - width;
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function openMenu(items, opts) {
    const menu = $('ctxMenu');
    const options = opts || {};
    menuAnchor = options.anchor || null;
    state.menuItems = items;
    let html = options.title ? '<div class="menu-head">' + esc(options.title) + '</div>' : '';
    items.forEach((item, i) => {
      if (item.sep) {
        html += '<div class="menu-sep"></div>';
        return;
      }
      html +=
        '<button class="menu-item' +
        (item.danger ? ' danger' : '') +
        '" data-mi="' +
        i +
        '">' +
        icon(item.icon || 'chevron-down') +
        '<span>' +
        esc(item.label) +
        '</span>' +
        (item.key ? '<span class="menu-key">' + esc(item.key) + '</span>' : '') +
        '</button>';
    });
    menu.innerHTML = html;
    menu.hidden = false;
    if (!isNarrow()) {
      menu.style.left = '';
      menu.style.top = '';
      if (menuAnchor) positionMenu(menu, menuAnchor);
    }
    ensureMenuScrim();
  }

  function closeMenu() {
    const menu = $('ctxMenu');
    if (!menu.hidden) {
      menu.hidden = true;
      if (menuScrim && menuScrim.parentNode) menuScrim.parentNode.removeChild(menuScrim);
      menuScrim = null;
    }
    state.menuItems = [];
    menuAnchor = null;
    swallowedByLongPress = false;
  }

  // ==========================================================================
  // 6. 列表与搜索
  // ==========================================================================

  async function reloadList() {
    state.articles = await LP.listArticles();
  }

  /**
   * 搜索是「标题 + 正文 + 标签」三处一起搜。
   * 标题和正文由 repo 预先算好的 searchText 负责（小写，省得每次重新拼），
   * 标签它没算，所以在这里补一次。
   */
  function articleMatches(article, query) {
    if (!query) return true;
    if (article.searchText && article.searchText.indexOf(query) !== -1) return true;
    const tags = article.tags || [];
    for (let i = 0; i < tags.length; i += 1) {
      if (String(tags[i]).toLowerCase().indexOf(query) !== -1) return true;
    }
    return false;
  }

  function visibleArticles() {
    const query = state.query.trim().toLowerCase();
    if (!query) {
      state.searchSource = '';
      return state.articles.filter((article) => {
        if (state.tagFilter && (article.tags || []).indexOf(state.tagFilter) === -1) return false;
        return true;
      });
    }
    // 本地索引（中文按 CJK 组合切）与子串匹配取**并集**：
    // 索引负责「源码保护」这种跨标点的中文串，子串匹配兜住索引抖动的边角，
    // 两边都不命中才算没找到 —— 检索升级不该让原来搜得到的东西搜不到。
    const ids = searchIds(query);
    const byIndex = {};
    if (ids) ids.forEach((id) => { byIndex[id] = true; });
    state.searchSource = ids ? '本地检索' + (ids.length ? ' ' + ids.length : '') : '';
    return state.articles.filter((article) => {
      if (state.tagFilter && (article.tags || []).indexOf(state.tagFilter) === -1) return false;
      return byIndex[article.id] === true || articleMatches(article, query);
    });
  }

  function metaHtml(article) {
    const parts = [];
    parts.push('<span class="meta-chunk">' + article.chars + ' 字</span>');
    parts.push('<span class="dot"></span>');
    parts.push('<span class="meta-chunk">约 ' + (article.minutes || 1) + ' 分钟</span>');
    if (article.charts) {
      parts.push('<span class="dot"></span>');
      parts.push('<span class="meta-chunk">' + icon('chart') + article.charts + '</span>');
    }
    if (article.revisionCount) {
      parts.push('<span class="dot"></span>');
      parts.push('<span class="meta-chunk">' + icon('clock') + article.revisionCount + '</span>');
    }
    parts.push('<span class="dot"></span>');
    parts.push('<span class="meta-chunk">' + formatTime(article.updatedAt) + '</span>');
    return parts.join('');
  }

  function renderList() {
    const list = $('list');
    const items = visibleArticles();
    const query = state.query.trim().toLowerCase();

    if (!items.length) {
      const searching = query || state.tagFilter;
      list.innerHTML =
        '<div class="list-empty">' +
        icon('feather') +
        '<p>' +
        (searching
          ? '没有找到符合条件的文章。<br />换个词，或者清掉标签筛选试试。'
          : '还没有文章。<br />点下面的按钮，写下第一篇。') +
        '</p>' +
        (searching
          ? '<button class="btn ghost sm" data-act="clear-filter">清空筛选</button>'
          : '<button class="btn primary sm" data-act="new-article">' +
            icon('plus') +
            '<span class="btn-label">新建文章</span></button>') +
        '</div>';
    } else {
      list.innerHTML = items
        .map((article) => {
          const active = state.current && state.current.id === article.id;
          const tags = article.tags || [];
          const tagHtml = tags.length
            ? '<div class="item-tags">' +
              tags
                .map(
                  (t) =>
                    '<span class="chip" data-tag="' +
                    esc(t) +
                    '">' +
                    (query ? markHits(t, query) : esc(t)) +
                    '</span>',
                )
                .join('') +
              '</div>'
            : '';
          return (
            '<div class="item' +
            (active ? ' active' : '') +
            (article.pinnedAt ? ' pinned' : '') +
            '" data-id="' +
            esc(article.id) +
            '" role="listitem" tabindex="0">' +
            '<div class="item-head">' +
            '<div class="item-title">' +
            markHits(article.title || '未命名', query) +
            '</div>' +
            (article.pinnedAt ? '<span class="item-pin" title="已置顶">' + icon('star') + '</span>' : '') +
            (article.proposalsCount
              ? '<span class="chip proposal-chip" title="有 ' + article.proposalsCount + ' 条未处理的排版建议">' + article.proposalsCount + '</span>'
              : '') +
            '<button class="icon-btn item-more" data-more="' +
            esc(article.id) +
            '" aria-label="更多操作" title="更多操作">' +
            icon('more') +
            '</button>' +
            '</div>' +
            '<div class="item-sum">' +
            (query ? markHits(article.summary || '（还没有正文）', query) : esc(article.summary || '（还没有正文）')) +
            '</div>' +
            tagHtml +
            '<div class="item-meta">' +
            metaHtml(article) +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    const total = state.articles.length;
    const filtering = Boolean(query || state.tagFilter);
    let label = filtering ? items.length + ' / ' + total + ' 篇' : total + ' 篇';
    if (state.tagFilter) label += ' · 标签「' + state.tagFilter + '」';
    if (query && searchIndexReady()) label += ' · 全文';
    $('count').textContent = label;
    syncRenderNote();
  }

  async function refreshTagSelect() {
    const tags = await LP.listTags();
    const select = $('tagFilterSelect');
    let html = '<option value="">全部标签</option>';
    tags.forEach((tag) => {
      html +=
        '<option value="' + esc(tag.name) + '">' + esc(tag.name) + ' · ' + tag.count + '</option>';
    });
    select.innerHTML = html;
    select.value = state.tagFilter;
    if (select.value !== (state.tagFilter || '')) {
      // 当前筛选的标签已经不存在了（最后一篇带它的文章被删了）
      state.tagFilter = '';
      select.value = '';
    }
  }

  function clearFilters() {
    state.query = '';
    state.tagFilter = '';
    $('search').value = '';
    $('btnSearchClear').hidden = true;
    $('tagFilterSelect').value = '';
    renderList();
  }

  // ==========================================================================
  // 7. 文章的读写
  // ==========================================================================

  function setBusyLabel() {
    setBusy(true);
  }

  async function refreshAll() {
    await reloadList();
    renderList();
    await refreshTagSelect();
  }

  function saveScroll() {
    if (!state.current) return;
    state.scrollMem.set(state.current.id, {
      editor: $('editor').scrollTop,
      preview: $('preview').scrollTop,
      panes: $('panes').scrollTop,
    });
  }

  function restoreScroll() {
    if (!state.current) return;
    const mem = state.scrollMem.get(state.current.id);
    if (!mem) {
      $('panes').scrollTop = 0;
      $('preview').scrollTop = 0;
      return;
    }
    $('editor').scrollTop = mem.editor || 0;
    $('preview').scrollTop = mem.preview || 0;
    $('panes').scrollTop = mem.panes || 0;
  }

  async function openArticle(id) {
    saveScroll();
    const article = await LP.getArticle(id);
    if (!article) {
      toast('文章不存在了，可能已经被删除', 'err');
      await refreshAll();
      return;
    }
    state.current = article;
    state.dirty = false;
    $('title').value = article.title || '';
    $('editor').value = article.content || '';
    $('empty').hidden = true;
    $('editorWrap').hidden = false;
    $('app').dataset.view = 'editor';
    if (isNarrow() && !hasLayer('view:editor')) {
      openLayer('view:editor', () => {
        $('app').dataset.view = 'list';
        syncTabs();
      });
    }
    refreshPinButton();
    renderPreview();
    scheduleOutline();
    updateStats();
    refreshFmtState();
    renderList();
    syncTabs();
    restoreScroll();
    closeMenu();
    // 列表态下 .tools 没有布局宽度，量不出溢出；进入编辑器后必须重算一次，
    // 否则 1320/1280 宽下「更多」还是会跑到视口外（截图里抓到的就是这个）。
    syncToolsOverflow();

    // 提议加载与环境监视条激活
    try {
      const savedProposals = await LP.getProposals(id);
      if (Array.isArray(savedProposals)) state.current.proposals = savedProposals;
    } catch (err) {
      /* 忽略 */
    }
    if (ambientDismissedArticleId !== id) ambientDismissedArticleId = null;
    renderAmbientBar();
    scheduleIdleAnalysis();
  }

  function hasLayer(name) {
    for (let i = 0; i < layers.length; i += 1) if (layers[i].name === name) return true;
    return false;
  }

  async function newArticle() {
    // saveArticle 收的是「一个 payload 对象」，id 缺省就是新建（preload 与 repo 同一套签名）
    const article = await LP.saveArticle({
      title: '未命名文章',
      content: '',
      tags: [],
    });
    await refreshAll();
    await openArticle(article.id);
    $('title').focus();
    $('title').select();
  }

  function clearCurrent() {
    state.current = null;
    state.dirty = false;
    $('title').value = '';
    $('editor').value = '';
    $('editorWrap').hidden = true;
    $('empty').hidden = false;
    $('stats').textContent = '';
    $('app').dataset.view = 'list';
    $('ambientBar').hidden = true;
    closeFind();
    renderPreview();
    renderList();
    syncTabs();
  }

  function markDirty() {
    state.dirty = true;
    clearTimeout(state.saveTimer);
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(renderPreview, PREVIEW_DELAY);
    if (state.settings.autoSave === false) {
      setStatus('有改动未保存 · Ctrl/Cmd + S 保存');
      return;
    }
    setStatus('编辑中…');
    state.saveTimer = setTimeout(saveNow, AUTOSAVE_DELAY);
  }

  async function saveNow(silent) {
    clearTimeout(state.saveTimer);
    if (!state.current) return;
    if (!state.dirty) {
      if (!silent) setStatus('已经是最新的了');
      return;
    }
    if (!silent) setStatus('保存中…');
    const payload = {
      id: state.current.id,
      title: $('title').value.trim() || '未命名文章',
      content: $('editor').value,
      tags: state.current.tags || [],
    };
    try {
      const saved = await LP.saveArticle(payload);
      state.current = saved;
      state.dirty = false;
      await reloadList();
      renderList();
      setStatus('已保存 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      refreshPinButton();
    } catch (err) {
      setStatus('保存失败');
      toast('保存失败：' + String((err && err.message) || err), 'err');
    }
  }

  async function flushBeforeSwitch() {
    if (state.dirty) await saveNow(true);
  }

  function refreshPinButton() {
    const pinned = Boolean(state.current && state.current.pinnedAt);
    const btn = $('btnPin');
    btn.classList.toggle('on', pinned);
    btn.title = pinned ? '取消置顶' : '把这篇文章顶到列表最前';
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = pinned ? '已置顶' : '置顶';
  }

  async function togglePin() {
    if (!state.current) return;
    // togglePin 返回的是 { ok, pinned } 状态，不是文章本身——别拿它覆盖 state.current
    const res = await LP.togglePin(state.current.id);
    if (res && res.ok === false) {
      toast('操作失败：' + (res.error || '未知错误'), 'err');
      return;
    }
    state.current.pinnedAt = res && res.pinned ? Date.now() : 0;
    refreshPinButton();
    await reloadList();
    renderList();
    toast(state.current.pinnedAt ? '已置顶' : '已取消置顶', 'ok');
  }

  async function togglePinById(id) {
    const res = await LP.togglePin(id);
    if (res && res.ok === false) {
      toast('操作失败：' + (res.error || '未知错误'), 'err');
      return;
    }
    await reloadList();
    renderList();
    if (state.current && state.current.id === id) {
      state.current.pinnedAt = res && res.pinned ? Date.now() : 0;
      refreshPinButton();
    }
    toast(res && res.pinned ? '已置顶' : '已取消置顶', 'ok');
  }

  function deleteCurrent() {
    if (!state.current) return;
    const title = state.current.title || '未命名';
    const id = state.current.id;
    askConfirm({
      title: '删除文章',
      text: '「' + title + '」会先放进回收站，之后还能恢复。确定删除吗？',
      okLabel: '删除',
      danger: true,
      onOk: async () => {
        await LP.deleteArticle(id);
        clearCurrent();
        await refreshAll();
        toast('已移入回收站', 'ok');
      },
    });
  }

  async function deleteById(id) {
    const article = state.articles.find((a) => a.id === id);
    const title = (article && article.title) || '未命名';
    askConfirm({
      title: '删除文章',
      text: '「' + title + '」会先放进回收站，之后还能恢复。确定删除吗？',
      okLabel: '删除',
      danger: true,
      onOk: async () => {
        await LP.deleteArticle(id);
        if (state.current && state.current.id === id) clearCurrent();
        await refreshAll();
        toast('已移入回收站', 'ok');
      },
    });
  }

  // ==========================================================================
  // 8. 预览渲染
  // ==========================================================================

  function disposeChartPreview() {
    state.chartInstances.forEach((inst) => {
      try {
        inst.dispose();
      } catch (err) {
        /* 忽略 */
      }
    });
    state.chartInstances = [];
  }

  /** 只清理「插入图表」对话框里的那个预览实例。 */
  function disposePendingChart() {
    if (!state.pendingChart) return;
    try {
      state.pendingChart.dispose();
    } catch (err) {
      /* 忽略 */
    }
    state.pendingChart = null;
  }

  /**
   * 把正文里的 lp:// 资源换成当前设备能显示的东西。
   *
   * 桌面版不用管：主进程已经注册了 lp:// 私有协议，浏览器直接就能打开。
   * 手机 / 网页版才需要把 IndexedDB 里的 blob 转成 objectURL 换上去；
   * 资源在这台设备上不存在时（比如从别人那里拷来的文章），
   * 图片位置要给一句人话，而不是留一个破图。
   */
  function resolveAssets(root) {
    if (!LP || LP.isDesktop || typeof LP.assetUrl !== 'function') return;
    const nodes = root.querySelectorAll('img[src^="lp://"], a[href^="lp://"]');
    Array.prototype.slice.call(nodes).forEach((el) => {
      const raw = el.getAttribute('src') || el.getAttribute('href');
      if (!raw) return;
      Promise.resolve(LP.assetUrl(raw)).then((url) => {
        if (url) {
          if (el.tagName === 'IMG') el.setAttribute('src', url);
          else el.setAttribute('href', url);
          return;
        }
        if (el.tagName === 'IMG') {
          const note = document.createElement('span');
          note.className = 'asset-missing';
          note.textContent = '［这张图片不在这台设备上］';
          if (el.parentNode) el.parentNode.replaceChild(note, el);
        }
      });
    });
  }

  /** 把 `- [ ] xxx` 渲染出来的普通 li 变成真正的任务清单样式（带勾选框）。 */
  function decorateTasks(root) {
    const items = Array.prototype.slice.call(root.querySelectorAll('li'));
    items.forEach((li) => {
      const text = li.textContent || '';
      const m = /^\s*\[([ xX])\]\s*([\s\S]*)$/.exec(text);
      if (!m) return;
      const done = m[1].toLowerCase() === 'x';
      li.classList.add('task-item');
      li.classList.toggle('done', done);
      li.innerHTML =
        '<span class="task-box">' + (done ? icon('check') : '') + '</span>' +
        '<span class="task-text">' + esc(m[2].trim()) + '</span>';
    });
  }

  /** 给附件链接一个可识别的样式（markdown 渲染出来就是普通 a）。 */
  function decorateAttachments(root) {
    const links = Array.prototype.slice.call(root.querySelectorAll('a[href^="lp://"]'));
    links.forEach((a) => {
      a.classList.add('attachment');
      const name = a.textContent || '附件';
      a.innerHTML = icon('paperclip') + '<span>' + esc(name) + '</span>';
      a.removeAttribute('target');
    });
  }

  // ==========================================================================
  // 8.5 第三方增强
  // --------------------------------------------------------------------------
  // 每个能力都对应界面上一个能点到的入口：
  //   代码高亮   → 设置「代码高亮」开关 + ```lang 围栏
  //   公式       → 设置「数学公式」开关 + 工具栏「公式」按钮
  //   增强引擎   → 设置「Markdown 引擎」（脚注 / 定义列表 / emoji / 任务清单）
  //   全文检索   → 顶部搜索框（FlexSearch 中文索引，和子串匹配取并集）
  //   表格       → 编辑器里粘 Excel 自动转 + 更多菜单「粘贴为表格」
  //   长图       → 更多菜单「导出长图」→ 弹窗里保存 / 系统分享
  //   手势       → 手机上下拉刷新列表、左右滑动切「写作/对照/预览」、预览区双指缩放字号
  // ==========================================================================

  /** 链接白名单：和 lib/markdown.js 同一套口径（smoke-test 第 [2] 组钉着它）。 */
  function isSafeUrl(url) {
    const u = String(url == null ? '' : url).trim().toLowerCase();
    if (!u) return false;
    if (u.indexOf('javascript:') === 0) return false;
    if (u.indexOf('vbscript:') === 0) return false;
    if (u.indexOf('data:') === 0) return false;
    return true;
  }

  /**
   * 渲染完的最后一道路障。增强引擎是第三方渲染器，安全策略得跟着走：
   * html:false 只保证「原始 HTML 被转义」，这里再把脚本/内联事件/危险协议抠一遍。
   */
  function stripUnsafe(root) {
    Array.prototype.slice
      .call(root.querySelectorAll('script, iframe, object, embed, base, form, meta, link'))
      .forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    Array.prototype.slice.call(root.querySelectorAll('*')).forEach((el) => {
      const attrs = el.attributes;
      if (!attrs) return;
      const drop = [];
      for (let i = 0; i < attrs.length; i += 1) {
        const name = String(attrs[i].name).toLowerCase();
        if (name.length > 2 && name.indexOf('on') === 0) drop.push(attrs[i].name);
      }
      drop.forEach((name) => el.removeAttribute(name));
      const href = el.getAttribute('href');
      const src = el.getAttribute('src');
      if (href && !isSafeUrl(href)) el.setAttribute('href', '#');
      if (src && !isSafeUrl(src)) el.removeAttribute('src');
    });
  }

  let mdItCache = null;
  let mdItTried = false;

  /** 懒建 markdown-it 实例；四个插件里缺哪个都不影响其余三个。 */
  function mdItEngine() {
    if (mdItTried) return mdItCache;
    mdItTried = true;
    if (!LIB.mdIt) return null;
    const inst = LIB.mdIt({ html: false, linkify: true, breaks: false });
    if (LIB.mdTask) inst.use(LIB.mdTask, { enabled: true, label: true });
    if (LIB.mdFoot) inst.use(LIB.mdFoot);
    if (LIB.mdDef) inst.use(LIB.mdDef);
    if (LIB.mdEmoji) inst.use(LIB.mdEmoji);
    inst.validateLink = function (url) {
      return isSafeUrl(url);
    };
    mdItCache = inst;
    return inst;
  }

  /**
   * 内置渲染器真做不到的几样：脚注 [^1]、定义列表（下一行以「: 」开头）、emoji 简写。
   * 「自动」模式下只有命中这几样才切增强引擎 —— 普通文章继续走内置渲染器，
   * 排版与导出跟以前一模一样，不拿老文章做实验。
   */
  const RICH_ONLY_RE = /\[\^[^\]]+\]|(^|\n)[^\n:|>-][^\n]*\n[ \t]{0,3}:[ \t]+\S|(^|[^A-Za-z0-9]):[a-z][a-z0-9_+-]{1,30}:/m;

  function pickEngine(text) {
    const mode = state.settings.mdEngine || 'auto';
    if (mode === 'light') return 'light';
    if (mode === 'enhanced') return LIB.mdIt ? 'enhanced' : 'light';
    if (LIB.mdIt && RICH_ONLY_RE.test(String(text || ''))) return 'enhanced';
    return 'light';
  }

  /**
   * 增强引擎的输出要跟内置渲染器长得一样，否则同一篇文在两种引擎下排版不一致：
   * markdown-it 出的是 <pre><code class="language-js">，补上内置渲染器的
   * pre.code-block 与 code[data-lang]，CSS 和 Prism 适配函数就都认了。
   */
  function normalizeMdItHtml(html) {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    Array.prototype.slice.call(holder.querySelectorAll('pre > code')).forEach((code) => {
      const m = /(?:^|\s)language-([A-Za-z0-9+#-]+)/.exec(code.className || '');
      if (m) {
        code.setAttribute('data-lang', m[1]);
        code.className = 'language-' + m[1];
      }
      const pre = code.parentNode;
      if (pre && pre.tagName === 'PRE' && !pre.classList.contains('code-block')) {
        pre.classList.add('code-block');
      }
    });
    return holder.innerHTML;
  }

  /** 一段 Markdown → HTML。引擎按设置与前文提到的「富语法探测」决定。 */
  function renderMarkdownSegment(text) {
    const engine = pickEngine(text);
    state.lastEngine = engine;
    if (engine === 'enhanced') {
      const inst = mdItEngine();
      if (inst) {
        try {
          return normalizeMdItHtml(inst.render(text));
        } catch (err) {
          state.lastEngine = 'light';
        }
      }
    }
    return MD.renderMarkdown(text);
  }

  /**
   * Prism 适配：内置渲染器产出的是 <pre class="code-block"><code data-lang="js">，
   * 没有 language-xxx 类，Prism 自带的自动扫描认不出来，所以按 data-lang 取 grammar。
   * 函数本身幂等（data-lang 还在，重算结果一样），每次预览重渲染后调一次即可。
   */
  function highlightCode(root) {
    if (!LIB.prism) return 0;
    let hit = 0;
    Array.prototype.slice.call(root.querySelectorAll('pre.code-block > code[data-lang]')).forEach((el) => {
      const lang = el.getAttribute('data-lang');
      const grammar = LIB.prism.languages[lang];
      if (!grammar) return; // 没装这门语言就保持原样，不要报错
      el.className = 'language-' + lang;
      el.innerHTML = LIB.prism.highlight(el.textContent, grammar, lang);
      hit += 1;
    });
    return hit;
  }

  /** KaTeX：预览每次都是整段换 innerHTML，所以每渲染一次就要重跑一次。 */
  function renderMath(root) {
    if (state.settings.math === false || !LIB.renderMath) return 0;
    try {
      LIB.renderMath(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false, // 写错的公式显示红色原文，不打断整篇渲染
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
      });
    } catch (err) {
      return 0;
    }
    return root.querySelectorAll('.katex').length;
  }

  /** 预览渲染完之后统一做增强，返回一份可核对的结果（状态栏与自检都用它）。 */
  function enhancePreview(host) {
    const out = { engine: state.lastEngine, highlighted: 0, math: 0 };
    stripUnsafe(host);
    if (state.settings.highlight !== false) out.highlighted = highlightCode(host);
    out.math = renderMath(host);
    return out;
  }

  // ---------------------------------------------------------------- 全文检索

  let articleIndex = null;
  let articleIndexStamp = '';

  function articleStamp() {
    let s = String(state.articles.length);
    state.articles.forEach((a) => {
      s += '|' + a.id + ':' + a.updatedAt;
    });
    return s;
  }

  /** 每次列表变化后重建索引；当前数据量下是毫秒级，不需要做增量。 */
  function buildSearchIndex() {
    articleIndex = null;
    articleIndexStamp = '';
    if (!LIB.flex || !LIB.flex.Document || !LIB.flex.Charset) return null;
    try {
      const doc = new LIB.flex.Document({
        encoder: LIB.flex.Charset.CJK, // 中文靠这一行：CJK 组合建索引（等价 bigram）
        tokenize: 'forward',
        resolution: 9,
        document: { id: 'id', index: ['title', 'body', 'tags'] },
      });
      state.articles.forEach((a) => {
        doc.add({
          id: a.id,
          title: a.title || '',
          body: a.searchText || '', // repo 预先算好的「标题 + 正文」小写副本
          tags: (a.tags || []).join(' '),
        });
      });
      articleIndex = doc;
      articleIndexStamp = articleStamp();
      return doc;
    } catch (err) {
      articleIndex = null;
      return null;
    }
  }

  function ensureSearchIndex() {
    if (articleIndex && articleIndexStamp === articleStamp()) return articleIndex;
    return buildSearchIndex();
  }

  /**
   * 返回命中的文章 id 列表；没有索引（库没加载 / 建失败）时返回 null，
   * 调用方退回子串匹配 —— 检索是「增强」，不能变成「少了它就搜不到」。
   */
  function searchIds(query) {
    const doc = ensureSearchIndex();
    if (!doc || !query) return null;
    try {
      const raw = doc.search(query, { limit: 200 });
      const ids = [];
      (Array.isArray(raw) ? raw : []).forEach((group) => {
        const list = (group && group.result) || [];
        list.forEach((id) => {
          if (ids.indexOf(id) === -1) ids.push(id);
        });
      });
      return ids;
    } catch (err) {
      return null;
    }
  }

  /** 搜索到底走了哪条路，界面上要能看出来。 */
  function searchIndexReady() {
    return !!ensureSearchIndex();
  }

  // ---------------------------------------------------------------- 表格

  /**
   * 剪贴板 / 粘贴板文本 → Markdown 表格。Excel 复制出来的是 TSV，
   * 所以 delimiter 交空字符串让 Papa 自己猜（制表符、逗号、分号都能认）。
   */
  function tableFromText(text) {
    if (!LIB.papa) return null;
    const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    if (!raw.trim()) return null;
    const res = LIB.papa.parse(raw.trim(), { delimiter: '', skipEmptyLines: true });
    let rows = (res && res.data) || [];
    rows = rows.filter(
      (r) => Array.isArray(r) && r.some((c) => String(c == null ? '' : c).trim() !== ''),
    );
    if (!rows.length) return null;
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (cols < 2) return null; // 单列不算表格，别把一段普通文本变成表格
    const cell = (v) =>
      String(v == null ? '' : v)
        .trim()
        .replace(/\|/g, '\\|')
        .replace(/\n+/g, ' ');
    const head = rows[0].slice();
    while (head.length < cols) head.push('');
    const lines = [
      '| ' + head.map(cell).join(' | ') + ' |',
      '| ' + head.map(() => '---').join(' | ') + ' |',
    ];
    rows.slice(1).forEach((r) => {
      const cells = r.slice();
      while (cells.length < cols) cells.push('');
      lines.push('| ' + cells.slice(0, cols).map(cell).join(' | ') + ' |');
    });
    return {
      markdown: lines.join('\n'),
      rows: rows.length,
      cols: cols,
      rawRows: rows,
      errors: (res && res.errors) || [],
    };
  }

  function detectChartFromTable(t) {
    if (!t || !t.rawRows || t.rows < 2 || t.cols < 2) return null;
    const rows = t.rawRows;
    const header = rows[0];
    const catCol = rows.slice(1).map((r) => String(r[0] || ''));
    const numericSeries = [];
    for (let c = 1; c < t.cols; c++) {
      const nums = rows.slice(1).map((r) => {
        const cleaned = String(r[c] == null ? '' : r[c]).replace(/,/g, '').trim();
        return parseFloat(cleaned);
      });
      if (nums.every((n) => !isNaN(n))) {
        numericSeries.push({
          name: String(header[c] || ('指标 ' + c)).trim(),
          data: nums,
        });
      }
    }
    if (numericSeries.length > 0 && catCol.length > 0) {
      return {
        type: 'bar',
        title: String(header[0] || '数据图表').trim() || '数据图表',
        xAxis: catCol,
        series: numericSeries,
      };
    }
    return null;
  }

  /**
   * 表格是**块级**语法，前面必须有空行。
   * 实测踩过：直接在行尾插表格，会粘成「真机复核软键盘| 省份 | GDP |」，
   * 渲染器认不出这是表格，预览里一个字都没有 —— 所以按上下文补空行。
   */
  function tableInsertText(markdown) {
    const editor = $('editor');
    const before = editor.value.slice(0, editor.selectionStart);
    let lead = '';
    if (before && !/\n\s*\n$/.test(before)) lead = /\n$/.test(before) ? '\n' : '\n\n';
    return lead + markdown + '\n';
  }

  function pasteAsTable(text) {
    if (!LIB.papa) {
      toast('表格解析库没加载进来', 'err');
      return false;
    }
    const t = tableFromText(text);
    if (!t) {
      toast('这段内容不像表格：需要多列、制表符或逗号分隔', 'err');
      return false;
    }
    insertAtCursor(tableInsertText(t.markdown));
    const chartCard = detectChartFromTable(t);
    if (chartCard && CH && typeof CH.encodeChartCard === 'function') {
      askConfirm({
        title: '检测到多维数据表',
        text: '已插入表格（' + t.rows + ' 行 × ' + t.cols + ' 列）。检测到包含数值指标序列，是否在下方自动生成联动图表卡片？',
        okLabel: '生成图表',
        onOk: () => {
          const fence = '\n\n' + CH.encodeChartCard(chartCard) + '\n';
          insertAtCursor(fence);
          toast('已生成联动图表卡片', 'ok');
        },
      });
    } else {
      toast('已转成 Markdown 表格：' + t.rows + ' 行 × ' + t.cols + ' 列', 'ok');
    }
    return true;
  }

  // ---------------------------------------------------------------- 长图

  /**
   * ECharts 画在 <canvas> 上，而 html-to-image 走的是 SVG <foreignObject> 路线，
   * canvas 的内容不会被序列化进 SVG —— 不处理的话长图里图表全是大白块。
   * 抓图前把 canvas 换成同尺寸的 <img src=dataURL>，抓完再换回去。
   */
  function swapCanvasesForCapture(host) {
    const swapped = [];
    Array.prototype.slice.call(host.querySelectorAll('canvas')).forEach((canvas) => {
      try {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const img = document.createElement('img');
        img.className = 'capture-canvas';
        img.src = canvas.toDataURL('image/png');
        img.setAttribute('width', String(Math.round(rect.width)));
        img.setAttribute('height', String(Math.round(rect.height)));
        img.style.width = Math.round(rect.width) + 'px';
        img.style.height = Math.round(rect.height) + 'px';
        img.style.display = 'block';
        canvas.parentNode.insertBefore(img, canvas);
        canvas.style.visibility = 'hidden';
        swapped.push({ canvas: canvas, img: img });
      } catch (err) {
        /* 抓不到这一张就留白，别让整张长图失败 */
      }
    });
    return function restore() {
      swapped.forEach((item) => {
        if (item.img.parentNode) item.img.parentNode.removeChild(item.img);
        item.canvas.style.visibility = '';
      });
    };
  }

  /** 直接从 PNG 头里读宽高（比再 new Image() 快，也不用等解码）。 */
  function pngSize(dataUrl) {
    try {
      const bin = atob(String(dataUrl).split(',')[1].slice(0, 64));
      const b = [];
      for (let i = 0; i < bin.length; i += 1) b.push(bin.charCodeAt(i));
      const rd = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      return { w: rd(16), h: rd(20) };
    } catch (err) {
      return { w: 0, h: 0 };
    }
  }

  function longImageFile() {
    const li = state.longImage;
    if (!li) return null;
    try {
      const parts = String(li.dataUrl).split(',');
      const mime = (/:(.*?);/.exec(parts[0]) || [])[1] || 'image/png';
      const bin = atob(parts[1]);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
      return new File([buf], li.name, { type: mime });
    } catch (err) {
      return null;
    }
  }

  function canShareImage() {
    const f = longImageFile();
    return !!(f && navigator.canShare && navigator.canShare({ files: [f] }));
  }

  async function exportLongImage() {
    if (!state.current) {
      toast('先打开一篇文章', 'err');
      return;
    }
    if (!LIB.htmlToImage) {
      toast('长图组件没加载进来', 'err');
      return;
    }
    // 手机上「写作」态预览是 display:none，抓出来会是空白，先切到预览态
    if (isNarrow()) setPaneMode('preview');
    renderPreview();
    await new Promise((r) => setTimeout(r, 300));
    setBusy(true);
    setBusyLabel('正在生成长图…');
    const node = $('preview');
    const restore = swapCanvasesForCapture(node);
    try {
      // 关键：html-to-image 默认按**元素的可见盒子**出图（#preview 是 overflow:auto
      // 的滚动容器，可见高度只有一屏），不传尺寸就会导成「只有第一屏」的废图 ——
      // 实测 3009px 的长文只得到 990×1510。这里显式给 scrollWidth/scrollHeight，
      // 并用 style 把克隆节点的高度解开（否则克隆体仍带着容器那一屏的高度）。
      const boxW = Math.round(node.getBoundingClientRect().width);
      const fullW = Math.max(boxW, node.scrollWidth);
      const fullH = Math.max(Math.round(node.getBoundingClientRect().height), node.scrollHeight);
      const dataUrl = await LIB.htmlToImage.toPng(node, {
        backgroundColor: resolvedTheme() === 'dark' ? '#0e1116' : '#ffffff',
        pixelRatio: 2,
        cacheBust: false, // 离线环境，别在 URL 上加时间戳
        width: fullW,
        height: fullH,
        style: { height: fullH + 'px', maxHeight: 'none', overflow: 'visible' },
      });
      const size = pngSize(dataUrl);
      state.longImage = {
        dataUrl: dataUrl,
        name: (state.current.title || '未命名') + '-长图.png',
        width: size.w,
        height: size.h,
      };
      $('longImageImg').src = dataUrl;
      $('longImageMeta').textContent =
        '宽 ' + size.w + ' × 高 ' + size.h + ' · 约 ' + Math.round((dataUrl.length * 3) / 4 / 1024) + ' KB';
      $('longImageShare').hidden = !canShareImage();
      openSheet('longImageModal');
      toast('长图已生成', 'ok');
    } catch (err) {
      toast('长图生成失败：' + String((err && err.message) || err), 'err');
    } finally {
      restore();
      setBusy(false);
    }
  }

  async function shareLongImage() {
    const file = longImageFile();
    if (!file) {
      toast('还没有长图，先生成一张', 'err');
      return;
    }
    if (!navigator.share) {
      toast('这台设备没有系统分享，用「保存 PNG」吧', 'err');
      return;
    }
    try {
      await navigator.share({ files: [file], title: (state.current && state.current.title) || 'LongPost' });
    } catch (err) {
      if (!err || err.name !== 'AbortError') toast('分享没能完成', 'err');
    }
  }

  function saveLongImage() {
    if (!state.longImage) return;
    const a = document.createElement('a');
    a.href = state.longImage.dataUrl;
    a.download = state.longImage.name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('长图已导出：' + state.longImage.name, 'ok');
  }

  // ==========================================================================
  // 8.6 手势（手机）
  // ==========================================================================

  let pullInited = false;

  /**
   * 下拉刷新：只在窄屏装。
   * 移动端保留默认 touch 事件，避免 pointer 模式在真机手势滑动时吃掉点击；
   * 仅在非触屏（如桌面端无头自动化）下开启 pointer 模式；
   * 配置 distIgnore 与精准 shouldPullToRefresh，避免微小触控晃动被误判为下拉而吞噬点击。
   */
  function setupPullToRefresh() {
    if (pullInited || !LIB.pull || !isNarrow()) return;
    pullInited = true;
    try {
      const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
      if (typeof LIB.pull.setPointerEventsMode === 'function') {
        LIB.pull.setPointerEventsMode(!isTouch);
      }
      LIB.pull.init({
        triggerElement: '#list',
        mainElement: '#list',
        distThreshold: 65,
        distIgnore: 18, // 18px 以内的触控晃动一律视为普通点击，绝不阻止事件冒泡与点击触发
        shouldPullToRefresh: () => {
          const list = $('list');
          return list ? list.scrollTop <= 0 : false;
        },
        onRefresh: async () => {
          await refreshAll();
          toast('已刷新', 'ok');
        },
      });
    } catch (err) {
      pullInited = false;
    }
  }

  /** 左右滑动切「写作 / 对照 / 预览」——手机上比点那个三段控件顺手。 */
  function setupSwipePanes() {
    const order = ['write', 'split', 'preview'];
    const step = (delta) => (event) => {
      const target = event.target;
      if (!target || !target.closest || !target.closest('#panes')) return;
      if (!isNarrow()) return;
      const at = order.indexOf(state.paneMode);
      const next = order[Math.min(order.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))];
      if (next !== state.paneMode) {
        setPaneMode(next);
        toast('已切到' + (next === 'write' ? '写作' : next === 'split' ? '对照' : '预览'), 'ok');
      }
    };
    document.addEventListener('swiped-left', step(1));
    document.addEventListener('swiped-right', step(-1));
  }

  /**
   * 预览区双指缩放改正文字号。只装 pinch 一个 recognizer，
   * 并且把 touchAction 设成 pan-y —— 否则 Hammer 会把纵向滚动一起锁死。
   */
  let pinchBase = 0;

  function setupPinchZoom() {
    if (!LIB.hammer) return;
    const el = $('preview');
    if (!el) return;
    try {
      LIB.hammer.defaults.touchAction = 'pan-y';
      const manager = new LIB.hammer.Manager(el, { touchAction: 'pan-y' });
      manager.add(new LIB.hammer.Pinch({ enable: true, threshold: 0 }));
      manager.on('pinchstart', () => {
        if (!isNarrow()) return;
        pinchBase = Number(state.settings.fontSize) || 16;
      });
      manager.on('pinchmove', (event) => {
        if (!isNarrow() || !pinchBase) return;
        const next = Math.max(13, Math.min(24, Math.round(pinchBase * event.scale)));
        if (next === Number(state.settings.fontSize)) return;
        state.settings.fontSize = next;
        document.documentElement.style.setProperty('--editor-font-size', next + 'px');
        $('fontSizeHint').textContent = next + ' px';
        const range = $('setFontSize');
        if (range) range.value = String(next);
      });
      manager.on('pinchend', async () => {
        if (!pinchBase) return;
        pinchBase = 0;
        state.settings = await LP.setSettings({ fontSize: Number(state.settings.fontSize) || 16 });
      });
    } catch (err) {
      /* 手势装不上不影响其它功能 */
    }
  }

  function renderPreview() {
    clearTimeout(state.previewTimer);
    disposeChartPreview();
    const host = $('preview');

    if (!state.current) {
      host.innerHTML =
        '<div class="preview-empty">' + icon('eye') + '<p>左边写点什么，这里会立刻出现预览。</p></div>';
      return;
    }
    if (!state.settings.showPreview) {
      host.innerHTML = '';
      return;
    }

    const content = $('editor').value || '';
    if (!content.trim()) {
      host.innerHTML =
        '<div class="preview-empty">' + icon('eye') + '<p>左边写点什么，这里会立刻出现预览。</p></div>';
      return;
    }

    // 预览必须跟着输入框的实时内容走，而不是上次保存的快照。
    const theme = resolvedTheme();
    const segments = CH.splitChartCards(content);
    const pending = [];
    const frag = document.createDocumentFragment();

    segments.forEach((seg) => {
      if (seg.kind === 'chart') {
        // 有标题的图表把标题提到图上方，图本身交给 ECharts
        const figure = document.createElement('figure');
        figure.className = 'chart-block';
        const title = (seg.card && seg.card.title) || (seg.card && CH.TYPE_LABELS[seg.card.type]) || '';
        if (title) {
          const cap = document.createElement('figcaption');
          cap.className = 'chart-title';
          cap.textContent = title;
          figure.appendChild(cap);
        }
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'chart-copy-btn icon-btn';
        copyBtn.setAttribute('aria-label', '复制图表为图片');
        copyBtn.title = '复制图表为图片 (PNG)';
        copyBtn.innerHTML = icon('copy');
        figure.appendChild(copyBtn);

        const box = document.createElement('div');
        box.className = 'chart-canvas';
        box.style.height = CH.chartHeight(seg.card) + 'px';
        figure.appendChild(box);
        frag.appendChild(figure);
        pending.push({ el: box, card: seg.card, copyBtn: copyBtn });
        return;
      }
      if (!seg.text || !seg.text.trim()) return;
      const holder = document.createElement('div');
      holder.innerHTML = renderMarkdownSegment(seg.text);
      while (holder.firstChild) frag.appendChild(holder.firstChild);
    });

    host.innerHTML = '';
    host.appendChild(frag);

    // 正文里如果写了不合法的 ```chart 围栏，这里的 code[data-lang=chart] 就是漏网的那段
    Array.prototype.slice.call(host.querySelectorAll('code[data-lang="chart"]')).forEach((code) => {
      const bad = document.createElement('div');
      bad.className = 'chart-bad';
      bad.textContent = '这段 ```chart 图表数据不合法，没能画出来：\n' + code.textContent;
      const pre = code.closest('pre');
      if (pre) pre.replaceWith(bad);
    });

    // 预览被隐藏时（手机上切到「写作」）容器宽度是 0，ECharts 画出来会是空白的，
    // 所以这时先不初始化，等切回预览 / 对照时再重新渲染一次。
    const visible = host.offsetParent !== null || host.clientWidth > 0;
    if (visible) {
      pending.forEach((item) => {
        try {
          const chart = window.echarts.init(item.el, null, { renderer: 'canvas' });
          chart.setOption(CH.chartCardToEchartsOption(item.card, theme));
          state.chartInstances.push(chart);
          item.chart = chart;
          if (item.copyBtn) {
            item.copyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              copyChartAsImage(chart);
            });
          }
        } catch (err) {
          item.el.innerHTML =
            '<div class="chart-bad">图表渲染失败：' + esc(String((err && err.message) || err)) + '</div>';
        }
      });
    }

    decorateTasks(host);
    decorateAttachments(host);
    applyFindToPreview();
    resolveAssets(host);
    // 代码高亮 + 公式：必须在内容进 DOM 之后做，KaTeX 要能量到真实盒模型
    const enhanced = enhancePreview(host);
    state.enhance = enhanced;
    syncRenderNote();
  }

  /** 状态栏右侧那几个小标：引擎、高亮块数、公式数、检索来源。 */
  function syncRenderNote() {
    const node = $('renderNote');
    if (!node) return;
    const info = state.enhance || { engine: 'light', highlighted: 0, math: 0 };
    const bits = [];
    bits.push(info.engine === 'enhanced' ? '增强引擎' : '内置引擎');
    if (state.settings.highlight !== false && LIB.prism) bits.push('高亮 ' + info.highlighted);
    if (state.settings.math !== false && LIB.katex) bits.push('公式 ' + info.math);
    if (state.searchSource) bits.push(state.searchSource);
    node.textContent = bits.join(' · ');
    node.title = '渲染与检索走的哪条路：' + LIB_SUMMARY;
  }

  function resizeCharts() {
    state.chartInstances.forEach((inst) => {
      try {
        inst.resize();
      } catch (err) {
        /* 忽略 */
      }
    });
  }

  function updateStats() {
    const content = $('editor').value || '';
    const chars = content.length;
    const paragraphs = countParagraphs(content);
    const charts = CH.chartCount(content);
    const files = attachmentRefs(content).length;
    const minutes = readingMinutes(content);
    const bits = [chars + ' 字', paragraphs + ' 段', '约 ' + minutes + ' 分钟'];
    if (charts) bits.push(charts + ' 图表');
    if (files) bits.push(files + ' 附件');
    $('stats').textContent = bits.join(' · ');
    return { chars: chars, paragraphs: paragraphs, charts: charts, files: files, minutes: minutes };
  }

  // ==========================================================================
  // 9. 大纲
  // ==========================================================================

  function renderOutline() {
    const content = $('editor').value || '';
    const built = OUTLINE.buildToc(content);
    const host = $('outlineList');
    if (!built.items || !built.items.length) {
      host.innerHTML = '<div class="list-empty small">' + icon('align-left') + '<p>正文还没有标题。<br />用 <code>##</code> 开头就能生成大纲。</p></div>';
      return;
    }
    host.innerHTML = built.items
      .map(
        (item, i) =>
          '<button class="outline-item lv' +
          item.level +
          '" data-line="' +
          item.line +
          '" data-index="' +
          i +
          '" title="' +
          esc(item.text) +
          '">' +
          esc(item.text) +
          '</button>',
      )
      .join('');
  }

  function scheduleOutline() {
    clearTimeout(state.outlineTimer);
    state.outlineTimer = setTimeout(() => {
      if (!$('outlinePanel').hidden) renderOutline();
    }, OUTLINE_DELAY);
  }

  /**
   * 跳到正文的某一行：编辑区把光标放过去，预览区把对应的标题滚进视野。
   * 只滚编辑区的话，在沉浸阅读（只看预览）里点大纲会毫无反应。
   */
  function gotoLine(line, headingIndex) {
    const editor = $('editor');
    const lines = editor.value.split('\n');
    let offset = 0;
    for (let i = 0; i < line && i < lines.length; i += 1) offset += lines[i].length + 1;
    editor.focus();
    editor.setSelectionRange(offset, offset + (lines[line] ? lines[line].length : 0));
    const lineHeight = lineHeightOf(editor);
    const top = line * lineHeight;
    if (top < editor.scrollTop || top > editor.scrollTop + editor.clientHeight - lineHeight * 2) {
      editor.scrollTop = Math.max(0, top - editor.clientHeight / 3);
    }

    if (typeof headingIndex === 'number' && headingIndex >= 0) {
      const heads = $('preview').querySelectorAll('h1, h2, h3, h4');
      const el = heads[headingIndex];
      if (el && typeof el.scrollIntoView === 'function') {
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (err) {
          el.scrollIntoView();
        }
      }
    }

    if (!$('outlinePanel').hidden && isNarrow()) {
      applyOutlineState(false);
      persistSetting('showOutline', false);
    }
  }

  // ==========================================================================
  // 10. 格式工具栏与文本编辑增强
  // ==========================================================================

  const FMT_ACTIONS = [
    { act: 'bold', icon: 'bold', label: '加粗', key: 'Ctrl+B' },
    { act: 'italic', icon: 'italic', label: '斜体', key: 'Ctrl+I' },
    { act: 'h1', icon: 'type', label: '一级标题' },
    { act: 'h2', icon: 'hash', label: '二级标题' },
    { act: 'ul', icon: 'list', label: '无序列表' },
    { act: 'task', icon: 'check-square', label: '任务清单' },
    { act: 'quote', icon: 'quote', label: '引用' },
    { act: 'code', icon: 'code', label: '行内代码 / 代码块' },
    { act: 'link', icon: 'link', label: '链接', key: 'Ctrl+K' },
    { sep: true },
    { act: 'table', icon: 'grid', label: '表格' },
    { act: 'math', icon: 'sigma', label: '数学公式' },
    { act: 'hr', icon: 'minus', label: '分隔线' },
    { sep: true },
    { act: 'image', icon: 'image', label: '插入图片' },
    { act: 'chart', icon: 'chart', label: '插入图表' },
    { act: 'file', icon: 'paperclip', label: '插入附件' },
  ];

  function buildFmtbar() {
    const bar = $('fmtbar');
    let html = '';
    FMT_ACTIONS.forEach((item) => {
      if (item.sep) {
        html += '<span class="fmt-sep" aria-hidden="true"></span>';
        return;
      }
      html +=
        '<button type="button" class="fmt" data-act="' +
        item.act +
        '" title="' +
        esc(item.label) +
        (item.key ? '（' + item.key + '）' : '') +
        '" aria-label="' +
        esc(item.label) +
        '">' +
        icon(item.icon) +
        '</button>';
    });
    bar.innerHTML = html;
  }

  /** 在光标处插入文本，并把光标放到 afterCaretOffset 处（默认插到末尾）。 */
  function insertAtCursor(text, afterCaretOffset) {
    const editor = $('editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    editor.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + (typeof afterCaretOffset === 'number' ? afterCaretOffset : text.length);
    editor.setSelectionRange(caret, caret);
    editor.focus();
    afterEdit();
  }

  function afterEdit() {
    updateStats();
    scheduleOutline();
    markDirty();
    refreshFmtState();
  }

  function wrapSelection(marker, placeholder) {
    const editor = $('editor');
    const text = editor.value;
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const selected = text.slice(s, e);
    const len = marker.length;

    // 已经包着同样的记号 -> 脱掉
    if (
      s >= len &&
      text.slice(s - len, s) === marker &&
      text.slice(e, e + len) === marker
    ) {
      editor.value = text.slice(0, s - len) + selected + text.slice(e + len);
      editor.setSelectionRange(s - len, e - len);
      editor.focus();
      afterEdit();
      return;
    }
    if (selected.length > 2 * len && selected.slice(0, len) === marker && selected.slice(-len) === marker) {
      const inner = selected.slice(len, -len);
      editor.value = text.slice(0, s) + inner + text.slice(e);
      editor.setSelectionRange(s, s + inner.length);
      editor.focus();
      afterEdit();
      return;
    }

    const body = selected || placeholder || '文字';
    editor.value = text.slice(0, s) + marker + body + marker + text.slice(e);
    editor.setSelectionRange(s + len, s + len + body.length);
    editor.focus();
    afterEdit();
  }

  /** 对选中的每一行做前缀开关（标题、列表、引用都靠它）。 */
  function toggleLinePrefix(prefix, opts) {
    const editor = $('editor');
    const text = editor.value;
    const options = opts || {};
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = text.indexOf('\n', e);
    if (lineEnd === -1) lineEnd = text.length;
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const pattern = options.pattern || new RegExp('^\\s*' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const allHave = lines.every((line) => (line.trim() ? pattern.test(line) : true));
    const stripped = lines.map((line) => line.replace(options.strip || pattern, ''));
    const out = allHave
      ? stripped
      : stripped.map((line, i) => {
          if (!line.trim()) return line;
          if (options.each) return options.each(line, i);
          return (options.indent || '') + prefix + line.replace(/^\s+/, '');
        });
    const next = out.join('\n');
    editor.value = text.slice(0, lineStart) + next + text.slice(lineEnd);
    editor.setSelectionRange(lineStart, lineStart + next.length);
    editor.focus();
    afterEdit();
  }

  function setHeading(level) {
    const editor = $('editor');
    const text = editor.value;
    const s = editor.selectionStart;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = text.indexOf('\n', s);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const bare = line.replace(/^\s*#{1,6}\s+/, '');
    const has = new RegExp('^\\s*#{' + level + '}\\s+').test(line);
    const next = has ? bare : '#'.repeat(level) + ' ' + bare;
    editor.value = text.slice(0, lineStart) + next + text.slice(lineEnd);
    const caret = lineStart + next.length;
    editor.setSelectionRange(caret, caret);
    editor.focus();
    afterEdit();
  }

  function insertTable() {
    insertAtCursor(
      '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n',
      0,
    );
  }

  /** 工具栏「公式」：选中了就把选中内容包成 $$…$$，没选就给一段行间公式模板。 */
  function insertMath() {
    const editor = $('editor');
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected.trim()) {
      insertAtCursor('$$\n' + selected.trim() + '\n$$\n');
    } else {
      insertAtCursor('\n$$\nE = mc^2\n$$\n', 8);
    }
    setStatus('公式用 $…$ 写行内、$$…$$ 写行间，预览里直接出结果');
  }

  function insertLink() {
    const editor = $('editor');
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (/^https?:\/\/\S+$/.test(selected.trim())) {
      insertAtCursor('[' + selected.trim() + '](' + selected.trim() + ')');
      return;
    }
    wrapSelection('[](', '');
    const text = editor.value;
    const at = editor.selectionStart;
    // 把光标放回方括号中间，让用户先写文字
    const bracket = text.lastIndexOf('[', at);
    const closeBracket = text.indexOf(']', bracket);
    if (bracket !== -1 && closeBracket !== -1) {
      editor.setSelectionRange(bracket + 1, closeBracket);
    }
  }

  function insertCode() {
    const editor = $('editor');
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected.indexOf('\n') !== -1) {
      const lineStart = editor.value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
      const text = editor.value;
      editor.value = text.slice(0, lineStart) + '```\n' + selected + '\n```' + text.slice(editor.selectionEnd);
      const caret = lineStart + 4 + selected.length;
      editor.setSelectionRange(caret, caret);
      editor.focus();
      afterEdit();
      return;
    }
    wrapSelection('`', 'code');
  }

  function applyFormat(act) {
    switch (act) {
      case 'bold':
        wrapSelection('**', '加粗文字');
        break;
      case 'italic':
        wrapSelection('*', '斜体文字');
        break;
      case 'h1':
        setHeading(1);
        break;
      case 'h2':
        setHeading(2);
        break;
      case 'ul':
        toggleLinePrefix('- ', { pattern: /^\s*[-*+]\s+/, strip: /^\s*[-*+]\s+/ });
        break;
      case 'task':
        toggleLinePrefix('- [ ] ', {
          pattern: /^\s*[-*+]\s+\[[ xX]\]\s+/,
          strip: /^\s*[-*+]\s+\[[ xX]\]\s+/,
        });
        break;
      case 'quote':
        toggleLinePrefix('> ', { pattern: /^\s*>\s?/, strip: /^\s*>\s?/ });
        break;
      case 'code':
        insertCode();
        break;
      case 'link':
        insertLink();
        break;
      case 'table':
        insertTable();
        break;
      case 'math':
        insertMath();
        break;
      case 'hr':
        insertAtCursor('\n---\n');
        break;
      case 'image':
        insertImages();
        break;
      case 'chart':
        openChartDialog();
        break;
      case 'file':
        insertFiles();
        break;
      default:
        break;
    }
  }

  /** 光标落在加粗 / 斜体里时，把工具栏按钮点亮。 */
  function refreshFmtState() {
    const editor = $('editor');
    if (!editor) return;
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const text = editor.value;
    const sel = text.slice(s, e);
    const before = text.slice(Math.max(0, s - 2), s);
    const after = text.slice(e, e + 2);
    const bold = (sel.length > 3 && sel.slice(0, 2) === '**' && sel.slice(-2) === '**') || (before === '**' && after === '**');
    const italic = !bold && ((sel.length > 2 && sel[0] === '*' && sel[sel.length - 1] === '*') || (before.slice(-1) === '*' && after.slice(0, 1) === '*'));
    const bar = $('fmtbar');
    const boldBtn = bar.querySelector('.fmt[data-act="bold"]');
    const italicBtn = bar.querySelector('.fmt[data-act="italic"]');
    if (boldBtn) boldBtn.classList.toggle('on', bold);
    if (italicBtn) italicBtn.classList.toggle('on', italic);
  }

  /** Enter：自动接着上一行的列表记号；空条目再按一次就退出列表。 */
  function continueList(event) {
    const editor = $('editor');
    if (editor.selectionStart !== editor.selectionEnd) return;
    const pos = editor.selectionStart;
    const before = editor.value.slice(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);

    const quote = /^(\s*)>\s?(.*)$/.exec(line);
    if (quote && !quote[2].trim() && !/^\s*$/.test(line)) {
      event.preventDefault();
      editor.value = editor.value.slice(0, lineStart) + '' + editor.value.slice(pos);
      editor.setSelectionRange(lineStart, lineStart);
      editor.focus();
      afterEdit();
      return;
    }

    const m = /^(\s*)(?:([-*+])|(\d+)([.)]))\s+(\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (!m) return;
    event.preventDefault();

    const indent = m[1] || '';
    const bullet = m[2];
    const num = m[3];
    const delim = m[4];
    const task = m[5];
    const rest = m[6] || '';

    if (!rest.trim()) {
      // 空条目：把记号擦掉，等于「退出列表」
      editor.value = editor.value.slice(0, lineStart) + indent + editor.value.slice(pos);
      const caret = lineStart + indent.length;
      editor.setSelectionRange(caret, caret);
      editor.focus();
      afterEdit();
      return;
    }

    let marker;
    if (bullet) marker = indent + bullet + ' ';
    else marker = indent + (parseInt(num, 10) + 1) + (delim || '.') + ' ';
    if (task) marker += '[ ] ';

    const insert = '\n' + marker;
    editor.value = before + insert + editor.value.slice(pos);
    const caret = pos + insert.length;
    editor.setSelectionRange(caret, caret);
    editor.focus();
    afterEdit();
  }

  /** Tab / Shift+Tab：缩进或反缩进（多行选中时整块处理）。 */
  function handleIndent(event) {
    const editor = $('editor');
    const text = editor.value;
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = text.indexOf('\n', e);
    if (lineEnd === -1) lineEnd = text.length;

    if (s === e && !event.shiftKey) {
      // 单点光标：插入两个空格，保持光标在后面
      editor.value = text.slice(0, s) + '  ' + text.slice(e);
      editor.setSelectionRange(s + 2, s + 2);
      editor.focus();
      afterEdit();
      return;
    }

    const block = text.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const out = lines.map((line) => {
      if (!line.length && lines.length === 1) return line;
      if (event.shiftKey) return line.replace(/^(\t| {1,2})/, '');
      return '  ' + line;
    });
    const next = out.join('\n');
    editor.value = text.slice(0, lineStart) + next + text.slice(lineEnd);
    editor.setSelectionRange(lineStart, lineStart + next.length);
    editor.focus();
    afterEdit();
  }

  function lineHeightOf(el) {
    const lh = parseFloat(window.getComputedStyle(el).lineHeight);
    if (!isNaN(lh)) return lh;
    return (parseFloat(window.getComputedStyle(el).fontSize) || 16) * 1.85;
  }

  // ------------------------------------------------------------ 插入附件

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(file.name || '');
  }

  /** 把 importFile 的结果（或 {error}）拼进正文。 */
  function insertPicked(results, wantImage) {
    if (!results || !results.length) return;
    let inserted = 0;
    const failed = [];
    results.forEach((res) => {
      if (!res) return;
      if (res.error) {
        failed.push((res.name || '文件') + '：' + res.error);
        return;
      }
      const name = res.name || res.stored || '附件';
      if (wantImage || res.isImage) {
        insertAtCursor('\n![' + name + '](' + res.url + ')\n');
      } else {
        insertAtCursor('\n' + iconText(name) + '[' + name + '](' + res.url + ')\n');
      }
      inserted += 1;
    });
    if (inserted) toast('已插入 ' + inserted + ' 个' + (wantImage ? '图片' : '文件'), 'ok');
    if (failed.length) toast('有 ' + failed.length + ' 个文件没插进去：' + failed[0], 'err');
  }

  function iconText(name) {
    return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(name) ? '' : '';
  }

  async function insertImages() {
    setBusyLabel();
    try {
      const files = await LP.pickImages();
      insertPicked(files, true);
    } catch (err) {
      toast('选图片失败：' + String((err && err.message) || err), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function insertFiles() {
    setBusyLabel();
    try {
      const files = await LP.pickFiles();
      insertPicked(files, false);
    } catch (err) {
      toast('选文件失败：' + String((err && err.message) || err), 'err');
    } finally {
      setBusy(false);
    }
  }

  /** 粘贴 / 拖进来的文件：能直接收就收，收不了就提示走按钮。 */
  async function receiveFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    const images = files.filter(isImageFile);
    if (importDropped) {
      setBusyLabel();
      try {
        const results = await importDropped(files);
        insertPicked(results, images.length === files.length);
      } catch (err) {
        toast('导入失败：' + String((err && err.message) || err), 'err');
      } finally {
        setBusy(false);
      }
      return;
    }
    // 桌面版：没有「外部文件直接落盘」的通道，退化成即时提示 + 一键继续
    toast(
      '桌面版请用工具栏的「图片 / 附件」按钮选择文件（拖入需要主进程新增一个导入通道）',
      'err',
    );
    if (images.length === files.length) insertImages();
    else insertFiles();
  }

  // ==========================================================================
  // 11. 查找与替换
  // ==========================================================================

  function openFind() {
    const bar = $('findBar');
    const editor = $('editor');
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected && selected.indexOf('\n') === -1) $('findInput').value = selected;
    bar.hidden = false;
    state.find.open = true;
    runFind(0);
    $('findInput').focus();
    $('findInput').select();
  }

  function closeFind() {
    if ($('findBar').hidden) return;
    $('findBar').hidden = true;
    state.find.open = false;
    state.find.hits = [];
    applyFindToPreview();
    $('editor').focus();
  }

  function computeHits(query, caseSensitive) {
    const text = $('editor').value;
    const hits = [];
    if (!query) return hits;
    const hay = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      hits.push(i);
      i = hay.indexOf(needle, i + needle.length);
    }
    return hits;
  }

  function runFind(startIndex) {
    const query = $('findInput').value;
    state.find.caseSensitive = $('findCase').getAttribute('aria-pressed') === 'true';
    state.find.hits = computeHits(query, state.find.caseSensitive);
    const total = state.find.hits.length;
    state.find.index = total ? ((typeof startIndex === 'number' ? startIndex : state.find.index) + total) % total : 0;
    $('findCount').textContent = total ? state.find.index + 1 + '/' + total : '0/0';
    highlightCurrentHit();
    applyFindToPreview();
  }

  function highlightCurrentHit() {
    const hits = state.find.hits;
    if (!hits.length) return;
    const editor = $('editor');
    const at = hits[state.find.index];
    const len = $('findInput').value.length;
    editor.focus();
    editor.setSelectionRange(at, at + len);
    const line = editor.value.slice(0, at).split('\n').length - 1;
    const lineHeight = lineHeightOf(editor);
    const top = line * lineHeight;
    if (top < editor.scrollTop || top > editor.scrollTop + editor.clientHeight - lineHeight * 2) {
      editor.scrollTop = Math.max(0, top - editor.clientHeight / 3);
    }
  }

  function stepHit(delta) {
    if (!state.find.hits.length) return;
    state.find.index = (state.find.index + delta + state.find.hits.length) % state.find.hits.length;
    $('findCount').textContent = state.find.index + 1 + '/' + state.find.hits.length;
    highlightCurrentHit();
    applyFindToPreview();
  }

  function replaceCurrent() {
    const query = $('findInput').value;
    if (!query || !state.find.hits.length) return;
    const editor = $('editor');
    const at = state.find.hits[state.find.index];
    const value = editor.value;
    editor.value =
      value.slice(0, at) + $('replaceInput').value + value.slice(at + query.length);
    afterEdit();
    state.find.index = Math.max(0, state.find.index);
    runFind(0);
  }

  function replaceAll() {
    const query = $('findInput').value;
    if (!query) return;
    const editor = $('editor');
    const value = editor.value;
    const needle = state.find.caseSensitive ? query : query.toLowerCase();
    const replacement = $('replaceInput').value;
    let out = '';
    let i = 0;
    let count = 0;
    for (;;) {
      const hay = state.find.caseSensitive ? value : value.toLowerCase();
      const at = hay.indexOf(needle, i);
      if (at === -1) {
        out += value.slice(i);
        break;
      }
      out += value.slice(i, at) + replacement;
      i = at + query.length;
      count += 1;
    }
    if (!count) {
      toast('没有命中，没做替换');
      return;
    }
    editor.value = out;
    afterEdit();
    runFind(0);
    toast('替换了 ' + count + ' 处', 'ok');
  }

  /** 预览里的命中高亮：遍历文本节点，把命中的字包进 <mark>。 */
  function applyFindToPreview() {
    const host = $('preview');
    if (!host) return;
    // 先把上一次的 mark 还原成纯文本
    Array.prototype.slice.call(host.querySelectorAll('mark.find-hit')).forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });

    const query = state.find.open ? $('findInput').value : '';
    if (!query) return;

    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const caseSensitive = state.find.caseSensitive;

    nodes.forEach((node) => {
      const raw = node.nodeValue;
      if (!raw) return;
      const hay = caseSensitive ? raw : raw.toLowerCase();
      const needle = caseSensitive ? query : query.toLowerCase();
      if (hay.indexOf(needle) === -1) return;
      const frag = document.createDocumentFragment();
      let i = 0;
      for (;;) {
        const at = hay.indexOf(needle, i);
        if (at === -1) {
          frag.appendChild(document.createTextNode(raw.slice(i)));
          break;
        }
        if (at > i) frag.appendChild(document.createTextNode(raw.slice(i, at)));
        const mark = document.createElement('mark');
        mark.className = 'find-hit';
        mark.textContent = raw.slice(at, at + query.length);
        frag.appendChild(mark);
        i = at + query.length;
      }
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });

    const marks = host.querySelectorAll('mark.find-hit');
    if (marks.length) {
      const current = marks[Math.min(state.find.index, marks.length - 1)];
      if (current) current.classList.add('current');
    }
  }

  // ==========================================================================
  // 12. 分享与统计
  // ==========================================================================

  function articleMarkdown() {
    const title = $('title').value.trim() || '未命名';
    return '# ' + title + '\n\n' + ($('editor').value || '') + '\n';
  }

  function toPlainText(markdown) {
    return String(markdown || '')
      .replace(/```chart[\s\S]*?```/g, '\n［图表］\n')
      .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '［图片］')
      .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '☐ ')
      .replace(/^\s*[-*+]\s+/gm, '· ')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function sharePayload(text, what) {
    const title = $('title').value.trim() || '未命名';
    const res = await LP.shareText({ title: title, text: text, dialogTitle: title });
    if (res && res.ok) {
      toast(res.mode === 'share' ? what + '已交给系统分享' : what + '已复制到剪贴板', 'ok');
    } else if (res && res.canceled) {
      setStatus('已取消分享');
    } else {
      toast('分享失败：' + ((res && res.error) || '未知原因'), 'err');
    }
  }

  async function shareMarkdown() {
    await sharePayload(articleMarkdown(), 'Markdown');
  }

  async function sharePlain() {
    await sharePayload(toPlainText(articleMarkdown()), '纯文本');
  }

  /**
   * 「网页 HTML」在两端不是同一件事：
   *   手机 —— 单文件往往接近 1 MB，塞进系统分享的文本字段很容易被截断，
   *           所以直接生成文件、交给系统分享面板；
   *   桌面 —— 没有分享面板，复制 HTML 源码到剪贴板最顺手。
   */
  async function shareHtml() {
    if (CAPS.share && typeof LP.exportHtml === 'function') {
      await exportArticle('html');
      return;
    }
    if (!WEBEXPORT || typeof WEBEXPORT.buildSelfContained !== 'function') {
      toast('当前环境不支持生成单文件 HTML', 'err');
      return;
    }
    const article = { title: $('title').value.trim() || '未命名', content: $('editor').value || '' };
    const canRead = LP && typeof LP.readFileBlob === 'function' ? LP.readFileBlob.bind(LP) : null;
    try {
      const built = await WEBEXPORT.buildSelfContained(article, {
        readFileBlob: canRead || (() => Promise.resolve(null)),
        listFiles: LP && typeof LP.listFiles === 'function' ? () => LP.listFiles() : null,
        echartsUrl: 'vendor/echarts.min.js',
      });
      if (!built || !built.ok) {
        toast('生成 HTML 失败：' + ((built && built.error) || '未知原因'), 'err');
        return;
      }
      await sharePayload(built.html, '单文件 HTML');
    } catch (err) {
      toast('生成 HTML 失败：' + String((err && err.message) || err), 'err');
    }
  }

  function shareHintText() {
    const title = $('title').value.trim() || '未命名';
    if (CAPS.share) {
      return '「' + title + '」——支持直接复制免登录长文链接、生成带社交卡片的单文件网页，或调用系统面板分享到 X/Twitter、微信与文件。';
    }
    return '「' + title + '」——支持一键复制推文格式链接、生成带社交预览卡片的独立单文件网页，贴到 X/Twitter、Discord 或微信即看。';
  }

  function openShare() {
    if (!state.current) {
      toast('先选一篇文章再分享');
      return;
    }
    $('shareHint').textContent = shareHintText();
    openSheet('shareModal');
  }

  function checkPreflightIssues(content) {
    const issues = [];
    const chartFences = (content || '').match(/```chart[\s\S]*?```/g) || [];
    for (let i = 0; i < chartFences.length; i++) {
      const inner = chartFences[i].replace(/^```chart\s*/, '').replace(/```$/, '').trim();
      try {
        JSON.parse(inner);
      } catch (e) {
        issues.push('第 ' + (i + 1) + ' 个图表卡片语法错误 (JSON 解析失败)');
      }
    }
    const fences = (content || '').match(/^```/gm) || [];
    if (fences.length % 2 !== 0) {
      issues.push('正文包含未闭合的代码块围栏 (```)');
    }
    return issues;
  }

  async function exportArticle(kind) {
    if (!state.current) return;
    const content = $('editor').value || '';
    const issues = checkPreflightIssues(content);
    if (issues.length > 0) {
      askConfirm({
        title: '导出前健康自检提醒',
        text: '检测到以下潜在格式故障：\n· ' + issues.join('\n· ') + '\n\n直接导出可能导致排版异常。是否仍要强制导出？',
        okLabel: '强制导出',
        danger: true,
        onOk: () => doExportArticle(kind),
      });
      return;
    }
    await doExportArticle(kind);
  }

  async function doExportArticle(kind) {
    if (state.dirty) await saveNow(true);
    setBusyLabel();
    try {
      const res = kind === 'html' ? await LP.exportHtml(state.current.id) : await LP.exportMarkdown(state.current.id);
      if (res && res.ok) {
        toast((kind === 'html' ? '网页' : 'Markdown') + '已导出：' + (res.path || ''), 'ok');
        setStatus('已导出 · ' + (res.path || ''));
      } else if (res && res.canceled) {
        setStatus('已取消导出');
      } else {
        toast('导出失败：' + ((res && res.error) || '未知原因'), 'err');
      }
    } catch (err) {
      toast('导出失败：' + String((err && err.message) || err), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function exportById(kind, id) {
    setBusyLabel();
    try {
      const res = kind === 'html' ? await LP.exportHtml(id) : await LP.exportMarkdown(id);
      if (res && res.ok) toast('已导出：' + (res.path || ''), 'ok');
      else if (res && !res.canceled) toast('导出失败：' + ((res && res.error) || '未知原因'), 'err');
    } catch (err) {
      toast('导出失败：' + String((err && err.message) || err), 'err');
    } finally {
      setBusy(false);
    }
  }

  function getArticleShareInfo() {
    const title = $('title').value.trim() || '未命名';
    const content = $('editor').value || '';
    const excerpt = (state.current && state.current.summary ? state.current.summary : content)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#*`~\[\]()!<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return { title, content, excerpt };
  }

  async function shareToWechat() {
    if (!state.current) {
      toast('请先选择一篇文章');
      return;
    }
    const { title, excerpt } = getArticleShareInfo();
    const wechatText = '【长文推荐】《' + title + '》\n\n' + (excerpt ? '“' + excerpt + '...”\n\n' : '') + '——来自 LongPost 独立文章库';
    if (CAPS.share && typeof LP.shareText === 'function') {
      await LP.shareText({ title: title, text: wechatText, dialogTitle: '分享到微信' });
      return;
    }
    await sharePayload(wechatText, '微信图文导读文案');
    askConfirm({
      title: '微信专属长文分享',
      text: '已生成并复制微信专属长文导读文案！\n\n· 聊天发送：在电脑微信对话框按 Ctrl+V 即可粘贴发送给好友；\n· 朋友圈分享：推荐导出精美排版长图，微信群与朋友圈阅览体验最佳；\n· 公众号排版：也可直接使用「复制公众号排版」粘贴到微信后台。',
      okLabel: '导出朋友圈长图',
      cancelLabel: '知道了',
      onOk: () => {
        closeSheet('shareModal');
        exportLongImage();
      },
    });
  }

  function buildWechatMpInlineHtml(title, content) {
    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    const safeTitle = esc(title || '未命名长文');
    const MD = window.LPMarkdown;
    let bodyHtml = '';
    if (MD && typeof MD.renderMarkdown === 'function') {
      bodyHtml = MD.renderMarkdown(content || '');
    } else {
      bodyHtml = esc(content || '').replace(/\n/g, '<br/>');
    }

    bodyHtml = bodyHtml
      .replace(/<h1>(.*?)<\/h1>/gi, '<h2 style="margin: 32px 0 16px; padding-bottom: 8px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.4; border-bottom: 2px solid #3b82f6;">$1</h2>')
      .replace(/<h2>(.*?)<\/h2>/gi, '<h3 style="margin: 28px 0 14px; padding-left: 10px; border-left: 4px solid #3b82f6; font-size: 18px; font-weight: 700; color: #1e293b; line-height: 1.4;">$1</h3>')
      .replace(/<h3>(.*?)<\/h3>/gi, '<h4 style="margin: 22px 0 12px; font-size: 16px; font-weight: 600; color: #334155; line-height: 1.4;">$1</h4>')
      .replace(/<p>(.*?)<\/p>/gi, '<p style="font-size: 15px; color: #334155; line-height: 1.85; margin: 0 0 16px; text-align: justify; word-break: break-word; letter-spacing: 0.5px;">$1</p>')
      .replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, '<blockquote style="margin: 20px 0; padding: 14px 18px; background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; color: #475569; font-size: 14px; line-height: 1.75;">$1</blockquote>')
      .replace(/<pre>([\s\S]*?)<\/pre>/gi, '<pre style="background-color: #1e293b; color: #f8fafc; padding: 14px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 13px; line-height: 1.6; margin: 20px 0;">$1</pre>')
      .replace(/<code>(.*?)<\/code>/gi, '<code style="background-color: #f1f5f9; color: #e11d48; padding: 2px 6px; border-radius: 4px; font-size: 88%; font-family: monospace;">$1</code>');

    const header = '<section style="background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; padding: 22px 18px; margin-bottom: 24px; color: #ffffff;"><h1 style="margin: 0 0 8px 0; font-size: 21px; font-weight: 700; color: #ffffff;">' + safeTitle + '</h1><div style="font-size: 12px; color: #94a3b8;">LongPost 深度长文 · ' + new Date().toLocaleDateString('zh-CN') + '</div></section>';
    const footer = '<section style="margin-top: 36px; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13px; color: #64748b; text-align: center;"><p style="margin: 0; font-weight: 600; color: #1e293b;">本文由 LongPost 排版生成 · 粘贴即成文</p></section>';

    return '<section style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; line-height: 1.85; color: #334155;">' + header + bodyHtml + footer + '</section>';
  }

  async function shareToWechatMp() {
    if (!state.current) {
      toast('请先选择一篇文章');
      return;
    }
    const title = $('title').value.trim() || '未命名';
    const content = $('editor').value || '';
    const html = buildWechatMpInlineHtml(title, content);
    const plain = title + '\n\n' + toPlainText(content);

    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plain], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]);
        toast('微信公众号排版已复制！在微信后台直接粘贴即可', 'ok');
        return;
      } catch (e) {
        // Fallback below
      }
    }

    try {
      const container = document.createElement('div');
      container.contentEditable = 'true';
      container.innerHTML = html;
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.opacity = '0';
      document.body.appendChild(container);
      const sel = window.getSelection();
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(container);
      sel.addRange(range);
      const res = document.execCommand('copy');
      sel.removeAllRanges();
      document.body.removeChild(container);
      if (res) {
        toast('微信公众号排版已复制！在微信后台直接粘贴即可', 'ok');
        return;
      }
    } catch {}

    await sharePayload(plain, '纯文本');
  }

  async function shareToObsidian() {
    if (!state.current) {
      toast('请先选择一篇文章');
      return;
    }
    const title = $('title').value.trim() || '未命名';
    const content = $('editor').value || '';
    const tags = Array.isArray(state.current.tags) ? state.current.tags : [];
    const dateIso = new Date(state.current.createdAt || Date.now()).toISOString();
    const updatedIso = new Date(state.current.updatedAt || Date.now()).toISOString();

    const tagLines = ['  - longpost', ...tags.map(t => '  - ' + t.replace(/^#/, ''))].join('\n');
    const frontmatter = [
      '---',
      'title: "' + title.replace(/"/g, '\\"') + '"',
      'date: ' + dateIso,
      'updated: ' + updatedIso,
      'tags:',
      tagLines,
      'source: "longpost"',
      'generator: "LongPost Second Brain"',
      '---',
      '',
      '# ' + title,
      '',
      content,
      '',
    ].join('\n');

    const fileName = (title || 'article').replace(/[\/\\:*?"<>|]/g, '_') + '.md';
    try {
      const blob = new Blob([frontmatter], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('已导出 Obsidian 格式笔记: ' + fileName, 'ok');
    } catch (err) {
      await sharePayload(frontmatter, 'Obsidian 笔记');
    }
  }

  /** 打开分享页：桌面端走应用内受控窗口，其它环境退回新标签页 */
  async function openShareWindow(url, title) {
    if (LP && typeof LP.openInApp === 'function') {
      const res = await LP.openInApp({ url, title: title || '分享' });
      if (res && res.ok) return true;
      if (res && res.error) toast('打开分享页失败：' + res.error, 'err');
      return false;
    }
    try {
      window.open(url, '_blank');
      return true;
    } catch {
      return false;
    }
  }

  async function shareToQQ() {
    if (!state.current) {
      toast('请先选择一篇文章');
      return;
    }
    const { title, excerpt } = getArticleShareInfo();
    const qqText = '【长文推荐】《' + title + '》\n\n' + (excerpt ? '导读：“' + excerpt + '...”\n\n' : '') + '——来自 LongPost 独立文章库';
    if (CAPS.share && typeof LP.shareText === 'function') {
      await LP.shareText({ title: title, text: qqText, dialogTitle: '分享到 QQ' });
      return;
    }
    await sharePayload(qqText, 'QQ 推荐卡片文案');
    askConfirm({
      title: 'QQ 专属长文分享',
      text: '已生成并复制 QQ 推荐卡片文案！\n\n· 聊天发送：在电脑 QQ 或讨论组按 Ctrl+V 即可直接发送；\n· QQ 动态分享：推荐导出精美排版长图，免去第三方网页扫码打不开的问题；\n· 网页窗口：浏览器版可打开 QQ 分享页；桌面版没有公开链接，二维码扫了打不开。',
      okLabel: '导出 QQ 长图',
      cancelLabel: '打开网页窗口',
      onOk: () => {
        closeSheet('shareModal');
        exportLongImage();
      },
      onCancel: () => {
        // 桌面版运行在 file:// 下，没有任何公开链接。
        // 把 file:// 塞给 QQ 的分享页，它生成的二维码手机扫了必然打不开 ——
        // 与其给一个死码，不如直接说清楚：复制文案，粘贴到 QQ 就行。
        const href = typeof window !== 'undefined' && window.location.href ? window.location.href : '';
        if (!/^https?:/i.test(href)) {
          toast('桌面版没有公开链接，扫码打不开；文案已复制，直接粘贴到 QQ', 'err');
          return;
        }
        const qqUrl = 'https://connect.qq.com/widget/shareqq/index.html?url=' + encodeURIComponent(href) + '&title=' + encodeURIComponent(title) + '&summary=' + encodeURIComponent(excerpt) + '&desc=' + encodeURIComponent(excerpt) + '&site=LongPost';
        openShareWindow(qqUrl, '分享到 QQ');
      },
    });
  }

  async function shareToWeibo() {
    if (!state.current) {
      toast('请先选择一篇文章');
      return;
    }
    const { title, excerpt } = getArticleShareInfo();
    const weiboText = '【' + title + '】' + (excerpt ? ' ' + excerpt : '') + ' #LongPost#';
    const weiboUrl = 'https://service.weibo.com/share/share.php?title=' + encodeURIComponent(weiboText);
    try {
      const opened = await openShareWindow(weiboUrl, '分享到微博');
      if (opened) toast('已打开新浪微博发帖窗口', 'ok');
      else await sharePayload(weiboText, '微博分享文案');
    } catch {
      await sharePayload(weiboText, '微博分享文案');
    }
  }

  async function shareToTwitter() {
    if (!state.current) {
      toast('请先选择一篇文章');
      return;
    }
    const title = $('title').value.trim() || '未命名';
    const content = $('editor').value || '';
    const excerpt = (state.current.summary || content)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#*`~\[\]()!<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 110);
    const tweetText = '「' + title + '」\n\n' + excerpt + '\n\n#LongPost';
    const tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText);
    try {
      if (typeof window !== 'undefined' && window.open) {
        await openShareWindow(tweetUrl, '分享到 X');
        toast('已打开 X / Twitter 发推窗口', 'ok');
      } else {
        await sharePayload(tweetText, '推文内容');
      }
    } catch {
      await sharePayload(tweetText, '推文内容');
    }
  }

  async function exportFullBackup() {
    setBusyLabel();
    try {
      const liveList = (await LP.listArticles()) || [];
      const trashList = (await LP.listTrash()) || [];
      const idSet = new Set([...liveList.map((a) => a.id), ...trashList.map((a) => a.id)]);
      const fullArticles = [];
      for (const id of idSet) {
        const art = await LP.getArticle(id);
        if (art) fullArticles.push(art);
      }
      const settings = (await LP.getSettings()) || {};
      const backupData = {
        version: '3.0.4',
        exportedAt: new Date().toISOString(),
        appName: 'LongPost',
        stats: {
          articlesCount: fullArticles.length,
          liveCount: liveList.length,
          trashCount: trashList.length,
        },
        settings: settings,
        articles: fullArticles,
      };
      const jsonContent = JSON.stringify(backupData, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = 'LongPost-Backup-' + dateStr + '.json';

      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('整库备份已导出：' + fileName, 'ok');
      setStatus('整库备份已完成（共 ' + fullArticles.length + ' 篇文章）');
    } catch (err) {
      toast('备份导出失败：' + String((err && err.message) || err), 'err');
    } finally {
      setBusy(false);
    }
  }

  function openStats() {
    if (!state.current) return;
    const content = $('editor').value || '';
    const chars = content.length;
    const paragraphs = countParagraphs(content);
    const minutes = readingMinutes(content);
    const charts = CH.chartCount(content);
    const files = attachmentRefs(content).length;
    const tags = state.current.tags || [];
    const cells = [
      ['字数', chars, '字'],
      ['段落', paragraphs, '段'],
      ['阅读时长', minutes, '分钟'],
      ['图表', charts, '个'],
      ['附件', files, '个'],
      ['历史版本', (state.current.history || []).length, '版'],
    ];
    $('statGrid').innerHTML = cells
      .map(
        (cell) =>
          '<div class="stat-cell"><span class="stat-label">' +
          cell[0] +
          '</span><span class="stat-value">' +
          cell[1] +
          '<span class="stat-unit">' +
          cell[2] +
          '</span></span></div>',
      )
      .join('');
    $('statsNote').textContent =
      '标题「' +
      (state.current.title || '未命名') +
      '」· 标签 ' +
      (tags.length ? tags.join('、') : '（无）') +
      ' · 创建于 ' +
      (formatTime(state.current.createdAt) || '—') +
      ' · 最后修改 ' +
      (formatTime(state.current.updatedAt) || '—') +
      '。字数按 Markdown 原文计（含记号）。';
    openSheet('statsModal');
  }

  // ==========================================================================
  // 13. 各个对话框
  // ==========================================================================

  function askConfirm(opts) {
    const options = opts || {};
    $('confirmTitle').textContent = options.title || '确认';
    $('confirmText').textContent = options.text || '';
    $('confirmOk').textContent = options.okLabel || '确定';
    $('confirmOk').className = 'btn ' + (options.danger ? 'danger' : 'primary');
    if ($('confirmCancel')) $('confirmCancel').textContent = options.cancelLabel || '取消';
    state.confirmAction = options.onOk || null;
    state.confirmCancelAction = options.onCancel || null;
    openSheet('confirmModal');
  }

  async function runConfirm() {
    const action = state.confirmAction;
    state.confirmAction = null;
    closeSheet('confirmModal');
    if (action) await action();
  }

  // ------------------------------------------------------------ 设置

  /** 只改一个设置项：把当前设置整体回写，避免别处的改动被覆盖。 */
  async function persistSetting(key, value) {
    const patch = Object.assign({}, state.settings);
    patch[key] = value;
    state.settings = await LP.setSettings(patch);
    return state.settings;
  }

  function resolvedTheme() {
    const theme = state.settings.theme;
    if (theme === 'light' || theme === 'dark') return theme;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    return mq.matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle('light', theme === 'light');
    document.body.classList.toggle('dark', theme === 'dark');
  }

  function applyWorkspaceMode(mode) {
    const isLite = mode !== 'pro';
    const actual = isLite ? 'lite' : 'pro';
    state.settings.workspaceMode = actual;
    document.documentElement.dataset.workspaceMode = actual;
    document.documentElement.classList.toggle('mode-apple', isLite);
    document.documentElement.classList.toggle('mode-lite', isLite);
    document.documentElement.classList.toggle('mode-google', !isLite);
    document.documentElement.classList.toggle('mode-pro', !isLite);
    document.body.classList.toggle('mode-apple', isLite);
    document.body.classList.toggle('mode-lite', isLite);
    document.body.classList.toggle('mode-google', !isLite);
    document.body.classList.toggle('mode-pro', !isLite);

    const badge = isLite ? '' : '';
    const label = isLite ? '极简' : '专业';
    const title = isLite
      ? '当前：极简版（点击切换至 专业版，快捷键 Alt+M）'
      : '当前：专业版（点击切换至 极简版，快捷键 Alt+M）';

    const btn1 = $('btnModeSwitch');
    if (btn1) {
      btn1.title = title;
      $('modeBadge').textContent = badge;
      $('modeLabel').textContent = label;
    }
    const btn2 = $('btnModeSwitchMobile');
    if (btn2) {
      btn2.title = title;
      $('modeBadgeMobile').textContent = badge;
      $('modeLabelMobile').textContent = label;
    }
    $('modeSwitch') && syncSegmentedActive('modeSwitch', actual);
    $('modeSwitchHelp') && ($('modeSwitchHelp').textContent = isLite
      ? '当前生效：极简版 —— 纯净留白、毛玻璃材质、细腻的窗口质感、沉浸式心流写作。'
      : '当前生效：专业版 —— 全局工具带、大药丸搜索、浮动主按钮、全功能专业工具。');
  }

  function setupMaterialRipple() {
    document.addEventListener('pointerdown', (e) => {
      if (state.settings.workspaceMode !== 'pro') return;
      const target = e.target.closest(
        'button, .btn, .item, .seg, .chip, .fmt, .tools .btn, .pro-tool-item, .dialog-foot .btn, .mode-pill-btn'
      );
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      target.classList.add('m3-ripple-container');
      const ink = document.createElement('span');
      ink.className = 'm3-ripple-ink';
      ink.style.width = size + 'px';
      ink.style.height = size + 'px';
      ink.style.left = x + 'px';
      ink.style.top = y + 'px';
      target.appendChild(ink);

      const onPointerEnd = () => {
        ink.classList.add('fade-out');
        setTimeout(() => {
          if (ink.parentNode) ink.parentNode.removeChild(ink);
        }, 320);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
      };
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);
    });
  }

  async function toggleWorkspaceMode() {
    document.documentElement.classList.add('mode-morphing');
    const next = state.settings.workspaceMode === 'pro' ? 'lite' : 'pro';
    state.settings = await LP.setSettings({ workspaceMode: next });
    applyWorkspaceMode(next);
    setTimeout(() => {
      document.documentElement.classList.remove('mode-morphing');
    }, 400);
    toast(next === 'lite' ? '已切换至 极简版' : '已切换至 专业版');
  }

  function applyFontSize() {
    const size = Number(state.settings.fontSize) || 16;
    document.documentElement.style.setProperty('--editor-font-size', size + 'px');
    $('fontSizeHint').textContent = size + ' px';
    $('setFontSize').value = String(size);
  }

  function applyPaneState() {
    const panes = $('panes');
    panes.classList.toggle('preview-off', !state.settings.showPreview);
    panes.classList.toggle('outline-on', !$('outlinePanel').hidden);
    $('btnPreview').classList.toggle('on', Boolean(state.settings.showPreview));
    $('btnOutline').classList.toggle('on', !$('outlinePanel').hidden);
    $('btnReading').classList.toggle('on', Boolean(state.settings.readingMode));
    document.body.classList.toggle('reading-mode', Boolean(state.settings.readingMode));
    $('app').dataset.reading = state.settings.readingMode ? 'on' : 'off';
  }

  function applyOutlineState(on) {
    const panel = $('outlinePanel');
    panel.hidden = !on;
    $('outlineScrim').hidden = !on || !isNarrow();
    if (on) renderOutline();
    $('outlineSwitch') && syncSegmentedActive('outlineSwitch', on ? 'on' : 'off');
    applyPaneState();
    syncTabs();
  }

  function applySettingsUi() {
    applyTheme();
    applyWorkspaceMode(state.settings.workspaceMode || 'lite');
    applyFontSize();
    applyPaneState();
    applyOutlineState(Boolean(state.settings.showOutline));
    syncAuthUi();

    const lineWidth = state.settings.lineWidth || 'normal';
    document.documentElement.dataset.lineWidth = lineWidth;
    document.documentElement.dataset.motion = state.settings.motion === 'reduce' ? 'reduce' : 'full';
    syncSwitch('autoSaveSwitch', state.settings.autoSave !== false);
    syncSwitch('motionSwitch', state.settings.motion === 'reduce');
    syncSwitch('hlSwitch', state.settings.highlight !== false);
    syncSwitch('mathSwitch', state.settings.math !== false);

    buildSegmented(
      'modeSwitch',
      [
        { key: 'lite', label: '极简版' },
        { key: 'pro', label: '专业版' },
      ],
      state.settings.workspaceMode || 'lite',
      async (key) => {
        document.documentElement.classList.add('mode-morphing');
        state.settings = await LP.setSettings({ workspaceMode: key });
        applyWorkspaceMode(key);
        setTimeout(() => {
          document.documentElement.classList.remove('mode-morphing');
        }, 400);
        toast(key === 'lite' ? '已切换为 极简版' : '已切换为 专业版');
      },
    );

    buildSegmented(
      'engineSwitch',
      [
        { key: 'auto', label: '自动' },
        { key: 'enhanced', label: '增强' },
        { key: 'light', label: '轻量' },
      ],
      state.settings.mdEngine || 'auto',
      async (key) => {
        state.settings = await LP.setSettings({ mdEngine: key });
        $('engineHint').textContent =
          key === 'auto' ? '自动' : key === 'enhanced' ? '增强 Markdown' : '轻量（内置）';
        renderPreview();
        toast('Markdown 引擎：' + (key === 'auto' ? '自动' : key === 'enhanced' ? '增强' : '轻量'), 'ok');
      },
    );
    $('engineHint').textContent =
      (state.settings.mdEngine || 'auto') === 'auto'
        ? '自动'
        : state.settings.mdEngine === 'enhanced'
          ? '增强 Markdown'
          : '轻量（内置）';
    $('engineNote').textContent =
      '自动 = 平时用内置渲染器（排版和导出跟以前完全一致），写到脚注、定义列表、:emoji: 这类' +
      '内置渲染器做不到的语法时自动切增强引擎。增强引擎带四个插件：任务清单 / 脚注 / 定义列表 / emoji。' +
      '当前装上的增强能力：' +
      LIB_SUMMARY +
      '。';

    buildSegmented(
      'themeSwitch',
      [
        { key: 'system', label: '跟随系统' },
        { key: 'light', label: '浅色' },
        { key: 'dark', label: '深色' },
      ],
      state.settings.theme || 'dark',
      async (key) => {
        state.settings = await LP.setSettings({ theme: key });
        applyTheme();
        renderPreview();
      },
    );

    buildSegmented(
      'sortSwitch',
      [
        { key: 'updated', label: '最近修改' },
        { key: 'created', label: '创建时间' },
        { key: 'title', label: '标题' },
      ],
      state.settings.sort || 'updated',
      async (key) => {
        state.settings = await LP.setSettings({ sort: key });
        await reloadList();
        renderList();
        toast('列表已按「' + (key === 'updated' ? '最近修改' : key === 'created' ? '创建时间' : '标题') + '」排序', 'ok');
      },
    );

    buildSegmented(
      'lineWidthSwitch',
      [
        { key: 'narrow', label: '窄' },
        { key: 'normal', label: '标准' },
        { key: 'wide', label: '宽' },
      ],
      lineWidth,
      async (key) => {
        state.settings = await LP.setSettings({ lineWidth: key });
        document.documentElement.dataset.lineWidth = key;
        resizeCharts();
      },
    );

    buildSegmented(
      'readingModeSwitch',
      [
        { key: 'off', label: '关闭' },
        { key: 'on', label: '开启' },
      ],
      state.settings.readingMode ? 'on' : 'off',
      async (key) => {
        state.settings = await LP.setSettings({ readingMode: key === 'on' });
        applyPaneState();
        setTimeout(resizeCharts, 240);
      },
    );

    buildSegmented(
      'outlineSwitch',
      [
        { key: 'off', label: '关闭' },
        { key: 'on', label: '开启' },
      ],
      state.settings.showOutline ? 'on' : 'off',
      async (key) => {
        state.settings = await LP.setSettings({ showOutline: key === 'on' });
        applyOutlineState(key === 'on');
      },
    );
  }

  function buildSegmented(id, options, activeKey, onPick) {
    const host = $(id);
    if (!host) return;
    host.innerHTML = options
      .map(
        (opt) =>
          '<button type="button" class="seg' +
          (opt.key === activeKey ? ' on' : '') +
          '" data-key="' +
          esc(opt.key) +
          '" aria-pressed="' +
          (opt.key === activeKey ? 'true' : 'false') +
          '">' +
          esc(opt.label) +
          '</button>',
      )
      .join('');
    host.onclick = (event) => {
      const btn = event.target.closest('.seg');
      if (!btn) return;
      const key = btn.getAttribute('data-key');
      Array.prototype.slice.call(host.querySelectorAll('.seg')).forEach((seg) => {
        const on = seg === btn;
        seg.classList.toggle('on', on);
        seg.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (onPick) onPick(key);
    };
  }

  function syncSegmentedActive(id, key) {
    const host = $(id);
    if (!host) return;
    Array.prototype.slice.call(host.querySelectorAll('.seg')).forEach((seg) => {
      const on = seg.getAttribute('data-key') === key;
      seg.classList.toggle('on', on);
      seg.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function syncSwitch(id, on) {
    const el = $(id);
    if (!el) return;
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  // ---------------------------------------------------------------- 引流短帖

  const sliceState = { busy: false, text: '', parsed: null, unsubscribe: null };

  /** 流式输出阶段：先把原始文本铺进一个可滚动的 pre */
  function renderSocialSliceStreaming(text) {
    const box = $('socialSliceResult');
    box.hidden = false;
    box.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'social-slice-stream';
    pre.textContent = text;
    box.appendChild(pre);
  }

  function copyToClipboard(text) {
    if (!text) return;
    const done = () => toast('已复制');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      toast('复制失败，请手动选中', 'err');
    }
    document.body.removeChild(ta);
  }

  function renderSocialSliceResult(parsed) {
    const box = $('socialSliceResult');
    box.innerHTML = '';

    function block(title, text) {
      if (!text) return;
      const wrap = document.createElement('section');
      wrap.className = 'social-slice-block';

      const head = document.createElement('div');
      head.className = 'social-slice-head';

      const label = document.createElement('span');
      label.textContent = title;

      const btn = document.createElement('button');
      btn.className = 'btn ghost sm';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', () => copyToClipboard(text));

      head.appendChild(label);
      head.appendChild(btn);

      const body = document.createElement('div');
      body.className = 'social-slice-body';
      body.textContent = text;

      wrap.appendChild(head);
      wrap.appendChild(body);
      box.appendChild(wrap);
    }

    block('标题', parsed.titles.map((x, i) => i + 1 + '. ' + x).join('\n'));
    block('短帖', parsed.post);
    block('Thread', parsed.thread.join('\n'));

    if (!parsed.titles.length && !parsed.post && !parsed.thread.length) {
      block('结果', '模型没有返回可解析的内容');
    }
    box.hidden = false;
  }

  function openSocialSlice() {
    if (!state.current) {
      toast('先打开一篇文章', 'err');
      return;
    }
    sliceState.text = '';
    sliceState.parsed = null;
    $('socialSliceResult').hidden = true;
    $('socialSliceResult').innerHTML = '';
    $('socialSliceStatus').textContent = '根据当前文章生成三个标题、一条短帖和一组 Thread，可直接复制到各平台。';
    $('socialSliceRun').textContent = '开始生成';
    $('socialSliceRun').disabled = false;
    $('socialSliceModal').hidden = false;
  }

  function closeSocialSlice() {
    $('socialSliceModal').hidden = true;
    if (sliceState.unsubscribe) {
      try {
        sliceState.unsubscribe();
      } catch {
        /* 忽略 */
      }
      sliceState.unsubscribe = null;
    }
    sliceState.busy = false;
  }

  async function runSocialSlice() {
    if (sliceState.busy) return;
    if (!aiConfigured()) {
      $('socialSliceStatus').textContent = '还没配置 AI：设置 → AI 助手';
      openSettings();
      return;
    }

    const API = window.LPSocialSlice;
    if (!API) {
      $('socialSliceStatus').textContent = '短帖模块没加载，请重启应用';
      return;
    }

    const article = state.current;
    const title = article.title || '';
    const content = els.editor.value || '';
    if (content.trim().length < 50) {
      $('socialSliceStatus').textContent = '正文太短，至少写几段再来生成';
      return;
    }

    sliceState.busy = true;
    sliceState.text = '';
    $('socialSliceRun').disabled = true;
    $('socialSliceRun').textContent = '生成中…';
    $('socialSliceStatus').textContent = '模型正在阅读全文…';
    renderSocialSliceStreaming('');

    const cfg = aiSettings();
    const requestId = 'lp-slice-' + Date.now().toString(36);

    if (sliceState.unsubscribe) {
      try {
        sliceState.unsubscribe();
      } catch {
        /* 忽略 */
      }
    }
    sliceState.unsubscribe = LP.onAiChunk((data) => {
      if (!data || data.requestId !== requestId) return;
      sliceState.text += data.delta || '';
      const pre = document.querySelector('#socialSliceResult .social-slice-stream');
      if (pre) {
        pre.textContent = sliceState.text;
        pre.scrollTop = pre.scrollHeight;
      }
    });

    try {
      const res = await LP.aiChat({
        requestId,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey,
        messages: API.buildSocialSliceMessages(title, content),
      });

      if (sliceState.unsubscribe) {
        try {
          sliceState.unsubscribe();
        } catch {
          /* 忽略 */
        }
        sliceState.unsubscribe = null;
      }

      if (!res || !res.ok) {
        $('socialSliceStatus').textContent = '生成失败：' + ((res && res.error) || '未知错误');
        $('socialSliceRun').disabled = false;
        $('socialSliceRun').textContent = '重试';
        sliceState.busy = false;
        return;
      }

      const text = sliceState.text || (res.text || '');
      sliceState.parsed = API.parseSocialSlice(text);
      renderSocialSliceResult(sliceState.parsed);
      $('socialSliceStatus').textContent = '生成完成，逐块复制即可';
      $('socialSliceRun').textContent = '重新生成';
      $('socialSliceRun').disabled = false;
    } catch (err) {
      $('socialSliceStatus').textContent = '生成失败：' + String((err && err.message) || err);
      $('socialSliceRun').disabled = false;
      $('socialSliceRun').textContent = '重试';
    } finally {
      sliceState.busy = false;
    }
  }

  // 截图/调试钩子：让外部脚本能把解析结果直接渲染出来
  window.__lpRenderSlice = renderSocialSliceResult;

  function bindSocialSlice() {
    $('socialSliceClose').addEventListener('click', closeSocialSlice);
    $('socialSliceCloseFoot').addEventListener('click', closeSocialSlice);
    $('socialSliceRun').addEventListener('click', runSocialSlice);
  }

  // ---------------------------------------------------------------- Chrome 剪藏桥

  async function refreshClipBridge() {
    if (!LP || typeof LP.bridgeInfo !== 'function') return;
    const info = await LP.bridgeInfo();
    const sw = $('clipBridgeSwitch');
    if (sw) sw.setAttribute('aria-checked', info.enabled ? 'true' : 'false');
    const status = $('clipBridgeStatus');
    if (status) {
      status.textContent = info.enabled
        ? '运行中 · 127.0.0.1:' + info.port
        : '未开启';
    }
  }

  async function toggleClipBridge() {
    const sw = $('clipBridgeSwitch');
    const next = sw.getAttribute('aria-checked') !== 'true';
    await LP.setSettings({ clipBridgeEnabled: next });
    state.settings.clipBridgeEnabled = next;
    await refreshClipBridge();
    toast(next ? '已开启本地桥，复制书签代码即可使用' : '已关闭本地桥', next ? 'ok' : undefined);
  }

  async function copyBookmarklet() {
    const API = window.LPBookmarklet;
    if (!API) {
      toast('书签模块没加载，请重启应用', 'err');
      return;
    }
    const info = await LP.bridgeInfo();
    if (!info || !info.enabled) {
      toast('先打开上面的开关', 'err');
      return;
    }
    const code = API.buildBookmarklet({ port: info.port, token: info.token });
    if (!code) {
      toast('生成书签失败', 'err');
      return;
    }
    copyToClipboard(code);
  }

  function bindClipBridge() {
    // 设置卡片没插进来时直接跳过，不能让整个启动流程挂在 null 上
    if (!$('clipBridgeSwitch') || !$('clipBookmarkBtn')) return;
    $('clipBridgeSwitch').addEventListener('click', toggleClipBridge);
    $('clipBookmarkBtn').addEventListener('click', copyBookmarklet);
    if (LP && typeof LP.onClipped === 'function') {
      LP.onClipped(() => {
        refreshAll();
        toast('已从浏览器剪藏一篇', 'ok');
      });
    }
    refreshClipBridge();
  }

  // ---------------------------------------------------------------- 应用内更新

  const updateState = { info: null, busy: false };

  function updateStatusText(text) {
    const el = $('updateStatus');
    if (el) el.textContent = text || '';
  }

  function showUpdateBanner(info) {
    const bar = $('updateBanner');
    if (!bar) return;
    $('updateBannerText').textContent = '发现新版本 ' + info.latest + '（当前 ' + info.current + '）';
    bar.hidden = false;
  }

  /**
   * 检查更新。
   * silent = true 时只在有更新时提示，不打扰用户。
   */
  async function checkForAppUpdate(silent) {
    if (!LP || typeof LP.updateCheck !== 'function') {
      if (!silent) updateStatusText('当前环境不支持在线更新');
      return;
    }
    if (!silent) updateStatusText('检查中…');

    let res;
    try {
      res = await LP.updateCheck();
    } catch (err) {
      if (!silent) updateStatusText('检查失败：' + String((err && err.message) || err));
      return;
    }

    if (!res || !res.ok) {
      if (!silent) updateStatusText('检查失败：' + ((res && res.error) || '未知错误'));
      return;
    }

    const info = res.info;
    if (!info || !info.hasUpdate) {
      if (!silent) updateStatusText('已是最新版本（' + ((info && info.current) || '') + '）');
      return;
    }

    updateState.info = info;
    showUpdateBanner(info);
    if (!silent) updateStatusText('发现新版本 ' + info.latest);
  }

  async function downloadAndInstallUpdate() {
    if (updateState.busy || !updateState.info) return;
    updateState.busy = true;

    const btn = $('updateDownloadBtn');
    const label = $('updateBannerText');
    btn.disabled = true;
    btn.textContent = '下载 0%';

    let off = null;
    if (typeof LP.onUpdateProgress === 'function') {
      off = LP.onUpdateProgress(({ received, total }) => {
        const pct = total ? Math.round((received / total) * 100) : 0;
        btn.textContent = '下载 ' + pct + '%';
        label.textContent = '正在下载安装包… ' + pct + '%';
      });
    }

    let res;
    try {
      res = await LP.updateDownload(updateState.info);
    } catch (err) {
      res = { ok: false, error: String((err && err.message) || err) };
    } finally {
      if (typeof off === 'function') off();
    }

    if (!res || !res.ok) {
      btn.disabled = false;
      btn.textContent = '重试下载';
      label.textContent = '下载失败：' + ((res && res.error) || '未知错误');
      updateState.busy = false;
      return;
    }

    label.textContent = res.verified ? '安装包已校验，正在启动安装…' : '安装包已下载（发布方未提供校验和）';
    btn.textContent = '安装并重启';
    btn.disabled = true;

    try {
      await LP.updateInstall(res.filePath);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '重新安装';
      label.textContent = '启动安装程序失败：' + String((err && err.message) || err);
    } finally {
      updateState.busy = false;
    }
  }

  function bindUpdates() {
    $('updateDownloadBtn').addEventListener('click', downloadAndInstallUpdate);
    $('updateLaterBtn').addEventListener('click', () => {
      $('updateBanner').hidden = true;
    });
    $('updateCloseBtn').addEventListener('click', () => {
      $('updateBanner').hidden = true;
    });
    $('updateCheckBtn').addEventListener('click', () => checkForAppUpdate(false));

    // 启动后延迟检查：别和首屏渲染抢带宽
    if (LP && typeof LP.updateCheck === 'function') {
      setTimeout(() => {
        checkForAppUpdate(true);
      }, 6000);

      // 之后每 30 分钟复查一次。
      // 只在启动时查一次的话，挂着不关的应用永远收不到当天发布的版本。
      setInterval(() => {
        if (!updateState.info) checkForAppUpdate(true);
      }, 30 * 60 * 1000);
    }
  }

  // ---------------------------------------------------------------- AI 助手

  /**
   * 三家可选：OpenAI 兼容（DeepSeek / Moonshot / 自建网关）、Gemini、本机 Ollama。
   * 只有 provider 这一项需要用户理解，其余字段都按预设自动填好。
   */
  const AI_PROVIDERS = {
    openai: { label: 'OpenAI 兼容', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
    ollama: { label: 'Ollama 本地', baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' },
  };

  const AI_ACTIONS = {
    polish: {
      title: 'AI 润色',
      applyLabel: '替换选中',
      mode: 'replace',
      prompt: (text) =>
        '请对以下选中文本进行深度润色：提升语言表现力与文采，理顺逻辑节奏，保持原有核心事实与语意。直接输出改写后的正文，不要任何解释：\n\n' +
        text,
    },
    condense: {
      title: 'AI 精简',
      applyLabel: '替换选中',
      mode: 'replace',
      prompt: (text) =>
        '请对以下选中文本做精简提炼：删掉冗词赘字，保留主干与关键信息，语言凝练有力。直接输出结果，不要解释：\n\n' +
        text,
    },
    pangu: {
      title: 'AI 排版',
      applyLabel: '替换选中',
      mode: 'replace',
      prompt: (text) =>
        '请对以下文本做中英文混排规范化：中文与英文、数字之间加空格，统一全角中文标点，修正明显语病，保持原意。直接输出处理后的正文，不要解释：\n\n' +
        text,
    },
    continue: {
      title: 'AI 续写',
      applyLabel: '插入到下方',
      mode: 'insert',
      prompt: (text) =>
        '请顺着下面这段文字的语境与行文脉络，自然续写两段。只输出续写的正文，不要重复原文，也不要解释：\n\n' +
        text,
    },
  };

  const aiState = {
    composing: false,
    pointer: null,
    range: null,
    action: '',
    text: '',
    busy: false,
    requestId: '',
    unsubscribe: null,
  };

  function aiSettings() {
    const s = state.settings || {};
    const key = AI_PROVIDERS[s.aiProvider] ? s.aiProvider : 'openai';
    const preset = AI_PROVIDERS[key];
    return {
      provider: key,
      baseUrl: String(s.aiBaseUrl || preset.baseUrl || '').trim(),
      model: String(s.aiModel || preset.model || '').trim(),
      apiKey: String(s.aiApiKey || ''),
    };
  }

  /** 配置是否足以发起一次请求（Ollama 允许没有 Key）。 */
  function aiConfigured() {
    const cfg = aiSettings();
    if (!cfg.baseUrl || !cfg.model) return false;
    if (cfg.provider !== 'ollama' && !cfg.apiKey) return false;
    return true;
  }

  function aiHideToolbar() {
    const el = $('aiToolbar');
    if (el) el.hidden = true;
  }

  function aiShowToolbar(x, y) {
    const el = $('aiToolbar');
    if (!el) return;
    el.hidden = false;
    const half = 132;
    const left = Math.min(Math.max(x, half), window.innerWidth - half);
    const top = Math.min(Math.max(y - 8, 56), window.innerHeight - 20);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  /** 读取当前选区（textarea 的 selectionStart 在失焦后依然有效）。 */
  function aiReadSelection() {
    const editor = $('editor');
    if (!editor) return null;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start === end) return null;
    return { start: start, end: end, text: editor.value.slice(start, end) };
  }

  function aiAnchorPoint() {
    if (aiState.pointer) return aiState.pointer;
    const editor = $('editor');
    const rect = editor.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 56 };
  }

  function aiSyncToolbar() {
    if (aiState.busy) return;
    if (aiState.composing) {
      aiHideToolbar();
      return;
    }
    const sel = aiReadSelection();
    if (!sel || sel.text.trim().length < 2) {
      aiState.range = null;
      aiHideToolbar();
      return;
    }
    aiState.range = sel;
    const point = aiAnchorPoint();
    aiShowToolbar(point.x, point.y);
  }

  function aiSetStatus(text) {
    const el = $('aiPanelStatus');
    if (el) el.textContent = text || '';
  }

  function aiOpenPanel(title, applyLabel) {
    $('aiPanelTitle').textContent = title;
    $('aiApplyBtn').textContent = applyLabel;
    $('aiApplyBtn').disabled = true;
    $('aiStopBtn').hidden = false;
    $('aiPanelBody').textContent = '';
    $('aiPanel').hidden = false;
    aiSetStatus('生成中…');
  }

  function aiClosePanel() {
    $('aiPanel').hidden = true;
    if (aiState.unsubscribe) {
      try {
        aiState.unsubscribe();
      } catch {
        /* 忽略 */
      }
      aiState.unsubscribe = null;
    }
  }

  function aiStop() {
    if (aiState.requestId && LP.aiAbort) {
      try {
        LP.aiAbort(aiState.requestId);
      } catch {
        /* 忽略 */
      }
    }
    aiSetStatus('已停止');
  }

  async function aiRun(action) {
    const act = AI_ACTIONS[action];
    if (!act) return;
    const sel = aiState.range || aiReadSelection();
    if (!sel || !sel.text.trim()) {
      toast('先在正文里选中一段文字');
      return;
    }
    if (!aiConfigured()) {
      aiHideToolbar();
      toast('还没配置 AI：设置 → AI 助手', 'err');
      openSettings();
      return;
    }

    const cfg = aiSettings();
    aiHideToolbar();
    aiState.range = sel;
    aiState.action = action;
    aiState.text = '';
    aiState.busy = true;
    aiOpenPanel(act.title, act.applyLabel);

    aiState.requestId = 'lp-ai-' + Date.now().toString(36);
    if (aiState.unsubscribe) {
      try {
        aiState.unsubscribe();
      } catch {
        /* 忽略 */
      }
    }
    aiState.unsubscribe = LP.onAiChunk((data) => {
      if (!data || data.requestId !== aiState.requestId) return;
      aiState.text += data.delta || '';
      const body = $('aiPanelBody');
      body.textContent = aiState.text;
      body.scrollTop = body.scrollHeight;
      $('aiApplyBtn').disabled = aiState.text.trim().length === 0;
    });

    try {
      const res = await LP.aiChat({
        requestId: aiState.requestId,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey,
        messages: [
          {
            role: 'system',
            content:
              '你是一名精通现代中文写作与 Markdown 排版的资深编辑。只输出处理后的正文本身，不要开场白、解释、引号或代码块包裹。',
          },
          { role: 'user', content: act.prompt(sel.text) },
        ],
      });

      if (res && res.ok) {
        if (!aiState.text && res.text) {
          aiState.text = res.text;
          $('aiPanelBody').textContent = aiState.text;
        }
        aiSetStatus(aiState.text.trim() ? '生成完成' : '模型没有返回内容');
        $('aiApplyBtn').disabled = aiState.text.trim().length === 0;
      } else {
        aiSetStatus('失败');
        toast((res && res.error) || 'AI 请求失败', 'err');
        if (res && res.aborted) $('aiPanelBody').textContent = aiState.text;
      }
    } catch (err) {
      aiSetStatus('失败');
      toast('AI 请求失败：' + String((err && err.message) || err), 'err');
    } finally {
      aiState.busy = false;
      $('aiStopBtn').hidden = true;
    }
  }

  function aiApply() {
    const text = aiState.text.trim();
    const range = aiState.range;
    if (!text || !range) return;

    const editor = $('editor');
    const value = editor.value;
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    // 续写是"接在选区之后"，其余动作是"替换选区"
    const inserted = aiState.action === 'continue' ? '\n\n' + text : text;
    const caretSource = aiState.action === 'continue' ? before + range.text + inserted : before + inserted;
    const caret = caretSource.length;

    editor.value = aiState.action === 'continue' ? before + range.text + inserted + after : before + inserted + after;
    editor.focus();
    editor.setSelectionRange(caret, caret);
    afterEdit();
    aiClosePanel();
    aiState.range = null;
    toast('已应用 AI 结果', 'ok');
  }

  function aiTestConnection() {
    const cfg = aiSettings();
    const out = $('aiTestResult');
    if (!cfg.baseUrl || !cfg.model) {
      out.textContent = '先填服务地址和模型';
      return;
    }
    if (cfg.provider !== 'ollama' && !cfg.apiKey) {
      out.textContent = '先填 API Key';
      return;
    }
    out.textContent = '测试中…';
    const requestId = 'lp-ai-test-' + Date.now().toString(36);
    LP.aiChat({
      requestId: requestId,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      apiKey: cfg.apiKey,
      messages: [{ role: 'user', content: '只回复两个字：可用' }],
    }).then((res) => {
      out.textContent = res && res.ok ? '✓ 连通（' + (res.text || '').slice(0, 20) + '）' : '✗ ' + ((res && res.error) || '失败');
    }).catch((err) => {
      out.textContent = '✗ ' + String((err && err.message) || err);
    });
  }

  /** 设置面板里 AI 输入框的事件：只在启动时绑一次，避免反复打开设置时叠加监听。 */
  function bindAiSettingsOnce() {
    $('aiBaseUrl').addEventListener('change', async function () {
      state.settings = await LP.setSettings({ aiBaseUrl: this.value.trim() });
    });
    $('aiModel').addEventListener('change', async function () {
      state.settings = await LP.setSettings({ aiModel: this.value.trim() });
    });
    $('aiApiKey').addEventListener('change', async function () {
      state.settings = await LP.setSettings({ aiApiKey: this.value.trim() });
    });
    $('aiTestBtn').addEventListener('click', aiTestConnection);
  }

  /** 设置面板里的 AI 区块：每次打开只回填，不重复绑事件。 */
  function bindAiSettings() {
    const cfg = aiSettings();
    buildSegmented(
      'aiProviderSwitch',
      Object.keys(AI_PROVIDERS).map((key) => ({ key: key, label: AI_PROVIDERS[key].label })),
      cfg.provider,
      async (key) => {
        const preset = AI_PROVIDERS[key];
        state.settings = await LP.setSettings({
          aiProvider: key,
          aiBaseUrl: preset.baseUrl,
          aiModel: preset.model,
        });
        $('aiBaseUrl').value = preset.baseUrl;
        $('aiModel').value = preset.model;
        $('aiProviderHint').textContent = preset.label;
        $('aiTestResult').textContent = '';
      },
    );
    $('aiProviderHint').textContent = AI_PROVIDERS[cfg.provider].label;
    $('aiBaseUrl').value = cfg.baseUrl;
    $('aiModel').value = cfg.model;
    $('aiApiKey').value = cfg.apiKey;
    $('aiTestResult').textContent = '';

    // 输入框的事件只在首次绑定（见 bindAiSettingsOnce），这里只负责回填值
  }

  /** 编辑器上的 AI 交互：划词出工具条，点动作跑推理。 */
  function bindAiEditor() {
    const editor = $('editor');

    editor.addEventListener('mouseup', (event) => {
      aiState.pointer = { x: event.clientX, y: event.clientY };
      setTimeout(aiSyncToolbar, 0);
    });
    editor.addEventListener('keyup', (event) => {
      if (event.shiftKey || event.key === 'Shift' || event.key === 'a' || event.key === 'A') {
        aiState.pointer = null;
      }
      aiSyncToolbar();
    });
    editor.addEventListener('compositionstart', () => {
      aiState.composing = true;
      aiHideToolbar();
    });
    editor.addEventListener('compositionend', () => {
      aiState.composing = false;
    });
    editor.addEventListener('scroll', aiHideToolbar);
    editor.addEventListener('blur', () => {
      // 点了工具条本身也会触发 blur，延迟一拍再判断
      setTimeout(() => {
        const bar = $('aiToolbar');
        if (bar && bar.matches(':hover')) return;
        aiHideToolbar();
      }, 160);
    });

    $('aiToolbar').addEventListener('mousedown', (event) => {
      // 阻止默认行为，避免点按钮时 textarea 失焦把选区弄丢
      event.preventDefault();
    });
    $('aiToolbar').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-ai]');
      if (!btn) return;
      const action = btn.getAttribute('data-ai');
      if (action === '__settings') {
        aiHideToolbar();
        openSettings();
        return;
      }
      aiRun(action);
    });

    $('aiPanelClose').addEventListener('click', aiClosePanel);
    $('aiDiscardBtn').addEventListener('click', aiClosePanel);
    $('aiStopBtn').addEventListener('click', aiStop);
    $('aiApplyBtn').addEventListener('click', aiApply);

    window.addEventListener('resize', aiHideToolbar);
  }

  async function openSettings() {
    buildSegmented(
      'themeSwitch',
      [
        { key: 'system', label: '跟随系统' },
        { key: 'light', label: '浅色' },
        { key: 'dark', label: '深色' },
      ],
      state.settings.theme || 'dark',
      async (key) => {
        state.settings = await LP.setSettings({ theme: key });
        applyTheme();
        renderPreview();
      },
    );
    bindAiSettings();
    if (!state.appInfo) {
      try {
        state.appInfo = await LP.appInfo();
      } catch (err) {
        state.appInfo = null;
      }
    }
    const dir = (state.appInfo && state.appInfo.dataDir) || '本机';
    $('dataDirText').textContent = dir;
    $('aboutText').textContent =
      'LongPost ' +
      ((state.appInfo && state.appInfo.version) || '') +
      ' · ' +
      ((state.appInfo && state.appInfo.platform) || 'web') +
      ' · 当前环境：' +
      (LP && LP.platformLabel ? LP.platformLabel : '未知') +
      '。正文、图片、附件全部保存在你自己的设备上，不联网、不上传。';
    $('openDataDir').hidden = !CAPS.openDataDir;
    openSheet('settingsModal');
  }

  // ------------------------------------------------------------ 回收站

  async function openTrash() {
    const rows = await LP.listTrash();
    const host = $('trashList');
    if (!rows.length) {
      host.innerHTML = '<div class="list-empty small">' + icon('trash') + '<p>回收站是空的。</p></div>';
    } else {
      host.innerHTML = rows
        .map(
          (row) =>
            '<div class="panel-row" data-id="' +
            esc(row.id) +
            '"><div class="panel-main"><div class="panel-title">' +
            esc(row.title || '未命名') +
            '</div><div class="panel-sub">' +
            (row.chars || 0) +
            ' 字 · 删除于 ' +
            (formatTime(row.deletedAt) || '—') +
            '</div></div><div class="panel-acts"><button class="btn ghost sm" data-restore="' +
            esc(row.id) +
            '">恢复</button><button class="btn ghost sm danger" data-purge="' +
            esc(row.id) +
            '">彻底删除</button></div></div>',
        )
        .join('');
    }
    openSheet('trashModal');
  }

  // ------------------------------------------------------------ 标签

  function openTags(editable) {
    const canEdit = Boolean(editable && state.current);
    $('tagsEditField').hidden = !canEdit;
    $('tagsCancel').hidden = !canEdit;
    $('tagsSave').hidden = !canEdit;
    $('tagsInput').value = canEdit ? (state.current.tags || []).join(', ') : '';
    renderTagCloud(canEdit);
    openSheet('tagsModal');
  }

  async function renderTagCloud(editable) {
    const tags = await LP.listTags();
    const host = $('tagCloud');
    if (!tags.length) {
      host.innerHTML = '<div class="list-empty small">' + icon('tag') + '<p>还没有标签。在编辑器里点「标签」给文章加一个。</p></div>';
      return;
    }
    host.innerHTML = tags
      .map(
        (tag) =>
          '<button type="button" class="chip' +
          (state.tagFilter === tag.name ? ' on' : '') +
          '" data-tag="' +
          esc(tag.name) +
          '">' +
          esc(tag.name) +
          '<span class="chip-count">' +
          tag.count +
          '</span></button>',
      )
      .join('');
    host.dataset.editable = editable ? '1' : '';
  }

  async function saveTags() {
    if (!state.current) return;
    // 必须切成数组：repo.normalizeTags 只认数组，传字符串会被当成 [] 静默丢掉
    const tags = $('tagsInput')
      .value.split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    // setTags 返回 { ok, tags }，不是文章——别覆盖 state.current，否则下次自动保存会新建一篇
    const res = await LP.setTags(state.current.id, tags);
    if (res && res.ok === false) {
      toast('保存标签失败：' + (res.error || '未知错误'), 'err');
      return;
    }
    state.current.tags = (res && res.tags) || tags;
    await refreshAll();
    refreshPinButton();
    closeSheet('tagsModal');
    toast('标签已保存', 'ok');
  }

  // ------------------------------------------------------------ 历史版本

  async function openHistory() {
    if (!state.current) return;
    const rows = await LP.listRevisions(state.current.id);
    const host = $('historyList');
    if (!rows.length) {
      host.innerHTML = '<div class="list-empty small">' + icon('clock') + '<p>还没有历史版本。改一改、保存一次就会出现。</p></div>';
    } else {
      host.innerHTML = rows
        .map(
          (row) =>
            '<div class="panel-row" data-index="' +
            row.index +
            '"><div class="panel-main"><div class="panel-title">' +
            esc(row.title || '未命名') +
            ' <span class="panel-tag">' +
            (row.chars || 0) +
            ' 字</span></div><div class="panel-sub">' +
            (formatTime(row.at) || '—') +
            ' · ' +
            esc(row.summary || '') +
            '</div></div><div class="panel-acts"><button class="btn ghost sm" data-rollback="' +
            row.index +
            '">回滚</button></div></div>',
        )
        .join('');
    }
    openSheet('historyModal');
  }

  // ------------------------------------------------------------ 图表对话框

  function buildTypeButtons() {
    const host = $('chartTypes');
    host.innerHTML = CH.CHART_TYPES.map(
      (type) =>
        '<button type="button" class="seg' +
        (type === state.dialogType ? ' on' : '') +
        '" data-key="' +
        type +
        '" aria-pressed="' +
        (type === state.dialogType ? 'true' : 'false') +
        '">' +
        CH.TYPE_LABELS[type] +
        '</button>',
    ).join('');
  }

  function seriesRowHtml(index, name, data) {
    return (
      '<div class="series-row" data-index="' +
      index +
      '"><input class="series-name" type="text" value="' +
      esc(name || '') +
      '" placeholder="系列名" aria-label="系列名" /><input class="series-data" type="text" value="' +
      esc(data || '') +
      '" placeholder="1, 2, 3" aria-label="系列数据" /><button type="button" class="icon-btn series-del" aria-label="删掉这条">' +
      icon('x') +
      '</button></div>'
    );
  }

  function addSeriesRow(name, data) {
    const list = $('seriesList');
    const index = list.children.length;
    const holder = document.createElement('div');
    holder.innerHTML = seriesRowHtml(index, name, data);
    const row = holder.firstChild;
    row.querySelector('.series-del').addEventListener('click', () => {
      row.remove();
      renumberSeries();
    });
    list.appendChild(row);
    renumberSeries();
  }

  function renumberSeries() {
    Array.prototype.slice.call($('seriesList').children).forEach((row, i) => {
      row.dataset.index = String(i);
    });
  }

  function applyDialogType() {
    const pie = state.dialogType === 'pie';
    $('cartesianFields').hidden = pie;
    $('pieFields').hidden = !pie;
    $('chartHeight').value = String(
      pie ? (state.pendingChart && state.pendingChart.height) || 320 : CH.DEFAULT_CHART_HEIGHT,
    );
    $('heightHint').textContent = $('chartHeight').value + ' px';
    buildTypeButtons();
    previewChart();
  }

  /** 只填表单，不画图（画图交给 previewChart，等抽屉可见了再调用）。 */
  function resetChartForm() {
    state.dialogType = 'bar';
    $('chartTitle').value = '';
    $('chartX').value = '1月, 2月, 3月, 4月';
    $('seriesList').innerHTML = '';
    addSeriesRow('系列 1', '12, 19, 8, 15');
    $('chartPie').value = '技术, 42\n随笔, 28\n读书, 18\n其他, 12';
    $('chartError').textContent = '';
    $('chartHeight').value = String(CH.DEFAULT_CHART_HEIGHT);
    $('heightHint').textContent = $('chartHeight').value + ' px';
    $('cartesianFields').hidden = false;
    $('pieFields').hidden = true;
    buildTypeButtons();
  }

  function currentChartCard() {
    const type = state.dialogType;
    const title = $('chartTitle').value.trim();
    const height = Number($('chartHeight').value) || CH.DEFAULT_CHART_HEIGHT;
    if (type === 'pie') {
      const data = $('chartPie')
        .value.split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/[,，]/);
          const name = (parts[0] || '').trim();
          const value = Number((parts[1] || '').trim());
          return { name: name || '未命名', value: isNaN(value) ? 0 : value };
        });
      return { type: type, title: title, data: data, height: height };
    }
    const xAxis = $('chartX')
      .value.split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const series = Array.prototype.slice.call($('seriesList').children).map((row, i) => {
      const name = row.querySelector('.series-name').value.trim() || '系列 ' + (i + 1);
      const data = row
        .querySelector('.series-data')
        .value.split(/[,，]/)
        .map((s) => Number(s.trim()))
        .map((n) => (isNaN(n) ? 0 : n));
      return { name: name, data: data };
    });
    return { type: type, title: title, xAxis: xAxis, series: series, height: height };
  }

  /** 表单 -> 卡片，再过一遍 CH.parseChartCard 校验，跟写进正文的完全一致。 */
  function normalizedCard() {
    let parsed = null;
    try {
      parsed = CH.parseChartCard(JSON.stringify(currentChartCard()));
    } catch (err) {
      parsed = null;
    }
    return parsed;
  }

  function chartTheme() {
    return resolvedTheme();
  }

  function previewChart() {
    const box = $('chartPreviewBox');
    const errBox = $('chartError');
    errBox.textContent = '';

    if (!window.echarts) {
      box.innerHTML = '<div class="chart-bad">图表运行库没加载</div>';
      return;
    }

    const card = normalizedCard();
    if (!card) {
      errBox.textContent = '图表数据不完整：检查一下 x 轴分类数、每个系列的数值个数是否对得上。';
      box.innerHTML = '';
      if (state.pendingChart) {
        try {
          state.pendingChart.dispose();
        } catch (err) {
          /* 忽略 */
        }
        state.pendingChart = null;
      }
      return;
    }

    try {
      if (!state.pendingChart) {
        box.innerHTML = '';
        state.pendingChart = window.echarts.init(box, null, { renderer: 'canvas' });
      }
      state.pendingChart.setOption(CH.chartCardToEchartsOption(card, chartTheme()), true);
      state.pendingChart.resize();
    } catch (err) {
      errBox.textContent = '预览失败：' + String((err && err.message) || err);
    }
  }

  function openChartDialog() {
    if (!state.current) {
      toast('先打开一篇文章');
      return;
    }
    disposePendingChart();
    $('chartPreviewBox').innerHTML = '';
    resetChartForm();
    openSheet('chartModal');
    // 等抽屉真正显示出来（有宽高）再画，否则 ECharts 会画成 0×0
    setTimeout(() => {
      previewChart();
      if (state.pendingChart) state.pendingChart.resize();
    }, 40);
  }

  function closeChartDialog() {
    closeSheet('chartModal');
  }

  function confirmChartInsert() {
    const card = normalizedCard();
    if (!card) {
      $('chartError').textContent = '图表数据不完整，先补全再插入。';
      return;
    }
    const code = CH.encodeChartCard(card);
    const editor = $('editor');
    const pos = editor.selectionStart;
    const before = editor.value.slice(0, pos);
    const prefix = before.length && !/\n\s*$/.test(before) ? '\n\n' : '';
    insertAtCursor(prefix + code + '\n\n');
    closeChartDialog();
    toast('图表已插入正文', 'ok');
  }

  // ==========================================================================
  // 14. 视图 / 窄屏
  // ==========================================================================

  function setPaneMode(mode) {
    const ok = ['write', 'split', 'preview'].indexOf(mode) === -1 ? 'write' : mode;
    state.paneMode = ok;
    $('panes').dataset.mode = ok;
    $('paneWrite').classList.toggle('on', ok === 'write');
    $('paneSplit').classList.toggle('on', ok === 'split');
    $('panePreview').classList.toggle('on', ok === 'preview');
    // 从「写作」切回对照/预览时预览容器才有宽度，得重画一次图表
    if (ok !== 'write') renderPreview();
    setTimeout(resizeCharts, 60);
  }

  /**
   * 切页（列表 / 写作）之前先收掉浮在最上面的抽屉。
   * 验证方点出的问题：从「大纲」点底部导航的「列表」返回后，大纲抽屉没关、
   * 底栏高亮还停在「大纲」（因为 outlineOn 仍然为真），看起来像点了没反应。
   * 只收「纯查看」的浮层：大纲抽屉与设置抽屉（设置里的改动都是即时生效的，没有未保存内容）。
   */
  function dismissOverlays() {
    const panel = $('outlinePanel');
    if (panel && !panel.hidden) {
      applyOutlineState(false);
      syncSegmentedActive('outlineSwitch', 'off');
      LP.setSettings({ showOutline: false })
        .then((next) => { state.settings = next; })
        .catch(() => {});
    }
    MODAL_IDS.forEach((id) => {
      const modal = $(id);
      if (modal && !modal.hidden) closeSheet(id);
    });
    closeMenu();
  }

  /** 放不下时按这个顺序逐个收进「更多」—— 每一项在「更多」菜单里都有等价入口 */
  const TOOLBAR_FOLD_ORDER = [
    'btnFile', 'btnImage', 'btnChart', 'btnPin', 'btnTagsEdit',
    'btnFind', 'btnReading', 'btnOutline', 'btnPreview', 'btnShare',
  ];

  /**
   * 工具条别让按钮跑到视口外面去（验证方 D3：1320 宽时「更多」溢出 236px，
   * 而且没有任何横滑提示）。做法不是猜媒体查询断点，而是**按实测溢出**折叠：
   * 先把上一次的折叠清掉，再一个个收，直到不再溢出；真还有溢出就补右缘渐隐提示。
   */
  function syncToolsOverflow() {
    const bar = document.querySelector('.toolbar');
    if (!bar) return;
    const tools = bar.querySelector('.tools');
    if (!tools) return;
    TOOLBAR_FOLD_ORDER.forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove('folded');
    });
    tools.classList.remove('condensed');
    if (isNarrow()) {
      // 窄屏用自己那套（只留 3 个高频键 + 更多），别在这里折叠
      bar.classList.remove('overflowing');
      return;
    }
    // 两种溢出都要算：宽度 >1240 时 .tools 有自己的 max-width，溢出发生在**内部**
    // （scrollWidth > clientWidth）；<=1240 放开 max-width 后溢出跑到**容器外**
    // （tools 右缘越过工具条右缘）。只量一种会把后者漏掉。
    const overNow = () => {
      const row = bar.getBoundingClientRect();
      const box = tools.getBoundingClientRect();
      return tools.scrollWidth - tools.clientWidth > 4 || box.right - row.right > 0.5;
    };
    // 第一档：隐藏按钮文字，只留图标；多数桌面宽度下这一档就够了
    tools.classList.add('condensed');
    if (!overNow()) {
      bar.classList.toggle('overflowing', false);
      return;
    }

    // 第二档：仍放不下，才按优先级收进「更多」
    let guard = 0;
    while (overNow() && guard < TOOLBAR_FOLD_ORDER.length) {
      const el = $(TOOLBAR_FOLD_ORDER[guard]);
      if (el) el.classList.add('folded');
      guard += 1;
    }
    bar.classList.toggle('overflowing', overNow());
  }

  function syncTabs() {
    const view = $('app').dataset.view;
    const outlineOn = !$('outlinePanel').hidden;
    const settingsOn = !$('settingsModal').hidden;
    $('tabList').classList.toggle('on', view === 'list' && !outlineOn && !settingsOn);
    $('tabEdit').classList.toggle('on', view === 'editor' && !outlineOn && !settingsOn);
    $('tabOutline').classList.toggle('on', outlineOn);
    $('tabSettings').classList.toggle('on', settingsOn);
  }

  function showList() {
    void flushBeforeSwitch();
    dismissOverlays();
    $('app').dataset.view = 'list';
    $('ambientBar').hidden = true;
    if (hasLayer('view:editor')) closeLayerByName('view:editor', false);
    syncTabs();
    renderList();
  }

  /**
   * 软键盘：手机上键盘弹起来会盖住底部，这里把「键盘占掉的高度」算成
   * --kb-inset 变量，编辑区自己让开；顺带在输入框获得焦点后把它滚进视野。
   */
  function setupKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', inset > 80 ? inset + 'px' : '0px');
      document.documentElement.classList.toggle('kb-open', inset > 120);
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    document.addEventListener('focusin', (event) => {
      const el = event.target;
      if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      setTimeout(() => {
        try {
          el.scrollIntoView({ block: 'center' });
        } catch (err) {
          /* 忽略 */
        }
      }, 260);
    });
  }

  function setupSplitter() {
    const splitter = $('splitter');
    const panes = $('panes');
    let dragging = false;
    splitter.addEventListener('pointerdown', (event) => {
      dragging = true;
      splitter.classList.add('dragging');
      try {
        splitter.setPointerCapture(event.pointerId);
      } catch (err) {
        /* 忽略 */
      }
    });
    splitter.addEventListener('pointermove', (event) => {
      if (!dragging || isNarrow()) return;
      const rect = panes.getBoundingClientRect();
      const ratio = Math.min(0.8, Math.max(0.2, (event.clientX - rect.left) / rect.width));
      panes.style.setProperty('--split', ratio.toFixed(4));
      $('editor').style.flex = '0 0 auto';
      $('editor').style.width = ratio * 100 + '%';
      $('preview').style.width = (1 - ratio) * 100 + '%';
      resizeCharts();
    });
    const stop = () => {
      dragging = false;
      splitter.classList.remove('dragging');
    };
    splitter.addEventListener('pointerup', stop);
    splitter.addEventListener('pointercancel', stop);
  }

  // ==========================================================================
  // 专业版专属四大生产力工具：知识图谱 / 写作实验室 / 版本差分 / 灵感白板
  // ==========================================================================

  let graphChart = null;
  async function openGraph() {
    openSheet('graphModal');
    $('graphSummary').textContent =
      '基于本地文章双链、标签与引用自动生成的知识力导向关系网络。拖拽节点可缩放交互，点击节点可直达对应文章。';
    const container = $('graphContainer');
    if (!window.echarts || !container) return;

    if (!graphChart) {
      graphChart = window.echarts.init(container);
      graphChart.on('click', (params) => {
        if (params.dataType === 'node' && params.data && params.data.articleId) {
          closeSheet('graphModal');
          openArticle(params.data.articleId);
        }
      });
    }

    const articles = await LP.listArticles();
    const nodes = [];
    const links = [];
    const tagSet = new Set();

    articles.forEach((a) => {
      nodes.push({
        id: 'art-' + a.id,
        name: a.title || '无标题',
        articleId: a.id,
        symbolSize: Math.min(48, Math.max(22, 16 + (a.content ? a.content.length / 80 : 5))),
        category: 0,
        itemStyle: { color: a.pinned ? '#e2b33c' : '#1f9d8b' },
      });
      (a.tags || []).forEach((t) => {
        tagSet.add(t);
        links.push({ source: 'art-' + a.id, target: 'tag-' + t });
      });
    });

    tagSet.forEach((t) => {
      nodes.push({
        id: 'tag-' + t,
        name: '#' + t,
        symbolSize: 18,
        category: 1,
        itemStyle: { color: '#1a73e8' },
      });
    });

    const isDark = document.documentElement.dataset.theme === 'dark';
    graphChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        formatter: (params) =>
          params.dataType === 'node' ? params.data.name + (params.data.articleId ? ' (点击直达)' : '') : '',
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          data: nodes,
          links: links,
          roam: true,
          label: {
            show: true,
            position: 'right',
            color: isDark ? '#e9ecf1' : '#1c242f',
            fontSize: 11,
          },
          force: {
            repulsion: 160,
            edgeLength: [40, 100],
            gravity: 0.1,
          },
          lineStyle: {
            color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
            curveness: 0.1,
          },
        },
      ],
    });
    setTimeout(() => graphChart.resize(), 60);
  }

  function openLab() {
    openSheet('labModal');
    const text = ($('editor') && $('editor').value) || '';
    const title = ($('title') && $('title').value) || '';
    const full = title + '\n' + text;

    const chars = full.length;
    const words = (full.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_-]+/g) || []).length;
    const paras = full.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1;
    const readMin = Math.max(1, Math.ceil(words / 300));

    $('labStatsGrid').innerHTML = `
      <div class="lab-card"><div class="lab-card-val">${words}</div><div class="lab-card-lbl">总词数</div></div>
      <div class="lab-card"><div class="lab-card-val">${chars}</div><div class="lab-card-lbl">总字符数</div></div>
      <div class="lab-card"><div class="lab-card-val">${paras}</div><div class="lab-card-lbl">有效段落</div></div>
      <div class="lab-card"><div class="lab-card-val">${readMin} min</div><div class="lab-card-lbl">预计阅读时间</div></div>
    `;

    const rawTokens = full.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z]{3,}/g) || [];
    const stopWords = new Set(['这个', '那个', '因为', '所以', '如果', '以及', '通过', '进行', '可以', '我们', 'the', 'and', 'for', 'with']);
    const counts = new Map();
    rawTokens.forEach((t) => {
      const lower = t.toLowerCase();
      if (!stopWords.has(lower)) counts.set(lower, (counts.get(lower) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    $('labWordFreq').innerHTML = sorted.length
      ? sorted
          .map(
            ([k, v]) =>
              `<span class="lab-chip lab-keyword-chip" data-kw="${esc(k)}" title="点击添加「${esc(k)}」为文章标签">${esc(k)} <b>${v}</b> ＋</span>`,
          )
          .join('')
      : '<span class="hint">词量较少，暂无高频词</span>';

    $('labWordFreq').onclick = (e) => {
      const chip = e.target.closest('.lab-keyword-chip');
      if (!chip || !chip.dataset.kw) return;
      const kw = chip.dataset.kw;
      if (!state.current) return;
      const tags = (state.current.tags || []).slice();
      if (tags.includes(kw)) {
        toast('标签 #' + kw + ' 已存在');
        return;
      }
      tags.push(kw);
      state.current.tags = tags;
      if (LP && typeof LP.setTags === 'function') {
        LP.setTags(state.current.id, tags).catch(() => {});
      }
      markDirty();
      toast('已将「' + kw + '」添加为文章标签', 'ok');
    };

    const checklist = [];
    const openParen = (full.match(/[（(]/g) || []).length;
    const closeParen = (full.match(/[）)]/g) || []).length;
    checklist.push({
      id: 'paren',
      ok: openParen === closeParen,
      canFix: false,
      text: openParen === closeParen ? `括号闭合完整 (共 ${openParen} 对)` : `注意：括号未闭合 (左括号 ${openParen} 个，右括号 ${closeParen} 个)`,
    });

    const hasHeadings = /^#{1,6}\s+/m.test(full);
    checklist.push({
      id: 'headings',
      ok: hasHeadings,
      canFix: !hasHeadings,
      fixLabel: '设首行为标题',
      text: hasHeadings ? '文章层级结构清晰 (包含 Markdown 标题)' : '建议：添加 Markdown 标题 (# 一级，## 二级) 提高可读性',
    });

    const doubleBlanks = /\n{3,}/.test(full);
    checklist.push({
      id: 'blanks',
      ok: !doubleBlanks,
      canFix: doubleBlanks,
      fixLabel: '一键压缩',
      text: !doubleBlanks ? '段落间距规范 (无多余连续空行)' : '提示：检测到连续多行空行，建议精简保持紧凑',
    });

    const fenceMatches = (text.match(/^```/gm) || []).length;
    const fencesClosed = fenceMatches % 2 === 0;
    checklist.push({
      id: 'fences',
      ok: fencesClosed,
      canFix: !fencesClosed,
      fixLabel: '闭合代码块',
      text: fencesClosed ? '代码块围栏完整闭合' : '警告：检测到未闭合的代码块围栏 (```)',
    });

    const emptyAlt = /!\[\s*\]\(/g.test(text);
    checklist.push({
      id: 'alt',
      ok: !emptyAlt,
      canFix: emptyAlt,
      fixLabel: '补齐Alt',
      text: !emptyAlt ? '插图均配有无障碍 Alt 说明' : '建议：部分插图缺失 Alt 说明，建议补齐',
    });

    $('labChecklist').innerHTML = checklist
      .map(
        (c) =>
          `<li class="lab-checklist-item ${c.ok ? 'ok' : 'warn'}"><span class="lab-checklist-text">${c.ok ? '✓' : ''} ${esc(c.text)}</span>${!c.ok && c.canFix ? `<button class="lab-fix-btn" data-fix="${c.id}">${c.fixLabel || '一键修'}</button>` : ''}</li>`,
      )
      .join('');

    $('labChecklist').onclick = (e) => {
      const btn = e.target.closest('.lab-fix-btn');
      if (!btn || !btn.dataset.fix) return;
      applyLabFix(btn.dataset.fix);
    };
  }

  function applyLabFix(fixId) {
    const editor = $('editor');
    if (!editor) return;
    const oldVal = editor.value;
    let newVal = oldVal;
    let desc = '';

    if (fixId === 'blanks') {
      newVal = oldVal.replace(/\n{3,}/g, '\n\n');
      desc = '已压缩连续多行空行';
    } else if (fixId === 'fences') {
      newVal = oldVal + (/\n$/.test(oldVal) ? '' : '\n') + '```\n';
      desc = '已闭合代码块围栏';
    } else if (fixId === 'alt') {
      newVal = oldVal.replace(/!\[\s*\]\(/g, '![插图](');
      desc = '已补齐插图 Alt 说明占位';
    } else if (fixId === 'headings') {
      const curTitle = ($('title') && $('title').value.trim()) || '文章标题';
      newVal = '# ' + curTitle + '\n\n' + oldVal;
      desc = '已在首行添加主标题';
    }

    if (newVal !== oldVal) {
      editor.value = newVal;
      markDirty();
      renderPreview();
      openLab();
      toast(desc + '（Ctrl+Z 可撤销）', 'ok');
    }
  }

  // ==========================================================================
  // 常驻后台监视调度器与排版提议落盘
  // ==========================================================================

  function evaluateArticleProposals(title, content) {
    const full = (title || '') + '\n' + (content || '');
    const proposals = [];

    // 1. 连续多行空行
    if (/\n{3,}/.test(content || '')) {
      proposals.push({
        id: 'blanks',
        type: 'format',
        fixLabel: '压缩空行',
        text: '检测到连续多行空行，建议精简保持紧凑',
        canFix: true,
        resolved: false,
      });
    }

    // 2. 未闭合代码围栏
    const fenceMatches = ((content || '').match(/^```/gm) || []).length;
    if (fenceMatches % 2 !== 0) {
      proposals.push({
        id: 'fences',
        type: 'syntax',
        fixLabel: '闭合代码块',
        text: '检测到未闭合的代码块围栏 (```)',
        canFix: true,
        resolved: false,
      });
    }

    // 3. 缺失 Alt 的插图
    if (/!\[\s*\]\(/.test(content || '')) {
      proposals.push({
        id: 'alt',
        type: 'a11y',
        fixLabel: '补齐Alt',
        text: '部分插图缺失 Alt 说明，建议补齐',
        canFix: true,
        resolved: false,
      });
    }

    // 4. 缺少 Markdown 标题（有一定正文长度时）
    if ((content || '').trim().length > 60 && !/^#{1,6}\s+/m.test(full)) {
      proposals.push({
        id: 'headings',
        type: 'structure',
        fixLabel: '设首行为标题',
        text: '建议添加 Markdown 标题 (# 一级，## 二级) 提高可读性',
        canFix: true,
        resolved: false,
      });
    }

    // 5. 损坏的图表卡片 JSON
    const chartBlocks = (content || '').match(/```chart\s*\n([\s\S]*?)```/g) || [];
    let brokenChart = false;
    for (let i = 0; i < chartBlocks.length; i++) {
      const raw = chartBlocks[i].replace(/^```chart\s*\n/, '').replace(/\n```$/, '');
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.type || !parsed.data) brokenChart = true;
      } catch (err) {
        brokenChart = true;
      }
    }
    if (brokenChart) {
      proposals.push({
        id: 'chart',
        type: 'data',
        fixLabel: '检查图表',
        text: '检测到格式损坏的图表卡片 JSON',
        canFix: false,
        resolved: false,
      });
    }

    return proposals;
  }

  function scheduleIdleAnalysis() {
    if (ambientIdleHandle) cIC(ambientIdleHandle);
    ambientIdleHandle = rIC(() => {
      ambientIdleHandle = null;
      runAmbientAnalysis();
    });
  }

  function tickAmbientWatcher() {
    if (!state.current || $('app').dataset.view !== 'editor') return;
    scheduleIdleAnalysis();
  }

  async function runAmbientAnalysis() {
    if (!state.current || !$('editor')) return;
    const currentId = state.current.id;
    const title = ($('title') && $('title').value) || '';
    const content = ($('editor') && $('editor').value) || '';
    const fresh = evaluateArticleProposals(title, content);

    const prev = Array.isArray(state.current.proposals) ? state.current.proposals : [];
    const prevUnresolved = prev.filter((p) => !p.resolved);
    const freshUnresolved = fresh.filter((p) => !p.resolved);

    const same =
      prevUnresolved.length === freshUnresolved.length &&
      prevUnresolved.every((p, idx) => p.id === freshUnresolved[idx].id);

    if (!same) {
      state.current.proposals = fresh;
      if (LP && typeof LP.saveProposals === 'function') {
        await LP.saveProposals(currentId, fresh).catch(() => {});
      }
      const found = state.articles.find((a) => a.id === currentId);
      if (found) {
        found.proposalsCount = freshUnresolved.length;
        renderList();
      }
    }

    renderAmbientBar();
  }

  function renderAmbientBar() {
    const bar = $('ambientBar');
    const textEl = $('ambientText');
    if (!bar || !textEl) return;

    if (!state.current || $('app').dataset.view !== 'editor') {
      bar.hidden = true;
      return;
    }

    if (ambientDismissedArticleId === state.current.id) {
      bar.hidden = true;
      return;
    }

    const unresolved = (state.current.proposals || []).filter((p) => !p.resolved);
    if (unresolved.length === 0) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    const labels = unresolved.map((p) => p.fixLabel || p.text).slice(0, 3).join('、');
    textEl.textContent = '检测到 ' + unresolved.length + ' 条可优化的排版建议：' + labels;
  }

  async function applyAllProposals() {
    if (!state.current || !$('editor')) return;
    const editor = $('editor');
    const oldVal = editor.value;
    let newVal = oldVal;
    const curTitle = ($('title') && $('title').value.trim()) || '文章标题';

    const unresolved = (state.current.proposals || []).filter((p) => !p.resolved && p.canFix);
    if (!unresolved.length) {
      toast('当前没有可自动优化的排版建议');
      return;
    }

    unresolved.forEach((p) => {
      if (p.id === 'blanks') {
        newVal = newVal.replace(/\n{3,}/g, '\n\n');
      } else if (p.id === 'fences') {
        newVal = newVal + (/\n$/.test(newVal) ? '' : '\n') + '```\n';
      } else if (p.id === 'alt') {
        newVal = newVal.replace(/!\[\s*\]\(/g, '![插图](');
      } else if (p.id === 'headings') {
        newVal = '# ' + curTitle + '\n\n' + newVal;
      }
    });

    if (newVal !== oldVal) {
      editor.value = newVal;
      markDirty();
      renderPreview();
    }

    const allResolved = (state.current.proposals || []).map((p) => Object.assign({}, p, { resolved: true }));
    state.current.proposals = allResolved;
    if (LP && typeof LP.saveProposals === 'function') {
      await LP.saveProposals(state.current.id, allResolved).catch(() => {});
    }

    const found = state.articles.find((a) => a.id === state.current.id);
    if (found) {
      found.proposalsCount = 0;
      renderList();
    }

    renderAmbientBar();
    toast('已一键优化所有排版问题（Ctrl+Z 可撤销）', 'ok');
  }

  function dismissAmbient() {
    if (state.current) ambientDismissedArticleId = state.current.id;
    $('ambientBar').hidden = true;
    toast('已暂存排版建议，可在「写作实验室」中随时查看');
  }

  let diffRevs = [];
  async function openDiff() {
    openSheet('diffModal');
    const select = $('diffRevSelect');
    select.innerHTML = '';
    $('diffContainer').innerHTML = '<div class="hint">正在加载历史版本…</div>';

    if (!state.current || !state.current.id) {
      $('diffContainer').innerHTML = '<div class="hint">当前无打开的文章</div>';
      return;
    }
    diffRevs = await LP.listRevisions(state.current.id);
    if (!diffRevs.length) {
      $('diffContainer').innerHTML = '<div class="hint">本文暂无历史版本记录（每次编辑保存都会自动沉淀历史快照）</div>';
      return;
    }
    diffRevs.forEach((r, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      const ts = r.at || r.time;
      opt.textContent = `版本 #${diffRevs.length - idx} - ${ts ? new Date(ts).toLocaleString() : ''} (${r.chars != null ? r.chars : (r.content || '').length} 字)`;
      select.appendChild(opt);
    });
    updateDiffContent();
  }

  function updateDiffContent() {
    const select = $('diffRevSelect');
    const idx = Number(select ? select.value : 0) || 0;
    const base = diffRevs[idx] ? diffRevs[idx].content || '' : '';
    const current = ($('editor') && $('editor').value) || '';

    const baseLines = base.split('\n');
    const currLines = current.split('\n');
    const diffHtml = [];

    const max = Math.max(baseLines.length, currLines.length);
    for (let i = 0; i < max; i++) {
      const b = baseLines[i];
      const c = currLines[i];
      if (b === undefined) {
        diffHtml.push(`<div class="diff-line add">+ ${esc(c)}</div>`);
      } else if (c === undefined) {
        diffHtml.push(`<div class="diff-line del">- ${esc(b)}</div>`);
      } else if (b !== c) {
        diffHtml.push(`<div class="diff-line del">- ${esc(b)}</div>`);
        diffHtml.push(`<div class="diff-line add">+ ${esc(c)}</div>`);
      } else {
        diffHtml.push(`<div class="diff-line same">  ${esc(c)}</div>`);
      }
    }
    $('diffContainer').innerHTML = diffHtml.join('') || '<div class="hint">内容完全一致，无改动差异</div>';
  }

  let boardTool = 'pen';
  let isBoardDrawing = false;
  let boardStartPos = { x: 0, y: 0 };
  let boardSnapshot = null;

  function setBoardTool(tool) {
    boardTool = tool;
    ['boardToolPen', 'boardToolRect', 'boardToolArrow', 'boardToolText'].forEach((id) => {
      const btn = $(id);
      if (btn) btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  function clearBoardCanvas() {
    const canvas = $('boardCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function openBoard() {
    openSheet('boardModal');
    const canvas = $('boardCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!canvas.dataset.inited) {
      canvas.dataset.inited = '1';
      clearBoardCanvas();

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) * (canvas.width / rect.width),
          y: (clientY - rect.top) * (canvas.height / rect.height),
        };
      };

      const start = (e) => {
        isBoardDrawing = true;
        boardStartPos = getPos(e);
        boardSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (boardTool === 'pen') {
          ctx.beginPath();
          ctx.moveTo(boardStartPos.x, boardStartPos.y);
        }
      };

      const move = (e) => {
        if (!isBoardDrawing) return;
        const pos = getPos(e);
        const color = document.documentElement.dataset.theme === 'dark' ? '#1a73e8' : '#2b3441';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        if (boardTool === 'pen') {
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        } else if (boardTool === 'rect') {
          ctx.putImageData(boardSnapshot, 0, 0);
          ctx.strokeRect(boardStartPos.x, boardStartPos.y, pos.x - boardStartPos.x, pos.y - boardStartPos.y);
        } else if (boardTool === 'arrow') {
          ctx.putImageData(boardSnapshot, 0, 0);
          ctx.beginPath();
          ctx.moveTo(boardStartPos.x, boardStartPos.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
      };

      const end = () => {
        if (!isBoardDrawing) return;
        isBoardDrawing = false;
        if (boardTool === 'text') {
          const text = prompt('输入要标注在画布上的文字：');
          if (text) {
            ctx.font = '16px sans-serif';
            ctx.fillStyle = '#1a73e8';
            ctx.fillText(text, boardStartPos.x, boardStartPos.y);
          }
        }
      };

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', end);
    }
    $('boardCanvasBox') && ($('boardCanvasBox').style.background = '#ffffff');
    $('boardToolbar') && setBoardTool('pen');
  }

  function insertBoardImage() {
    const canvas = $('boardCanvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    closeSheet('boardModal');
    insertAtCursor('\n\n![白板手绘草图](' + dataUrl + ')\n\n');
    toast('白板手绘草图已插入到文章正文');
  }

  // ==========================================================================
  // 通行码登录 (Passcode) 与 Google 账号独立文章空间切换中心
  // ==========================================================================
  let currentAuthTab = 'passcode';

  function syncAuthUi() {
    const user = state.settings && state.settings.authUser;
    const btnAuth = $('btnAuth');
    const btnEmptyAuth = $('btnEmptyAuth');
    const profileBox = $('authProfileBox');
    const profileInfo = $('authProfileInfo');
    const btnLogout = $('btnAuthLogout');
    const articleCount = Array.isArray(state.articles) ? state.articles.length : 0;

    if (user && user.provider) {
      const badge = user.provider === 'google' ? 'Google 空间' : '通行码空间';
      const label = badge + ' · ' + (user.name || '创作者');
      if (btnAuth) {
        btnAuth.textContent = label;
        btnAuth.title = '当前处于独立文章空间：' + label + '（点击切换其他通行码或返回公共空间）';
      }
      if (btnEmptyAuth) {
        btnEmptyAuth.textContent = label;
      }
      if (profileBox && profileInfo) {
        profileBox.hidden = false;
        if (btnLogout) btnLogout.hidden = false;
        const sub =
          (user.provider === 'google'
            ? '绑定邮箱：' + (user.email || 'Google 账号')
            : '专属通行码：' + (user.code || '****')) +
          ' · 当前空间共 ' +
          articleCount +
          ' 篇独立文章';
        profileInfo.innerHTML =
          '<div class="auth-user-title">' + esc(badge) + ' · <strong>' + esc(user.name || '创作者') + '</strong></div>' +
          '<div class="auth-user-sub">' + esc(sub) + '</div>';
      }
    } else {
      if (btnAuth) {
        btnAuth.textContent = '登录 / 切换空间';
        btnAuth.title = '输入通行码或登录 Google 账号，切换独立的私密文章空间';
      }
      if (btnEmptyAuth) {
        btnEmptyAuth.textContent = '通行码 / Google 独立空间';
      }
      if (profileBox && profileInfo) {
        profileBox.hidden = false;
        if (btnLogout) btnLogout.hidden = true;
        profileInfo.innerHTML =
          '<div class="auth-user-title">当前处于：<strong>默认公共空间</strong>（共 ' + articleCount + ' 篇文章）</div>' +
          '<div class="auth-user-sub">下方输入任意通行码或 Google 账号，即可进入与公共空间完全隔离的独立文章空间</div>';
      }
    }
  }

  async function applyAuthSpaceSwitch(authUser, welcomePrefix) {
    await flushBeforeSwitch();
    state.settings = await LP.setSettings({ authUser: authUser || null, lastArticleId: '' });
    state.tag = '';
    clearCurrent();
    await refreshAll();
    syncAuthUi();
    if (state.articles && state.articles.length > 0) {
      await openArticle(state.articles[0].id);
    }
    const count = Array.isArray(state.articles) ? state.articles.length : 0;
    toast(welcomePrefix + '（该独立空间共 ' + count + ' 篇文章）', 'ok');
  }

  function switchAuthTab(tab) {
    currentAuthTab = tab === 'google' ? 'google' : 'passcode';
    const panePass = $('authPanePasscode');
    const paneGoogle = $('authPaneGoogle');
    if (panePass) panePass.hidden = currentAuthTab !== 'passcode';
    if (paneGoogle) paneGoogle.hidden = currentAuthTab !== 'google';
    syncSegmentedActive('authTabSwitch', currentAuthTab);
  }

  function openAuthModal() {
    openSheet('authModal');
    syncAuthUi();
    buildSegmented(
      'authTabSwitch',
      [
        { key: 'passcode', label: '通行码独立空间' },
        { key: 'google', label: 'Google 独立空间' },
      ],
      currentAuthTab,
      (key) => switchAuthTab(key),
    );
    switchAuthTab(currentAuthTab);
  }

  async function handleGeneratePasscode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let seg1 = '';
    let seg2 = '';
    for (let i = 0; i < 4; i++) {
      seg1 += chars.charAt(Math.floor(Math.random() * chars.length));
      seg2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const code = 'LP-2026-' + seg1 + '-' + seg2;
    const input = $('authPasscodeInput');
    if (input) input.value = code;
    if (LP && typeof LP.copyText === 'function') {
      await LP.copyText(code).catch(() => {});
    }
    toast('已生成新通行码并复制到剪贴板：' + code, 'ok');
  }

  async function handlePasscodeLogin() {
    const input = $('authPasscodeInput');
    const code = (input ? input.value : '').trim();
    if (!code || code.length < 4) {
      toast('请输入有效的通行码（至少 4 位），或点击「生成通行码」', 'err');
      if (input) input.focus();
      return;
    }
    const normalizedCode = code.toUpperCase();
    const suffix = normalizedCode.slice(-4);
    const authUser = {
      provider: 'passcode',
      name: '通行证 #' + suffix,
      code: normalizedCode,
      spaceKey: 'code:' + normalizedCode,
      loginAt: new Date().toISOString(),
    };
    closeSheet('authModal');
    await applyAuthSpaceSwitch(authUser, '已切入通行码独立空间「#' + suffix + '」');
  }

  async function handleGoogleLogin() {
    const emailInput = $('authGoogleEmail');
    const pinInput = $('authGooglePin');
    const nameInput = $('authGoogleName');
    const email = (emailInput ? emailInput.value : '').trim().toLowerCase();
    const pin = (pinInput ? pinInput.value : '').trim();
    const rawName = (nameInput ? nameInput.value : '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('请输入有效的 Google 邮箱地址', 'err');
      if (emailInput) emailInput.focus();
      return;
    }
    if (!pin || pin.length < 4) {
      toast('请输入至少 4 位空间安全口令（用于加密保护该 Google 独立空间）', 'err');
      if (pinInput) pinInput.focus();
      return;
    }
    const name = rawName || email.split('@')[0];
    const authUser = {
      provider: 'google',
      name: name,
      email: email,
      spaceKey: 'google:' + email + ':' + pin,
      loginAt: new Date().toISOString(),
    };
    if (pinInput) pinInput.value = '';
    closeSheet('authModal');
    await applyAuthSpaceSwitch(authUser, '已解锁 Google 加密独立空间「' + name + '」');
  }

  async function handleAuthLogout() {
    closeSheet('authModal');
    await applyAuthSpaceSwitch(null, '已退出私密空间，切回默认公共空间');
  }

  // ==========================================================================
  // 15. 事件绑定
  // ==========================================================================

  function bind() {
    // ---------------------------------------------------------- 侧栏
    $('search').addEventListener('input', (event) => {
      state.query = event.target.value;
      $('btnSearchClear').hidden = !state.query;
      renderList();
    });
    $('btnSearchClear').addEventListener('click', () => {
      state.query = '';
      $('search').value = '';
      $('btnSearchClear').hidden = true;
      renderList();
      $('search').focus();
    });
    $('tagFilterSelect').addEventListener('change', (event) => {
      state.tagFilter = event.target.value;
      renderList();
    });
    $('btnNew').addEventListener('click', () => {
      newArticle();
    });
    $('btnNew2').addEventListener('click', () => {
      newArticle();
    });
    $('btnImport').addEventListener('click', importArticleFromFile);
    $('btnTags').addEventListener('click', () => openTags(false));
    $('btnTrash').addEventListener('click', openTrash);
    $('btnDataDir').addEventListener('click', openDataDir);
    $('btnSettings').addEventListener('click', openSettings);

    // 列表：点开、点标签筛选、更多、长按
    $('list').addEventListener('click', (event) => {
      if (swallowedByLongPress) {
        swallowedByLongPress = false;
        event.preventDefault();
        return;
      }
      const clear = event.target.closest('[data-act="clear-filter"]');
      if (clear) {
        clearFilters();
        return;
      }
      const create = event.target.closest('[data-act="new-article"]');
      if (create) {
        newArticle();
        return;
      }
      const chip = event.target.closest('.chip');
      if (chip) {
        const tag = chip.getAttribute('data-tag');
        state.tagFilter = state.tagFilter === tag ? '' : tag;
        $('tagFilterSelect').value = state.tagFilter;
        renderList();
        return;
      }
      const more = event.target.closest('[data-more]');
      if (more) {
        event.stopPropagation();
        openItemMenu(more.getAttribute('data-more'), more);
        return;
      }
      const item = event.target.closest('.item');
      if (item) openArticle(item.getAttribute('data-id'));
    });
    $('list').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('.item');
      if (!item) return;
      event.preventDefault();
      openArticle(item.getAttribute('data-id'));
    });
    setupLongPress();

    // ---------------------------------------------------------- 顶部操作条
    $('btnBack').addEventListener('click', showList);
  $('title').addEventListener('input', () => {
    updateStats();
    markDirty();
    scheduleIdleAnalysis();
  });
  $('btnAmbientFix').addEventListener('click', applyAllProposals);
  $('btnAmbientDetail').addEventListener('click', openLab);
  $('btnAmbientDismiss').addEventListener('click', dismissAmbient);
  $('btnPin').addEventListener('click', togglePin);
  $('btnTagsEdit').addEventListener('click', () => openTags(true));
  $('btnShare').addEventListener('click', openShare);
  $('btnChart').addEventListener('click', openChartDialog);
  $('btnImage').addEventListener('click', insertImages);
  $('btnFile').addEventListener('click', insertFiles);
  $('btnOutline').addEventListener('click', async () => {
    const next = $('outlinePanel').hidden;
    state.settings = await LP.setSettings({ showOutline: next });
    applyOutlineState(next);
    syncSegmentedActive('outlineSwitch', next ? 'on' : 'off');
  });
  $('btnReading').addEventListener('click', async () => {
    state.settings = await LP.setSettings({ readingMode: !state.settings.readingMode });
    applyPaneState();
    syncSegmentedActive('readingModeSwitch', state.settings.readingMode ? 'on' : 'off');
    setTimeout(resizeCharts, 240);
  });
  $('btnPreview').addEventListener('click', async () => {
    state.settings = await LP.setSettings({ showPreview: !state.settings.showPreview });
    applyPaneState();
    if (isNarrow() && !state.settings.showPreview) setPaneMode('write');
    setTimeout(resizeCharts, 60);
  });
  $('btnFind').addEventListener('click', openFind);

  // ---------------------------------------------------------- 双模式切换与专业工具监听
  $('btnModeSwitch').addEventListener('click', toggleWorkspaceMode);
  $('btnModeSwitchMobile').addEventListener('click', toggleWorkspaceMode);
  $('btnProGraph').addEventListener('click', openGraph);
  $('btnProLab').addEventListener('click', openLab);
  $('btnProDiff').addEventListener('click', openDiff);
  $('btnProBoard').addEventListener('click', openBoard);

  $('graphClose').addEventListener('click', () => closeSheet('graphModal'));
  $('graphOk').addEventListener('click', () => closeSheet('graphModal'));

  $('labClose').addEventListener('click', () => closeSheet('labModal'));
  $('labOk').addEventListener('click', () => closeSheet('labModal'));

  $('diffClose').addEventListener('click', () => closeSheet('diffModal'));
  $('diffOk').addEventListener('click', () => closeSheet('diffModal'));
  $('diffRevSelect').addEventListener('change', updateDiffContent);

  $('boardClose').addEventListener('click', () => closeSheet('boardModal'));
  $('boardOk').addEventListener('click', () => closeSheet('boardModal'));
  $('boardClear').addEventListener('click', clearBoardCanvas);
  $('boardInsert').addEventListener('click', insertBoardImage);
  $('boardToolPen').addEventListener('click', () => setBoardTool('pen'));
  $('boardToolRect').addEventListener('click', () => setBoardTool('rect'));
  $('boardToolArrow').addEventListener('click', () => setBoardTool('arrow'));
  $('boardToolText').addEventListener('click', () => setBoardTool('text'));

  // ---------------------------------------------------------- 登录与通行码认证绑定
  $('btnAuth').addEventListener('click', openAuthModal);
  $('btnEmptyAuth').addEventListener('click', openAuthModal);
  $('authClose').addEventListener('click', () => closeSheet('authModal'));
  $('authOk').addEventListener('click', () => closeSheet('authModal'));
  $('btnGenPasscode').addEventListener('click', handleGeneratePasscode);
  $('btnPasscodeLogin').addEventListener('click', handlePasscodeLogin);
  $('btnGoogleLogin').addEventListener('click', handleGoogleLogin);
  $('btnAuthLogout').addEventListener('click', handleAuthLogout);

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      toggleWorkspaceMode();
    }
  });

  $('btnMore').addEventListener('click', (event) => {
    openMoreMenu(event.currentTarget);
  });
  $('btnStats').addEventListener('click', openStats);

    // ---------------------------------------------------------- 长图弹窗
    $('longImageClose').addEventListener('click', () => closeSheet('longImageModal'));
    $('longImageSave').addEventListener('click', saveLongImage);
    $('longImageShare').addEventListener('click', shareLongImage);

    // ---------------------------------------------------------- 窄屏三态
    window.addEventListener('resize', () => {
      clearTimeout(state.toolsTimer);
      state.toolsTimer = setTimeout(syncToolsOverflow, 120);
    });
    syncToolsOverflow();
    setTimeout(syncToolsOverflow, 600);

    $('paneWrite').addEventListener('click', () => setPaneMode('write'));
    $('paneSplit').addEventListener('click', () => setPaneMode('split'));
    $('panePreview').addEventListener('click', () => setPaneMode('preview'));

    // ---------------------------------------------------------- 底栏
    $('tabList').addEventListener('click', showList);
    $('tabEdit').addEventListener('click', () => {
      dismissOverlays();
      if (state.current) {
        $('app').dataset.view = 'editor';
        syncTabs();
        syncToolsOverflow();
        setTimeout(resizeCharts, 40);
      } else {
        newArticle();
      }
    });
    $('tabOutline').addEventListener('click', async () => {
      if (!state.current) {
        toast('先打开一篇文章');
        return;
      }
      if (!$('settingsModal').hidden) closeSheet('settingsModal');
      if ($('app').dataset.view !== 'editor') $('app').dataset.view = 'editor';
      syncToolsOverflow();
      state.settings = await LP.setSettings({ showOutline: true });
      applyOutlineState(true);
      syncSegmentedActive('outlineSwitch', 'on');
      setTimeout(renderOutline, 60);
    });
    $('tabSettings').addEventListener('click', openSettings);

    // ---------------------------------------------------------- 格式栏
    $('fmtbar').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-act]');
      if (!btn) return;
      applyFormat(btn.getAttribute('data-act'));
    });

    // ---------------------------------------------------------- 编辑器
    const editor = $('editor');
    editor.addEventListener('input', () => {
      updateStats();
      scheduleOutline();
      markDirty();
      refreshFmtState();
      scheduleIdleAnalysis();
      if (state.find.open && !$('findBar').hidden) runFind();
    });
    editor.addEventListener('scroll', () => {
      if (state.current) {
        state.scrollMem.set(state.current.id, {
          editor: editor.scrollTop,
          preview: $('preview').scrollTop,
          panes: $('panes').scrollTop,
        });
      }
    });
    editor.addEventListener('keydown', onEditorKeydown);
    editor.addEventListener('paste', onPaste);
    editor.addEventListener('keyup', refreshFmtState);
    editor.addEventListener('mouseup', refreshFmtState);
    bindAiEditor();
    bindAiSettingsOnce();
    bindUpdates();
    bindClipBridge();
    bindSocialSlice();
    $('preview').addEventListener('scroll', () => {
      if (state.current) {
        const mem = state.scrollMem.get(state.current.id) || {};
        mem.preview = $('preview').scrollTop;
        state.scrollMem.set(state.current.id, mem);
      }
    });
    $('panes').addEventListener('scroll', () => {
      if (state.current) {
        const mem = state.scrollMem.get(state.current.id) || {};
        mem.panes = $('panes').scrollTop;
        state.scrollMem.set(state.current.id, mem);
      }
    });

    // 拖拽文件进编辑区
    const zone = $('editorWrap');
    ['dragenter', 'dragover'].forEach((type) => {
      zone.addEventListener(type, (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        zone.classList.add('dropping');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      zone.addEventListener(type, (event) => {
        zone.classList.remove('dropping');
        if (type === 'drop') {
          event.preventDefault();
          receiveFiles(event.dataTransfer && event.dataTransfer.files);
        }
      });
    });

    // ---------------------------------------------------------- 大纲
    $('outlineClose').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ showOutline: false });
      applyOutlineState(false);
      syncSegmentedActive('outlineSwitch', 'off');
    });
    $('outlineScrim').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ showOutline: false });
      applyOutlineState(false);
      syncSegmentedActive('outlineSwitch', 'off');
    });
    $('outlineList').addEventListener('click', (event) => {
      const item = event.target.closest('.outline-item');
      if (!item) return;
      gotoLine(Number(item.getAttribute('data-line')), Number(item.getAttribute('data-index')));
    });

    // ---------------------------------------------------------- 查找替换
    $('findInput').addEventListener('input', () => runFind(0));
    $('findInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        stepHit(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        closeFind();
      }
    });
    $('findPrev').addEventListener('click', () => stepHit(-1));
    $('findNext').addEventListener('click', () => stepHit(1));
    $('findCase').addEventListener('click', () => {
      const on = $('findCase').getAttribute('aria-pressed') === 'true';
      $('findCase').setAttribute('aria-pressed', on ? 'false' : 'true');
      $('findCase').classList.toggle('on', !on);
      runFind(0);
    });
    $('findClose').addEventListener('click', closeFind);
    $('replaceInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.altKey) replaceAll();
        else replaceCurrent();
      }
    });
    $('replaceOne').addEventListener('click', replaceCurrent);
    $('replaceAll').addEventListener('click', replaceAll);

    // ---------------------------------------------------------- 上下文菜单
    $('ctxMenu').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-mi]');
      if (!btn) return;
      const index = Number(btn.getAttribute('data-mi'));
      const item = state.menuItems[index];
      closeMenu();
      if (item && item.onPick) item.onPick();
    });

    // ---------------------------------------------------------- 图表对话框
    $('chartClose').addEventListener('click', closeChartDialog);
    $('chartCancel').addEventListener('click', closeChartDialog);
    $('chartInsert').addEventListener('click', confirmChartInsert);
    $('addSeries').addEventListener('click', () => addSeriesRow('', ''));
    $('chartTypes').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-key]');
      if (!btn) return;
      state.dialogType = btn.getAttribute('data-key');
      applyDialogType();
    });
    ['chartTitle', 'chartX', 'chartPie', 'chartHeight'].forEach((id) => {
      $(id).addEventListener('input', () => {
        if (id === 'chartHeight') $('heightHint').textContent = $('chartHeight').value + ' px';
        previewChart();
      });
    });
    $('seriesList').addEventListener('input', previewChart);

    // ---------------------------------------------------------- 设置
    $('settingsClose').addEventListener('click', () => closeSheet('settingsModal'));
    $('settingsOk').addEventListener('click', () => closeSheet('settingsModal'));
    $('openDataDir').addEventListener('click', openDataDir);
    $('setFontSize').addEventListener('input', async (event) => {
      state.settings = await LP.setSettings({ fontSize: Number(event.target.value) });
      applyFontSize();
    });
    $('autoSaveSwitch').addEventListener('click', async () => {
      const next = $('autoSaveSwitch').getAttribute('aria-checked') !== 'true';
      state.settings = await LP.setSettings({ autoSave: next });
      syncSwitch('autoSaveSwitch', next);
      setStatus(next ? '自动保存已开启' : '自动保存已关闭 · 记得 Ctrl/Cmd + S');
      if (next && state.dirty) saveNow(true);
    });
    $('motionSwitch').addEventListener('click', async () => {
      const next = $('motionSwitch').getAttribute('aria-checked') !== 'true';
      state.settings = await LP.setSettings({ motion: next ? 'reduce' : 'full' });
      syncSwitch('motionSwitch', next);
      document.documentElement.dataset.motion = next ? 'reduce' : 'full';
    });
    $('hlSwitch').addEventListener('click', async () => {
      const next = $('hlSwitch').getAttribute('aria-checked') !== 'true';
      state.settings = await LP.setSettings({ highlight: next });
      syncSwitch('hlSwitch', next);
      renderPreview();
      toast(next ? '代码块已开语法高亮' : '代码高亮已关闭', 'ok');
    });
    $('mathSwitch').addEventListener('click', async () => {
      const next = $('mathSwitch').getAttribute('aria-checked') !== 'true';
      state.settings = await LP.setSettings({ math: next });
      syncSwitch('mathSwitch', next);
      renderPreview();
      toast(next ? '公式渲染已开启（$…$ 与 $$…$$）' : '公式渲染已关闭', 'ok');
    });
    // 手机上开关本体只有 52×32，太小；整行都能点（命中区比 44px 还大）
    Array.prototype.slice.call(document.querySelectorAll('.switch-field')).forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('[role="switch"]')) return; // 本体自己处理
        const sw = row.querySelector('[role="switch"]');
        if (sw) sw.click();
      });
    });

    // ---------------------------------------------------------- 分享
    $('shareClose').addEventListener('click', () => closeSheet('shareModal'));
    $('shareOk').addEventListener('click', () => closeSheet('shareModal'));
    $('shareMd').addEventListener('click', shareMarkdown);
    $('sharePlain').addEventListener('click', sharePlain);
    $('shareHtml').addEventListener('click', shareHtml);
    $('shareFile').addEventListener('click', () => exportArticle('html'));
    if ($('shareWechat')) $('shareWechat').addEventListener('click', shareToWechat);
    if ($('shareWechatMp')) $('shareWechatMp').addEventListener('click', shareToWechatMp);
    if ($('shareObsidian')) $('shareObsidian').addEventListener('click', shareToObsidian);
    if ($('shareQQ')) $('shareQQ').addEventListener('click', shareToQQ);
    if ($('shareWeibo')) $('shareWeibo').addEventListener('click', shareToWeibo);
    $('shareTweet').addEventListener('click', shareToTwitter);
    $('shareBackup').addEventListener('click', exportFullBackup);

    // ---------------------------------------------------------- 统计
    $('statsClose').addEventListener('click', () => closeSheet('statsModal'));
    $('statsOk').addEventListener('click', () => closeSheet('statsModal'));

    // ---------------------------------------------------------- 回收站
    $('trashClose').addEventListener('click', () => closeSheet('trashModal'));
    $('trashOk').addEventListener('click', () => closeSheet('trashModal'));
    $('trashClear').addEventListener('click', () => {
      askConfirm({
        title: '清空回收站',
        text: '里面的文章会被彻底删除，之后找不回来了。确定清空吗？',
        okLabel: '清空',
        danger: true,
        onOk: async () => {
          await LP.emptyTrash();
          await openTrash();
          await refreshAll();
          toast('回收站已清空', 'ok');
        },
      });
    });
    $('trashList').addEventListener('click', async (event) => {
      const restore = event.target.closest('[data-restore]');
      if (restore) {
        await LP.restoreArticle(restore.getAttribute('data-restore'));
        await openTrash();
        await refreshAll();
        toast('已恢复', 'ok');
        return;
      }
      const purge = event.target.closest('[data-purge]');
      if (purge) {
        const id = purge.getAttribute('data-purge');
        askConfirm({
          title: '彻底删除',
          text: '这一篇会被永久删除，连同它的历史版本，找不回来了。',
          okLabel: '彻底删除',
          danger: true,
          onOk: async () => {
            await LP.purgeArticle(id);
            await openTrash();
            toast('已彻底删除', 'ok');
          },
        });
      }
    });

    // ---------------------------------------------------------- 标签
    $('tagsClose').addEventListener('click', () => closeSheet('tagsModal'));
    $('tagsCancel').addEventListener('click', () => closeSheet('tagsModal'));
    $('tagsSave').addEventListener('click', saveTags);
    $('tagCloud').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip[data-tag]');
      if (!chip) return;
      const tag = chip.getAttribute('data-tag');
      if ($('tagCloud').dataset.editable === '1') {
        const current = $('tagsInput')
          .value.split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const at = current.indexOf(tag);
        if (at === -1) current.push(tag);
        else current.splice(at, 1);
        $('tagsInput').value = current.join(', ');
      } else {
        state.tagFilter = state.tagFilter === tag ? '' : tag;
        $('tagFilterSelect').value = state.tagFilter;
        renderList();
        closeSheet('tagsModal');
      }
    });

    // ---------------------------------------------------------- 历史版本
    $('historyClose').addEventListener('click', () => closeSheet('historyModal'));
    $('historyOk').addEventListener('click', () => closeSheet('historyModal'));
    $('historyList').addEventListener('click', async (event) => {
      const rollback = event.target.closest('[data-rollback]');
      if (!rollback || !state.current) return;
      const index = Number(rollback.getAttribute('data-rollback'));
      const res = await LP.restoreRevision(state.current.id, index);
      if (!res || !res.ok) {
        toast('回滚失败：' + ((res && res.error) || '未知原因'), 'err');
        return;
      }
      state.current = res.article;
      $('title').value = res.article.title || '';
      $('editor').value = res.article.content || '';
      state.dirty = false;
      renderPreview();
      updateStats();
      scheduleOutline();
      await openHistory();
      await reloadList();
      renderList();
      toast('已回滚到那一版（当前版本已存成历史）', 'ok');
    });

    // ---------------------------------------------------------- 确认框
    $('confirmClose').addEventListener('click', () => {
      const cancelAction = state.confirmCancelAction;
      state.confirmAction = null;
      state.confirmCancelAction = null;
      closeSheet('confirmModal');
      if (cancelAction) cancelAction();
    });
    $('confirmCancel').addEventListener('click', () => {
      const cancelAction = state.confirmCancelAction;
      state.confirmAction = null;
      state.confirmCancelAction = null;
      closeSheet('confirmModal');
      if (cancelAction) cancelAction();
    });
    $('confirmOk').addEventListener('click', runConfirm);

    // ---------------------------------------------------------- 全局
    document.addEventListener('keydown', onGlobalKeydown, true);
    window.addEventListener('resize', () => {
      if (!isNarrow()) closeMenu();
      $('outlineScrim').hidden = !$('outlinePanel').hidden ? !isNarrow() : true;
      resizeCharts();
    });
    window.addEventListener('scroll', () => {
      if (!isNarrow()) closeMenu();
    });
    window.addEventListener('beforeunload', () => {
      if (state.dirty) saveNow(true);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      if ((state.settings.theme || 'dark') === 'system') {
        applyTheme();
        renderPreview();
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  // ------------------------------------------------------------ 列表长按

  let longPressTimer = 0;
  let longPressStart = 0;
  let swallowedByLongPress = false;

  function setupLongPress() {
    const list = $('list');
    list.addEventListener(
      'pointerdown',
      (event) => {
        const item = event.target.closest('.item');
        if (!item || event.target.closest('[data-more]')) return;
        longPressStart = event.clientY;
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          swallowedByLongPress = true;
          // 450ms 保护期过后自动释放，避免因点击外部 scrim 导致后续正常点击被永久吞噬
          setTimeout(() => {
            swallowedByLongPress = false;
          }, 450);
          openItemMenu(item.getAttribute('data-id'), item);
          if (navigator.vibrate) {
            try {
              navigator.vibrate(12);
            } catch (err) {
              /* 忽略 */
            }
          }
        }, 480);
      },
      { passive: true },
    );
    list.addEventListener(
      'pointermove',
      (event) => {
        if (Math.abs(event.clientY - longPressStart) > 8) clearTimeout(longPressTimer);
      },
      { passive: true },
    );
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
      list.addEventListener(type, () => clearTimeout(longPressTimer), { passive: true });
    });
  }

  function openItemMenu(id, anchor) {
    const article = state.articles.find((a) => a.id === id);
    if (!article) return;
    openMenu(
      [
        {
          label: article.pinnedAt ? '取消置顶' : '置顶到最前',
          icon: 'star',
          onPick: () => togglePinById(id),
        },
        {
          label: '编辑标签',
          icon: 'tag',
          onPick: async () => {
            await openArticle(id);
            openTags(true);
          },
        },
        { label: '分享', icon: 'share', onPick: () => shareById(id) },
        { sep: true },
        { label: '导出网页', icon: 'download', onPick: () => exportById('html', id) },
        { label: '导出 Markdown', icon: 'file-text', onPick: () => exportById('md', id) },
        { sep: true },
        { label: '删除（进回收站）', icon: 'trash', danger: true, onPick: () => deleteById(id) },
      ],
      { anchor: anchor, title: article.title || '未命名' },
    );
  }

  async function shareById(id) {
    const article = await LP.getArticle(id);
    if (!article) return;
    await openArticle(id);
    openShare();
    void article;
  }

  /**
   * 工具条上这个按钮此刻用户点得到吗？
   * 被折叠（.folded = display:none）、被隐藏、零尺寸，都算「点不到」。
   */
  function toolUsable(id) {
    const el = $(id);
    if (!el) return false;
    if (el.classList.contains('folded')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function openMoreMenu(anchor) {
    if (!state.current) return;
    const items = [];
    // 手机上顶部操作条只留 3 个高频按钮（置顶 / 查找 / 更多）；
    // 桌面上工具条装不下时也会把低频按钮折叠掉（.folded = display:none）。
    // 两种情况都必须在这里给出等价入口 —— 否则那个功能在用户侧就「消失」了
    // （scripts/probe-reachability.js 把这条承诺当断言跑）。
    // 折叠是按当前窗口宽度算出来的，所以先按同一套规则刷新一次，再决定菜单内容。
    syncToolsOverflow();
    const need = (id) => isNarrow() || !toolUsable(id);
    items.push({ label: '导入 Markdown 文件夹…', icon: 'folder', onPick: importMarkdownFolder });
    items.push({ label: '导出静态站点…', icon: 'download', onPick: exportStaticSite });
    items.push({ label: '生成引流短帖…', icon: 'quote', onPick: openSocialSlice });
    if (need('btnShare')) {
      items.push({ label: '分享这一篇', icon: 'share', onPick: openShare });
    }
    if (need('btnTagsEdit')) {
      items.push({ label: '给文章打标签', icon: 'tag', onPick: () => openTags(true) });
    }
    if (need('btnPin')) {
      items.push({
        label: state.current && state.current.pinnedAt ? '取消置顶' : '置顶到最前',
        icon: 'star',
        onPick: togglePin,
      });
    }
    if (need('btnChart')) items.push({ label: '插入图表', icon: 'chart', onPick: openChartDialog });
    if (need('btnImage')) items.push({ label: '插入图片', icon: 'image', onPick: insertImages });
    if (need('btnFile')) items.push({ label: '插入附件', icon: 'paperclip', onPick: insertFiles });
    if (need('btnOutline')) {
      items.push({ label: '正文大纲', icon: 'align-left', onPick: () => $('btnOutline').click() });
    }
    if (need('btnReading')) {
      items.push({ label: '沉浸阅读', icon: 'maximize', onPick: () => $('btnReading').click() });
    }
    if (need('btnPreview')) {
      items.push({ label: '显示 / 隐藏预览', icon: 'eye', onPick: () => $('btnPreview').click() });
    }
    if (items.length) items.push({ sep: true });
    items.push(
      { label: '导出网页', icon: 'download', onPick: () => exportArticle('html') },
      { label: '导出 Markdown', icon: 'file-text', onPick: () => exportArticle('md') },
      {
        label: '导出长图（PNG）',
        icon: 'image',
        onPick: () => {
          exportLongImage();
        },
      },
      { label: '复制当前图表为图片', icon: 'copy', onPick: copyActiveChartAsImage },
      { label: '整库备份归档 (JSON)', icon: 'save', onPick: exportFullBackup },
      { label: '粘贴为表格', icon: 'grid', onPick: readClipboardAsTable },
      { label: '历史版本', icon: 'clock', onPick: openHistory },
      { label: '查找与替换', icon: 'search', key: 'Ctrl/⌘ + F', onPick: openFind },
      { label: '文章统计', icon: 'info', onPick: openStats },
      { label: '通行码与 Google 登录', icon: 'settings', onPick: openAuthModal },
      { sep: true },
      { label: '删除（进回收站）', icon: 'trash', danger: true, onPick: deleteCurrent },
    );
    openMenu(items, { anchor: anchor });
  }

  /** 更多菜单里的「粘贴为表格」：读系统剪贴板再转，手机上读不到就给替代提示。 */
  async function readClipboardAsTable() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard');
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast('剪贴板是空的', 'err');
        return;
      }
      pasteAsTable(text);
    } catch (err) {
      toast('这台设备不让读剪贴板：直接把表格粘进编辑区也行', 'err');
    }
  }

  /** 把单张 ECharts 图表卡片复制为 PNG 图片写进系统剪贴板 */
  async function copyChartAsImage(chart) {
    if (!chart || typeof chart.getDataURL !== 'function') {
      toast('无法获取图表对象', 'err');
      return;
    }
    let dataUrl = '';
    try {
      dataUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff',
      });
    } catch (err) {
      toast('生成图表图片失败：' + String((err && err.message) || err), 'err');
      return;
    }

    if (!dataUrl) {
      toast('生成图表图片为空', 'err');
      return;
    }

    try {
      const res = await LP.copyImage(dataUrl);
      if (res && res.ok) {
        toast(res.mode === 'share' ? '图表已导出并唤起分享' : '图表已复制为图片，可直接粘贴', 'ok');
      } else {
        const errMsg = (res && res.error) || '写入剪贴板失败';
        toast('复制图片失败：' + errMsg, 'err');
        askConfirm({
          title: '复制失败，是否另存为 PNG 文件？',
          text: '系统剪贴板无法写入该图片（' + errMsg + '）。是否直接保存为本地 PNG 文件？',
          okLabel: '另存为 PNG',
          onOk: () => saveChartDataUrlAsFile(dataUrl),
        });
      }
    } catch (err) {
      const errMsg = String((err && err.message) || err);
      toast('复制图片失败：' + errMsg, 'err');
      askConfirm({
        title: '复制失败，是否另存为 PNG 文件？',
        text: '系统剪贴板无法写入该图片（' + errMsg + '）。是否直接保存为本地 PNG 文件？',
        okLabel: '另存为 PNG',
        onOk: () => saveChartDataUrlAsFile(dataUrl),
      });
    }
  }

  function saveChartDataUrlAsFile(dataUrl) {
    try {
      const comma = dataUrl.indexOf(',');
      const raw = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
      const byteChars = atob(raw);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const filename = 'chart-' + Date.now() + '.png';
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          a.remove();
        } catch (e) {
          /* 忽略 */
        }
        URL.revokeObjectURL(url);
      }, 1000);
      toast('图表已另存为 ' + filename, 'ok');
    } catch (err) {
      toast('保存文件失败：' + String((err && err.message) || err), 'err');
    }
  }

  async function copyActiveChartAsImage() {
    if (!state.chartInstances || !state.chartInstances.length) {
      toast('当前文章没有可复制的图表', 'err');
      return;
    }
    let target = state.chartInstances[0];
    const previewEl = $('preview');
    if (previewEl && state.chartInstances.length > 1) {
      const top = previewEl.scrollTop;
      const bottom = top + previewEl.clientHeight;
      for (const inst of state.chartInstances) {
        const dom = inst.getDom();
        if (dom && dom.offsetTop >= top - 50 && dom.offsetTop <= bottom) {
          target = inst;
          break;
        }
      }
    }
    await copyChartAsImage(target);
  }

  // ------------------------------------------------------------ 键盘

  function onEditorKeydown(event) {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Tab') {
      event.preventDefault();
      handleIndent(event);
      return;
    }
    if (event.key === 'Enter' && !mod) {
      continueList(event);
      return;
    }
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      applyFormat('bold');
    } else if (key === 'i') {
      event.preventDefault();
      applyFormat('italic');
    } else if (key === 'k') {
      event.preventDefault();
      applyFormat('link');
    }
  }

  function onGlobalKeydown(event) {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod) {
      const lower = key.toLowerCase();
      if (lower === 's') {
        event.preventDefault();
        saveNow();
        return;
      }
      if (lower === 'n' && !event.shiftKey) {
        event.preventDefault();
        newArticle();
        return;
      }
      if (lower === 'f') {
        event.preventDefault();
        if (!state.current) return;
        openFind();
        return;
      }
      if (lower === 'p') {
        event.preventDefault();
        openShare();
        return;
      }
    }
    if (key === 'Escape') {
      if (!$('ctxMenu').hidden) {
        closeMenu();
        return;
      }
      if (!$('findBar').hidden) {
        closeFind();
        return;
      }
      if (layers.length) {
        closeTopLayer(false);
        return;
      }
      if (isNarrow() && $('app').dataset.view === 'editor') {
        showList();
        return;
      }
      if (document.activeElement === $('editor') || document.activeElement === $('title')) {
        document.activeElement.blur();
      }
    }
  }

  function onPaste(event) {
    const dt = event.clipboardData;
    if (!dt) return;
    const files = dt.files ? Array.prototype.slice.call(dt.files) : [];
    if (files.length) {
      event.preventDefault();
      receiveFiles(files);
      return;
    }
    if (importDropped) {
      const items = dt.items ? Array.prototype.slice.call(dt.items) : [];
      const blobs = [];
      items.forEach((item) => {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) blobs.push(f);
        }
      });
      if (blobs.length) {
        event.preventDefault();
        receiveFiles(blobs);
        return;
      }
    }
    // 从 Excel / 表格软件里复制出来的是制表符分隔的多列文本：
    // 直接贴进正文会糊成一坨，这里自动转成 Markdown 表格。
    const text = dt.getData ? dt.getData('text/plain') : '';
    if (text && (text.indexOf('\t') !== -1 || text.indexOf('\n') !== -1)) {
      const t = tableFromText(text);
      if (t && t.cols >= 2 && t.rows >= 2) {
        event.preventDefault();
        insertAtCursor(tableInsertText(t.markdown));
        toast('按表格贴上去了：' + t.rows + ' 行 × ' + t.cols + ' 列', 'ok');
      }
    }
  }

  // ------------------------------------------------------------ 杂项动作

  async function importArticleFromFile() {
    setBusyLabel();
    try {
      const res = await LP.importArticle();
      if (res && res.canceled) {
        setStatus('已取消导入');
        return;
      }
      if (!res || res.error) {
        toast('导入失败：' + ((res && res.error) || '未知原因'), 'err');
        return;
      }
      const saved = await LP.saveArticle({
        title: res.title || '导入的文章',
        content: res.content || '',
        tags: ['导入'],
      });
      await refreshAll();
      await openArticle(saved.id);
      toast('导入完成', 'ok');
    } catch (err) {
      toast('导入失败：' + String((err && err.message) || err), 'err');
    } finally {
      setBusy(false);
    }
  }

  /**
   * 选一个文件夹，把里面的 Markdown 批量导入成本地文章。
   *
   * 默认跳过同名文章 —— 迁移场景下覆盖是最危险的动作。
   * 导入前先算好计划再弹确认，让用户知道会进来多少、跳过多少。
   */
  /**
   * 导出整站：把本地所有文章写成一个可以直接上传到 GitHub Pages 的静态站。
   *
   * 纯逻辑（模板、slug、RSS）在 vendor/static-site.js 里，这里只负责
   * 把每篇正文渲染成 HTML、算好计划，再交给主进程写盘。
   */
  async function exportStaticSite() {
    if (!LP || typeof LP.exportStaticSite !== 'function') {
      toast('手机版暂不支持整站导出', 'err');
      return;
    }
    const API = window.LPStaticSite;
    const MD = window.LPMarkdown;
    if (!API || !MD) {
      toast('导出模块没加载，请重启应用', 'err');
      return;
    }

    const articles = state.articles || [];
    if (articles.length === 0) {
      toast('还没有文章可以导出', 'err');
      return;
    }

    const slugs = API.uniqueSlugs(articles);
    const posts = articles.map((article, index) => {
      const bodyHtml = MD.render(article.content || '');
      return {
        title: article.title || '未命名',
        slug: slugs[index],
        date: API.formatDate(article.createdAt || article.updatedAt),
        excerpt: (article.content || '').replace(/[#*\`>\-\n]/g, ' ').trim().slice(0, 120),
        authorName: '',
        html: API.buildPost({
          title: article.title || '未命名',
          bodyHtml: bodyHtml,
          date: API.formatDate(article.createdAt || article.updatedAt),
          excerpt: '',
          siteName: 'LongPost',
        }),
      };
    });

    const siteUrl = window.prompt(
      '站点地址（用于 RSS 与 sitemap，可留空跳过）：',
      '',
    );

    const payload = {
      indexHtml: API.buildIndex({
        siteName: 'LongPost',
        description: '用 LongPost 导出的静态站',
        posts,
      }),
      posts,
      feed: API.buildFeed({ siteName: 'LongPost', description: '用 LongPost 导出的静态站', siteUrl, posts }),
      sitemap: API.buildSitemap({ siteUrl, posts }),
    };

    const res = await LP.exportStaticSite(payload);
    if (res && res.canceled) {
      setStatus('已取消导出');
      return;
    }
    if (!res || !res.ok) {
      toast('导出失败：' + ((res && res.error) || '未知原因'), 'err');
      return;
    }
    toast('已导出 ' + res.count + ' 篇到 static-site/', 'ok');
    setStatus('导出完成：' + res.dir);
  }

  async function importMarkdownFolder() {
    if (!LP || typeof LP.pickMarkdownFolder !== 'function') {
      toast('手机版暂不支持文件夹导入', 'err');
      return;
    }

    const API = window.LPMarkdownImport;
    if (!API) {
      toast('导入模块没加载，请重启应用', 'err');
      return;
    }

    const picked = await LP.pickMarkdownFolder();
    if (!picked || picked.canceled) {
      setStatus('已取消导入');
      return;
    }

    const titles = state.articles.map((article) => article.title);
    const plan = API.planImport(picked.files || [], titles);

    if (!plan.docs.length) {
      toast(
        '没有可导入的笔记（' + plan.skipped.length + ' 篇被跳过：同名或为空）',
        'err',
      );
      return;
    }

    const summary =
      '将导入 ' + plan.docs.length + ' 篇' +
      (plan.skipped.length ? '，跳过 ' + plan.skipped.length + ' 篇（同名或为空）' : '') +
      (picked.truncated ? '\n\n注意：文件过多，只读取了前 500 篇' : '') +
      '\n\n同名文章不会被覆盖。继续？';

    if (!window.confirm(summary)) {
      setStatus('已取消导入');
      return;
    }

    setBusyLabel();
    let done = 0;
    try {
      for (const doc of plan.docs) {
        setBusyLabel('导入中 ' + (done + 1) + '/' + plan.docs.length);
        await LP.saveArticle({
          title: doc.title,
          content: doc.content,
          tags: doc.tags,
        });
        done += 1;
      }
      await refreshAll();
      toast('已导入 ' + done + ' 篇', 'ok');
      setStatus('导入完成：' + done + ' 篇');
    } catch (err) {
      toast('导入中断：已完成 ' + done + ' 篇', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function openDataDir() {
    if (!CAPS.openDataDir) {
      toast('手机版的数据在应用自己的存储里，没有可打开的目录', 'err');
      return;
    }
    try {
      await LP.openDataDir();
      setStatus('已打开数据目录');
    } catch (err) {
      toast('打不开数据目录：' + String((err && err.message) || err), 'err');
    }
  }

  // ==========================================================================
  // 启动
  // ==========================================================================

  async function boot() {
    const platform = window.LPPlatform || LP;
    if (!platform) {
      const err = window.LPPlatformError || '核心数据模块未就绪';
      $('status').textContent = '模块加载失败 (' + err + ')';
      $('list').innerHTML =
        '<div class="list-empty">' + icon('alert') + '<p>渲染层模块没加载起来（' + esc(err) + '），请重启应用或更新至最新版本。</p></div>';
      return;
    }
    const md = window.LPMarkdown || MD;
    const ch = window.LPChart || CH;
    if (!md || !ch) {
      const missing = [];
      if (!md) missing.push('vendor/markdown.js');
      if (!ch) missing.push('vendor/chart.js');
      const err = '核心模块缺失 (' + missing.join(', ') + ')';
      $('status').textContent = err;
      $('list').innerHTML =
        '<div class="list-empty">' + icon('alert') + '<p>渲染层模块没加载起来（' + esc(err) + '），请重启应用。</p></div>';
      return;
    }

    try {
      document.documentElement.style.setProperty('--editor-font-size', '16px');

      try {
        state.settings = await platform.getSettings();
      } catch (err) {
        /* 用默认值 */
      }
      buildFmtbar();
      applySettingsUi();
      setupModals();
      setupSplitter();
      setupKeyboard();
      setupHardwareBack();
      setupSwipePanes();
      setupPinchZoom();
      setupMaterialRipple();

      bind();

      await refreshAll();
      buildSearchIndex(); // 全文检索索引，随列表一起重建（毫秒级）
      setupPullToRefresh(); // 只在窄屏装
      // 窗口从宽拖窄、或手机横竖屏切换时，只在手机上装的东西要补上：
      // 下拉刷新是「init 一次就常驻」，不在这个时机补，启动时是宽屏就永远不会装。
      const narrowMQ = window.matchMedia('(max-width: 820px)');
      if (typeof narrowMQ.addEventListener === 'function') {
        narrowMQ.addEventListener('change', (event) => {
          if (event.matches) setupPullToRefresh();
        });
      }
      setPaneMode(isNarrow() ? 'write' : 'split');
      renderPreview();
      syncTabs();

      ambientWatchTimer = setInterval(tickAmbientWatcher, 3500);

      try {
        const info = await platform.appInfo();
        state.appInfo = info;
        setStatus('就绪 · 数据目录：' + (info.dataDir || ''));
      } catch (err) {
        setStatus('就绪');
      }
    } catch (bootErr) {
      console.error('[boot error]', bootErr);
      const msg = String((bootErr && bootErr.message) || bootErr);
      $('status').textContent = '启动异常: ' + msg;
      $('list').innerHTML =
        '<div class="list-empty">' + icon('alert') + '<p>界面初始化遇到异常（' + esc(msg) + '），请尝试重启或刷新。</p></div>';
      try {
        bind();
      } catch (e) {
        /* 忽略 */
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
