/* LongPost 桌面版 —— 渲染层逻辑 */
(function () {
  'use strict';

  const MD = window.LPMarkdown;
  const CH = window.LPChart;
  const OUTLINE = window.LPOutline;
  // 平台门面：桌面是 IPC，手机/网页是 IndexedDB，见 renderer/platform.js
  const LP = window.LPPlatform;
  const CAPS = (LP && LP.capabilities) || { openDataDir: false, folderExport: false };

  const $ = (id) => document.getElementById(id);

  const state = {
    articles: [],
    current: null,
    dirty: false,
    settings: { theme: 'dark', showPreview: true },
    query: '',
    tagFilter: '',
    chartInstances: [],
    dialogType: 'bar',
    saveTimer: null,
    previewTimer: null,
    // 标签弹窗有两个入口：从侧栏进来是「看全部」，从编辑器进来是「改这一篇」
    tagsEditable: false,
  };

  // ---------------------------------------------------------------- 工具

  let toastTimer = null;
  function toast(message, kind) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2400);
  }

  function setStatus(text) {
    $('status').textContent = text;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const pad = (n) => String(n).padStart(2, '0');
    if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.getFullYear() === now.getFullYear()) return pad(d.getMonth() + 1) + '/' + pad(d.getDate());
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ---------------------------------------------------------------- 列表

  async function reloadList(keepCurrent) {
    // 排序规则在仓库层（lib/repo.js 的 sortList），界面只负责说「按什么排」
    state.articles = (await LP.listArticles({ sort: state.settings.sort || 'updated' })) || [];
    renderList();
    if (!keepCurrent && !state.current && state.articles.length) {
      // 不做自动打开，保留「新建」空态；由调用方决定
    }
  }

  function visibleArticles() {
    let items = state.articles;
    if (state.tagFilter) {
      items = items.filter((a) => (a.tags || []).indexOf(state.tagFilter) !== -1);
    }
    const q = state.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => (a.searchText || '').indexOf(q) !== -1);
  }

  function renderList() {
    const list = $('list');
    const items = visibleArticles();
    list.innerHTML = '';

    if (!items.length) {
      const div = document.createElement('div');
      div.className = 'list-empty';
      if (state.articles.length && state.tagFilter) {
        div.textContent = '没有「' + state.tagFilter + '」标签的文章';
      } else if (state.articles.length) {
        div.textContent = '没有匹配的文章';
      } else {
        div.textContent = '还没有文章，点上面「新建文章」开始';
      }
      list.appendChild(div);
    } else {
      for (const a of items) {
        const el = document.createElement('div');
        el.className = 'item' + (state.current && state.current.id === a.id ? ' active' : '');
        el.dataset.id = a.id;
        if (a.pinnedAt) el.classList.add('pinned');

        const head = document.createElement('div');
        head.className = 'item-head';

        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = a.title || '未命名';
        head.appendChild(title);

        if (a.pinnedAt) {
          const pin = document.createElement('span');
          pin.className = 'item-pin';
          pin.textContent = '★';
          pin.title = '已置顶';
          head.appendChild(pin);
        }

        const sum = document.createElement('div');
        sum.className = 'item-sum';
        sum.textContent = a.summary || '（空）';

        const meta = document.createElement('div');
        meta.className = 'item-meta';
        // minutes 是仓库层一直算好、但从来没露过面的阅读时长
        meta.textContent =
          `${a.chars} 字 · 约 ${a.minutes || 1} 分钟` +
          `${a.charts ? ' · ' + a.charts + ' 图表' : ''} · ${formatTime(a.updatedAt)}`;

        el.appendChild(head);
        el.appendChild(sum);

        if (a.tags && a.tags.length) {
          const tagRow = document.createElement('div');
          tagRow.className = 'item-tags';
          for (const t of a.tags) {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = t;
            chip.dataset.tag = t;
            tagRow.appendChild(chip);
          }
          el.appendChild(tagRow);
        }

        el.appendChild(meta);
        list.appendChild(el);
      }
    }

    const label = state.tagFilter ? ` · 标签「${state.tagFilter}」` : '';
    $('count').textContent = `${state.articles.length} 篇${label}`;
  }

  // ---------------------------------------------------------------- 打开 / 新建

  async function openArticle(id) {
    await flushSave();
    const article = await LP.getArticle(id);
    if (!article) {
      toast('文章不存在，可能已被删除', 'err');
      await reloadList();
      return;
    }
    state.current = article;
    state.dirty = false;

    $('empty').hidden = true;
    $('editorWrap').hidden = false;
    $('title').value = article.title || '';
    $('editor').value = article.content || '';
    updateStats();
    renderPreview();
    renderOutline();
    renderList();
    refreshPinButton();
    setView('editor');
    setStatus('已打开');
  }

  async function newArticle() {
    await flushSave();
    const created = await LP.saveArticle({ title: '未命名', content: '' });
    state.current = created;
    state.dirty = false;
    $('empty').hidden = true;
    $('editorWrap').hidden = false;
    $('title').value = created.title;
    $('editor').value = '';
    updateStats();
    renderPreview();
    renderOutline();
    await reloadList(true);
    renderList();
    refreshPinButton();
    setView('editor');
    $('title').focus();
    $('title').select();
    setStatus('新文章');
  }

  /** 阅读时长用仓库层那一份算法，保证列表和状态栏说的是同一个数。 */
  function readingMinutes(content) {
    if (window.LPRepo && typeof window.LPRepo.readingMinutes === 'function') {
      return window.LPRepo.readingMinutes(content);
    }
    return Math.max(1, Math.round(String(content || '').replace(/\s/g, '').length / 400));
  }

  function updateStats() {
    const content = $('editor').value || '';
    const charts = CH.chartCount(content);
    $('stats').textContent =
      `${content.length} 字 · 约 ${readingMinutes(content)} 分钟` +
      `${charts ? ' · ' + charts + ' 个图表' : ''}`;
  }

  // ---------------------------------------------------------------- 保存

  function markDirty() {
    state.dirty = true;
    setStatus('编辑中…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveNow();
    }, 900);
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(renderPreview, 220);
  }

  async function saveNow() {
    if (!state.current || !state.dirty) return;
    clearTimeout(state.saveTimer);
    const payload = {
      id: state.current.id,
      title: $('title').value.trim() || '未命名',
      content: $('editor').value,
      tags: state.current.tags || [],
    };
    const saved = await LP.saveArticle(payload);
    state.current = saved;
    state.dirty = false;
    setStatus('已保存 ' + formatTime(saved.updatedAt));
    await reloadList(true);
    renderList();
  }

  async function flushSave() {
    if (state.dirty) await saveNow();
  }

  // ---------------------------------------------------------------- 预览

  function disposeCharts() {
    for (const c of state.chartInstances) {
      try {
        c.dispose();
      } catch {
        /* 忽略 */
      }
    }
    state.chartInstances = [];
  }

  /**
   * 正文里的图片和附件统一写成 lp://files/xxx。
   * 桌面版由主进程注册的私有协议直接接管；网页/手机版没有这个协议，
   * 必须在这里换成 blob: 地址，否则 <img> 会去请求一个不存在的东西，图全是碎的。
   */
  function resolveAssets(root) {
    if (!LP || LP.isDesktop || typeof LP.assetUrl !== 'function') return;
    const nodes = root.querySelectorAll('img[src^="lp://"], a[href^="lp://"]');
    for (const el of nodes) {
      const raw = el.getAttribute('src') || el.getAttribute('href');
      if (!raw) continue;
      Promise.resolve(LP.assetUrl(raw)).then((url) => {
        if (!url) {
          if (el.tagName === 'IMG') {
            el.replaceWith(document.createTextNode('［图片在你导入它的那台设备上］'));
          }
          return;
        }
        if (el.tagName === 'IMG') el.setAttribute('src', url);
        else el.setAttribute('href', url);
      });
    }
  }

  function renderPreview() {
    const preview = $('preview');
    const panes = $('panes');
    disposeCharts();
    preview.innerHTML = '';

    if (!state.current) return;
    if (panes.classList.contains('preview-off')) return;

    const theme = state.settings.theme === 'light' ? 'light' : 'dark';
    // 预览必须跟着输入框的实时内容走，而不是上一次保存下来的快照
    const segments = CH.splitChartCards($('editor').value || '');
    const pending = [];

    for (const seg of segments) {
      if (seg.kind === 'chart') {
        const box = document.createElement('div');
        box.className = 'chart-block';
        box.style.height = CH.chartHeight(seg.card) + 'px';
        preview.appendChild(box);
        pending.push({ el: box, card: seg.card });
      } else if (seg.kind === 'markdown') {
        if (!seg.text.trim()) continue;
        const tpl = document.createElement('template');
        tpl.innerHTML = MD.renderMarkdown(seg.text);
        preview.appendChild(tpl.content);
      } else {
        const bad = document.createElement('div');
        bad.className = 'chart-bad';
        bad.textContent = '图表数据格式有误，已原样显示：\n' + seg.text;
        preview.appendChild(bad);
      }
    }

    // 正文里如果写了非法 chart 围栏，splitChartCards 会把它并回 markdown；
    // 这里再兜一层：把渲染后仍然出现的 ```chart 标记提示出来
    const leftovers = preview.querySelectorAll('code[data-lang="chart"]');
    for (const code of leftovers) {
      const bad = document.createElement('div');
      bad.className = 'chart-bad';
      bad.textContent = '这段 ```chart 图表数据不合法，没能画出来：\n' + code.textContent;
      code.closest('pre').replaceWith(bad);
    }

    for (const p of pending) {
      try {
        const chart = window.echarts.init(p.el, null, { renderer: 'canvas' });
        chart.setOption(CH.chartCardToEchartsOption(p.card, theme));
        state.chartInstances.push(chart);
      } catch (err) {
        p.el.textContent = '图表渲染失败：' + String(err && err.message ? err.message : err);
        p.el.style.color = 'var(--danger)';
      }
    }

    resolveAssets(preview);
  }

  function resizeCharts() {
    for (const c of state.chartInstances) {
      try {
        c.resize();
      } catch {
        /* 忽略 */
      }
    }
  }

  // ---------------------------------------------------------------- 插入

  function insertAtCursor(text) {
    const ta = $('editor');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);

    const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const tail = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

    const next = before + lead + text + tail + after;
    ta.value = next;
    const caret = (before + lead + text).length;
    ta.selectionStart = caret;
    ta.selectionEnd = caret;
    ta.focus();
    markDirty();
    updateStats();
  }

  async function insertImages() {
    const files = await LP.pickImages();
    if (!files || !files.length) return;
    for (const f of files) {
      insertAtCursor(`![${f.name}](${f.url})`);
    }
    toast(`已插入 ${files.length} 张图片`, 'ok');
  }

  async function insertFiles() {
    const files = await LP.pickFiles();
    if (!files || !files.length) return;
    for (const f of files) {
      if (f.isImage) {
        insertAtCursor(`![${f.name}](${f.url})`);
      } else {
        insertAtCursor(`[📎 ${f.name}](${f.url})  <!-- ${formatSize(f.size)} -->`);
      }
    }
    toast(`已插入 ${files.length} 个附件`, 'ok');
  }

  // ---------------------------------------------------------------- 图表对话框

  function buildTypeButtons() {
    const box = $('chartTypes');
    box.innerHTML = '';
    for (const t of CH.CHART_TYPES) {
      const b = document.createElement('button');
      b.className = 'seg' + (t === state.dialogType ? ' on' : '');
      b.textContent = CH.TYPE_LABELS[t] || t;
      b.dataset.type = t;
      b.addEventListener('click', () => {
        state.dialogType = t;
        buildTypeButtons();
        applyDialogType();
        previewChart();
      });
      box.appendChild(b);
    }
  }

  function applyDialogType() {
    const isPie = state.dialogType === 'pie';
    $('cartesianFields').hidden = isPie;
    $('pieFields').hidden = !isPie;
  }

  function addSeriesRow(name, data) {
    const row = document.createElement('div');
    row.className = 'series-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'series-name';
    nameInput.placeholder = '系列名';
    nameInput.value = name == null ? '' : name;
    nameInput.dataset.role = 'name';

    const dataInput = document.createElement('input');
    dataInput.type = 'text';
    dataInput.dataset.role = 'data';
    dataInput.placeholder = '数值，逗号分隔';
    dataInput.value = data == null ? '' : data;

    const del = document.createElement('button');
    del.className = 'btn ghost sm';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      row.remove();
      previewChart();
    });

    for (const el of [nameInput, dataInput]) {
      el.addEventListener('input', previewChart);
    }

    row.appendChild(nameInput);
    row.appendChild(dataInput);
    row.appendChild(del);
    $('seriesList').appendChild(row);
  }

  function resetChartDialog() {
    state.dialogType = 'bar';
    buildTypeButtons();
    applyDialogType();

    const sample = CH.sampleCard('bar');
    $('chartTitle').value = sample.title || '';
    $('chartX').value = (sample.xAxis || []).join(', ');
    $('chartPie').value = '';
    $('chartHeight').value = String(sample.height || 360);
    $('heightHint').textContent = $('chartHeight').value + ' px';
    $('chartError').textContent = '';

    $('seriesList').innerHTML = '';
    for (const s of sample.series || []) {
      addSeriesRow(s.name, s.data.join(', '));
    }
    previewChart();
  }

  function cardFromForm() {
    const type = state.dialogType;
    const title = $('chartTitle').value.trim();
    const height = Number($('chartHeight').value) || CH.DEFAULT_CHART_HEIGHT;
    const card = { type: type, height: height };
    if (title) card.title = title;

    if (type === 'pie') {
      const lines = $('chartPie').value.split('\n');
      const data = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/[,，\t]+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length < 2) return { error: '饼图每一行要写成「名称, 数值」' };
        const value = Number(parts[parts.length - 1]);
        if (!Number.isFinite(value)) return { error: '数值看不懂：' + trimmed };
        data.push({ name: parts.slice(0, -1).join(' '), value: value });
      }
      if (!data.length) return { error: '至少写一项饼图数据' };
      card.data = data;
      return { card: card };
    }

    const xAxis = $('chartX')
      .value.split(/[,，]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!xAxis.length) return { error: 'x 轴分类不能为空' };
    card.xAxis = xAxis;

    const series = [];
    const rows = $('seriesList').querySelectorAll('.series-row');
    for (const row of rows) {
      const name = row.querySelector('[data-role="name"]').value.trim();
      const raw = row.querySelector('[data-role="data"]').value;
      const nums = raw
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
      if (!nums.length) continue;
      if (nums.some((n) => !Number.isFinite(n))) return { error: '数值列里有非数字：' + raw };
      const s = { data: nums };
      if (name) s.name = name;
      series.push(s);
    }
    if (!series.length) return { error: '至少填一条数据' };
    card.series = series;
    return { card: card };
  }

  let previewChartInstance = null;
  function previewChart() {
    const box = $('chartPreviewBox');
    const errBox = $('chartError');
    const result = cardFromForm();

    if (result.error) {
      errBox.textContent = result.error;
      if (previewChartInstance) {
        previewChartInstance.dispose();
        previewChartInstance = null;
      }
      box.innerHTML = '';
      return;
    }
    errBox.textContent = '';

    const normalized = CH.parseChartCard(JSON.stringify(result.card));
    if (!normalized) {
      errBox.textContent = '图表数据不完整，检查一下 x 轴与数值个数是否对得上';
      return;
    }

    try {
      if (!previewChartInstance) {
        box.innerHTML = '';
        previewChartInstance = window.echarts.init(box, null, { renderer: 'canvas' });
      }
      const theme = state.settings.theme === 'light' ? 'light' : 'dark';
      previewChartInstance.setOption(CH.chartCardToEchartsOption(normalized, theme), true);
      previewChartInstance.resize();
    } catch (err) {
      errBox.textContent = '预览失败：' + String(err && err.message ? err.message : err);
    }
  }

  function openChartDialog() {
    if (!state.current) return;
    resetChartDialog();
    $('chartModal').hidden = false;
    setTimeout(() => {
      previewChart();
      if (previewChartInstance) previewChartInstance.resize();
    }, 30);
  }

  function closeChartDialog() {
    $('chartModal').hidden = true;
    if (previewChartInstance) {
      previewChartInstance.dispose();
      previewChartInstance = null;
    }
  }

  function confirmChartInsert() {
    const result = cardFromForm();
    if (result.error) {
      $('chartError').textContent = result.error;
      return;
    }
    const normalized = CH.parseChartCard(JSON.stringify(result.card));
    if (!normalized) {
      $('chartError').textContent = '图表数据不完整，无法插入';
      return;
    }
    insertAtCursor(CH.encodeChartCard(normalized));
    closeChartDialog();
    toast('图表已插入正文', 'ok');
  }

  // ---------------------------------------------------------------- 手机端两视图切换

  /**
   * 窄屏下侧栏和编辑区不可能并排，切成互斥的两个视图。
   * 桌面端不看这个属性，CSS 里只在 @media (max-width: 820px) 里才生效。
   */
  function setView(view) {
    const app = $('app');
    if (app) app.dataset.view = view === 'editor' ? 'editor' : 'list';
    if (view === 'editor') setTimeout(resizeCharts, 30);
  }

  // ---------------------------------------------------------------- 置顶

  function refreshPinButton() {
    const btn = $('btnPin');
    if (!btn) return;
    const on = !!(state.current && state.current.pinnedAt);
    btn.classList.toggle('on', on);
    btn.textContent = on ? '已置顶' : '置顶';
  }

  async function togglePinCurrent() {
    if (!state.current) return;
    const res = await LP.togglePin(state.current.id);
    if (!res || !res.ok) {
      toast('置顶失败：' + ((res && res.error) || '未知错误'), 'err');
      return;
    }
    // 单独取一次，拿到刷新后的 pinnedAt，别自己猜
    state.current = (await LP.getArticle(state.current.id)) || state.current;
    refreshPinButton();
    await reloadList(true);
    renderList();
    toast(res.pinned ? '已置顶' : '已取消置顶', 'ok');
  }

  // ---------------------------------------------------------------- 回收站

  async function renderTrash() {
    const box = $('trashList');
    box.innerHTML = '';
    const items = (await LP.listTrash()) || [];

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = '回收站是空的';
      box.appendChild(empty);
      return;
    }

    for (const a of items) {
      const row = document.createElement('div');
      row.className = 'panel-row';

      const main = document.createElement('div');
      main.className = 'panel-main';
      const t = document.createElement('div');
      t.className = 'panel-title';
      t.textContent = a.title || '未命名';
      const m = document.createElement('div');
      m.className = 'panel-meta';
      m.textContent = `${a.chars} 字 · 删除于 ${formatTime(a.deletedAt)}`;
      main.appendChild(t);
      main.appendChild(m);

      const acts = document.createElement('div');
      acts.className = 'panel-acts';

      const restore = document.createElement('button');
      restore.className = 'btn ghost sm';
      restore.textContent = '恢复';
      restore.addEventListener('click', async () => {
        const res = await LP.restoreArticle(a.id);
        if (!res || !res.ok) {
          toast('恢复失败', 'err');
          return;
        }
        await reloadList(true);
        renderList();
        await renderTrash();
        toast('已恢复', 'ok');
      });

      const purge = document.createElement('button');
      purge.className = 'btn danger sm';
      purge.textContent = '彻底删除';
      purge.addEventListener('click', async () => {
        const ok = window.confirm(`彻底删除《${a.title || '未命名'}》？\n\n这一步之后就真的找不回来了。`);
        if (!ok) return;
        const res = await LP.purgeArticle(a.id);
        if (!res || !res.ok) {
          toast('删除失败', 'err');
          return;
        }
        await renderTrash();
        toast('已彻底删除', 'ok');
      });

      acts.appendChild(restore);
      acts.appendChild(purge);
      row.appendChild(main);
      row.appendChild(acts);
      box.appendChild(row);
    }
  }

  async function openTrash() {
    $('trashModal').hidden = false;
    await renderTrash();
  }

  // ---------------------------------------------------------------- 标签

  async function renderTagCloud() {
    const box = $('tagCloud');
    box.innerHTML = '';
    const tags = (await LP.listTags()) || [];

    if (!tags.length) {
      const empty = document.createElement('span');
      empty.className = 'panel-empty';
      empty.textContent = '还没有用过任何标签';
      box.appendChild(empty);
      return;
    }

    for (const t of tags) {
      const chip = document.createElement('button');
      chip.className = 'chip chip-btn' + (state.tagFilter === t.name ? ' on' : '');
      chip.textContent = t.name + ' · ' + t.count;
      chip.addEventListener('click', async () => {
        state.tagFilter = state.tagFilter === t.name ? '' : t.name;
        renderList();
        if (!$('tagsModal').hidden) await renderTagCloud();
        toast(state.tagFilter ? '只看「' + state.tagFilter + '」' : '已取消标签筛选', 'ok');
      });
      box.appendChild(chip);
    }
  }

  async function openTags(editable) {
    // 从编辑器进来才允许改这一篇；从侧栏进来是「看全部 + 筛选」
    state.tagsEditable = !!editable && !!state.current;
    $('tagsEditField').hidden = !state.tagsEditable;
    $('tagsSave').hidden = !state.tagsEditable;
    $('tagsInput').value = state.tagsEditable ? (state.current.tags || []).join(', ') : '';
    $('tagsModal').hidden = false;
    await renderTagCloud();
    if (state.tagsEditable) $('tagsInput').focus();
  }

  async function saveTagsFromDialog() {
    if (!state.current) {
      $('tagsModal').hidden = true;
      return;
    }
    const raw = $('tagsInput').value;
    const tags = raw
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await LP.setTags(state.current.id, tags);
    if (!res || !res.ok) {
      toast('保存标签失败：' + ((res && res.error) || '未知错误'), 'err');
      return;
    }
    state.current = (await LP.getArticle(state.current.id)) || state.current;
    await reloadList(true);
    renderList();
    $('tagsModal').hidden = true;
    toast(tags.length ? '标签已保存' : '标签已清空', 'ok');
  }

  // ---------------------------------------------------------------- 历史版本

  async function renderHistory() {
    const box = $('historyList');
    box.innerHTML = '';
    if (!state.current) return;
    const revs = (await LP.listRevisions(state.current.id)) || [];

    if (!revs.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = '还没有历史版本。改动正文并保存后，这里会开始记录。';
      box.appendChild(empty);
      return;
    }

    for (const r of revs) {
      const row = document.createElement('div');
      row.className = 'panel-row';

      const main = document.createElement('div');
      main.className = 'panel-main';
      const t = document.createElement('div');
      t.className = 'panel-title';
      t.textContent = r.title || '未命名';
      const m = document.createElement('div');
      m.className = 'panel-meta';
      m.textContent = `${formatTime(r.at)} · ${r.chars} 字`;
      const s = document.createElement('div');
      s.className = 'panel-sum';
      s.textContent = r.summary || '（空）';
      main.appendChild(t);
      main.appendChild(m);
      main.appendChild(s);

      const acts = document.createElement('div');
      acts.className = 'panel-acts';
      const back = document.createElement('button');
      back.className = 'btn ghost sm';
      back.textContent = '回滚';
      back.addEventListener('click', async () => {
        await flushSave();
        const ok = window.confirm(`把正文换成 ${formatTime(r.at)} 的那一版？\n\n现在的内容会先存成一个新版本，不会丢。`);
        if (!ok) return;
        const res = await LP.restoreRevision(state.current.id, r.index);
        if (!res || !res.ok) {
          toast('回滚失败：' + ((res && res.error) || '未知错误'), 'err');
          return;
        }
        state.current = (await LP.getArticle(state.current.id)) || state.current;
        state.dirty = false;
        $('title').value = state.current.title || '';
        $('editor').value = state.current.content || '';
        updateStats();
        renderPreview();
        await reloadList(true);
        renderList();
        await renderHistory();
        toast('已回滚', 'ok');
      });

      acts.appendChild(back);
      row.appendChild(main);
      row.appendChild(acts);
      box.appendChild(row);
    }
  }

  async function openHistory() {
    if (!state.current) return;
    await flushSave();
    $('historyModal').hidden = false;
    await renderHistory();
  }

  // ---------------------------------------------------------------- 设置

  function applyTheme() {
    // 用 classList 而不是直接写 className：沉浸阅读也是挂在 body 上的 class，
    // 直接覆盖会把 reading-mode 一起抹掉，切一次主题就悄悄退出沉浸模式了
    document.body.classList.toggle('light', state.settings.theme === 'light');

    buildSegmented(
      'themeSwitch',
      [
        { key: 'dark', label: '深色' },
        { key: 'light', label: '浅色' },
      ],
      state.settings.theme === 'light' ? 'light' : 'dark',
      async (key) => {
        state.settings = await LP.setSettings({ theme: key });
        applyTheme();
        renderPreview();
        if (!$('chartModal').hidden) previewChart();
      },
    );
  }

  async function openSettings() {
    const info = await LP.appInfo();
    $('dataDirText').textContent = info.dataDir;
    $('aboutText').textContent =
      `LongPost 桌面版 v${info.version} · ${info.platform}\n` +
      '离线可用。文章、图片、附件全部存放在上面这个目录里，不会上传到任何服务器。' +
      '卸载应用不会删除这个目录，需要的话可以手动备份。';
    $('aboutText').style.whiteSpace = 'pre-line';
    applySettingsUi();
    $('settingsModal').hidden = false;
  }

  // ---------------------------------------------------------------- 分栏拖动

  function setupSplitter() {
    const panes = $('panes');
    const editor = $('editor');
    const sp = document.createElement('div');
    sp.className = 'splitter';
    panes.insertBefore(sp, $('preview'));

    let dragging = false;
    sp.addEventListener('mousedown', (e) => {
      dragging = true;
      e.preventDefault();
      document.body.style.cursor = 'col-resize';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = panes.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(18, Math.min(82, pct));
      editor.style.width = pct + '%';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      resizeCharts();
    });
  }

  // ---------------------------------------------------------------- 正文大纲

  /**
   * 正文大纲。
   *
   * lib/outline.js 一直在页面上（index.html 引了 vendor/outline.js），
   * 但界面从来没调用过它 —— 长文写作最需要的「跳到第几节」就这么一直缺着。
   *
   * 定位用的是它给的 line（标题在正文里的行号），不用预览区的 DOM id：
   * 预览是按图表卡片分段重新渲染的，id 每次都会变，靠不住。
   */
  let outlineTimer = 0;

  function outlineItems() {
    if (!OUTLINE || typeof OUTLINE.buildToc !== 'function') return [];
    return OUTLINE.buildToc($('editor').value || '').items || [];
  }

  function renderOutline() {
    const panel = $('outlinePanel');
    if (!panel || panel.hidden) return;
    const box = $('outlineList');
    const items = outlineItems();
    box.innerHTML = '';

    if (!items.length) {
      const hint = document.createElement('div');
      hint.className = 'outline-empty';
      hint.textContent = '正文里还没有标题。用「# 标题」写小标题，这里就会列出来，点一下直接跳到那一段。';
      box.appendChild(hint);
      return;
    }

    items.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'outline-item lv' + h.level;
      b.textContent = h.text;
      b.title = h.text;
      b.dataset.line = String(h.line);
      b.dataset.idx = String(i);
      box.appendChild(b);
    });
  }

  /** 打字时不要每敲一下就重算，停下来再刷新。 */
  function scheduleOutline() {
    if ($('outlinePanel').hidden) return;
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(renderOutline, 400);
  }

  function jumpToHeading(line, idx) {
    const ed = $('editor');
    const lines = (ed.value || '').split('\n');
    const target = Math.max(0, Math.min(Number(line) || 0, lines.length - 1));

    let offset = 0;
    for (let i = 0; i < target; i += 1) offset += lines[i].length + 1;

    // 先聚焦再设选区：浏览器会把光标所在那一行滚进可视区
    ed.focus();
    ed.setSelectionRange(offset, offset + (lines[target] || '').length);

    // 预览也跟着滚到同一个标题（预览里只有标题元素，顺序和正文一致）
    const heads = $('preview').querySelectorAll('h1, h2, h3, h4');
    const el = heads[idx];
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start' });
      } catch {
        el.scrollIntoView();
      }
    }
  }

  function applyOutlineState() {
    const on = !!state.settings.showOutline;
    $('outlinePanel').hidden = !on;
    $('panes').classList.toggle('outline-on', on);
    $('btnOutline').classList.toggle('on', on);
    if (on) renderOutline();
  }

  // ---------------------------------------------------------------- 导入

  /**
   * 把已有的 Markdown / 文本文件读成一篇文章。
   * 桌面版走系统「打开文件」对话框，手机版走 <input type="file">，
   * 两边返回同一种结构，所以这里只写一套。
   */
  async function importArticle() {
    if (typeof LP.importArticle !== 'function') {
      toast('这个平台还不支持导入', 'err');
      return;
    }
    await flushSave();
    setStatus('正在导入…');

    let res = null;
    try {
      res = await LP.importArticle();
    } catch (err) {
      res = { error: String((err && err.message) || err) };
    }

    if (!res || res.canceled) {
      setStatus('已取消');
      return;
    }
    if (res.error) {
      toast('导入失败：' + res.error, 'err');
      setStatus('导入失败');
      return;
    }

    const created = await LP.saveArticle({
      title: res.title || '导入的文章',
      content: res.content || '',
    });
    await reloadList(true);
    renderList();
    await openArticle(created.id);
    toast('已导入「' + (created.title || '未命名') + '」', 'ok');
  }

  // ---------------------------------------------------------------- 外观

  const FONT_MIN = 13;
  const FONT_MAX = 24;

  /** 字号：写到 CSS 变量上，编辑区和预览一起变。 */
  function applyFontSize() {
    let size = Number(state.settings.fontSize);
    if (!Number.isFinite(size)) size = 16;
    size = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)));
    document.documentElement.style.setProperty('--editor-font-size', size + 'px');
    const range = $('setFontSize');
    if (range) range.value = String(size);
    const hint = $('fontSizeHint');
    if (hint) hint.textContent = size + ' px';
  }

  /** 沉浸阅读：收起侧栏，工具栏只留几个还能用的开关。 */
  function applyReadingMode() {
    const on = !!state.settings.readingMode;
    document.body.classList.toggle('reading-mode', on);
    $('btnReading').classList.toggle('on', on);
    setTimeout(resizeCharts, 30);
  }

  /** 设置里的分段控件，主题 / 排序 / 沉浸 / 大纲共用这一套。 */
  function buildSegmented(boxId, options, current, onPick) {
    const box = $(boxId);
    if (!box) return;
    box.innerHTML = '';
    for (const opt of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg' + (current === opt.key ? ' on' : '');
      b.textContent = opt.label;
      b.addEventListener('click', () => onPick(opt.key));
      box.appendChild(b);
    }
  }

  /**
   * 把设置里已经存着的值全部铺到界面上。
   * 之前 fontSize / sort / readingMode 三样在仓库层都有、界面却一次都没用过，
   * 这里一次性接上，启动和打开设置面板都走同一个入口。
   */
  function applySettingsUi() {
    applyTheme();

    buildSegmented(
      'sortSwitch',
      [
        { key: 'updated', label: '最近修改' },
        { key: 'created', label: '创建时间' },
        { key: 'title', label: '标题' },
        { key: 'chars', label: '字数' },
      ],
      state.settings.sort || 'updated',
      async (key) => {
        state.settings = await LP.setSettings({ sort: key });
        applySettingsUi();
        await reloadList(true);
        renderList();
      },
    );

    buildSegmented(
      'readingModeSwitch',
      [
        { key: 'off', label: '普通' },
        { key: 'on', label: '沉浸' },
      ],
      state.settings.readingMode ? 'on' : 'off',
      async (key) => {
        state.settings = await LP.setSettings({ readingMode: key === 'on' });
        applySettingsUi();
        applyReadingMode();
      },
    );

    buildSegmented(
      'outlineSwitch',
      [
        { key: 'off', label: '收起' },
        { key: 'on', label: '展开' },
      ],
      state.settings.showOutline ? 'on' : 'off',
      async (key) => {
        state.settings = await LP.setSettings({ showOutline: key === 'on' });
        applyOutlineState();
        applySettingsUi();
      },
    );

    applyFontSize();
  }

  // ---------------------------------------------------------------- 事件绑定

  function bind() {
    $('btnNew').addEventListener('click', newArticle);
    $('btnNew2').addEventListener('click', newArticle);

    $('list').addEventListener('click', (e) => {
      // 点标签是「筛选」，点卡片其它地方才是「打开」
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.tag) {
        e.stopPropagation();
        state.tagFilter = state.tagFilter === chip.dataset.tag ? '' : chip.dataset.tag;
        renderList();
        return;
      }
      const item = e.target.closest('.item');
      if (item) openArticle(item.dataset.id);
    });

    $('search').addEventListener('input', (e) => {
      state.query = e.target.value;
      renderList();
    });

    $('title').addEventListener('input', markDirty);
    $('editor').addEventListener('input', () => {
      updateStats();
      scheduleOutline();
      markDirty();
    });

    $('btnChart').addEventListener('click', openChartDialog);
    $('btnImage').addEventListener('click', insertImages);
    $('btnFile').addEventListener('click', insertFiles);
    $('btnDelete').addEventListener('click', deleteCurrent);

    // 下面这些能力仓库层一直都有，之前只是没接到界面上
    $('btnBack').addEventListener('click', () => setView('list'));
    $('btnPin').addEventListener('click', togglePinCurrent);
    $('btnTagsEdit').addEventListener('click', () => openTags(true));
    $('btnHistory').addEventListener('click', openHistory);
    $('btnTrash').addEventListener('click', openTrash);
    $('btnTags').addEventListener('click', () => openTags(false));

    $('trashClose').addEventListener('click', () => {
      $('trashModal').hidden = true;
    });
    $('trashOk').addEventListener('click', () => {
      $('trashModal').hidden = true;
    });
    $('trashClear').addEventListener('click', async () => {
      const items = (await LP.listTrash()) || [];
      if (!items.length) {
        toast('回收站本来就是空的', 'ok');
        return;
      }
      const ok = window.confirm(`彻底删除回收站里的 ${items.length} 篇文章？\n\n这一步之后就真的找不回来了。`);
      if (!ok) return;
      let done = 0;
      for (const it of items) {
        // 逐篇删，不依赖仓库层有没有批量清空的接口
        const res = await LP.purgeArticle(it.id);
        if (res && res.ok) done += 1;
      }
      await reloadList(true);
      renderList();
      await renderTrash();
      toast(`已彻底删除 ${done} 篇`, 'ok');
    });

    $('tagsClose').addEventListener('click', () => {
      $('tagsModal').hidden = true;
    });
    $('tagsCancel').addEventListener('click', () => {
      $('tagsModal').hidden = true;
    });
    $('tagsSave').addEventListener('click', saveTagsFromDialog);

    $('historyClose').addEventListener('click', () => {
      $('historyModal').hidden = true;
    });
    $('historyOk').addEventListener('click', () => {
      $('historyModal').hidden = true;
    });

    $('btnPreview').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ showPreview: !state.settings.showPreview });
      applyPreviewState();
    });

    $('btnOutline').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ showOutline: !state.settings.showOutline });
      applyOutlineState();
    });

    $('outlineClose').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ showOutline: false });
      applyOutlineState();
    });

    // 大纲项是动态生成的，用事件委托，省得每次重算都重新绑一轮
    $('outlineList').addEventListener('click', (e) => {
      const item = e.target.closest('.outline-item');
      if (!item) return;
      jumpToHeading(item.dataset.line, Number(item.dataset.idx));
    });

    $('btnReading').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ readingMode: !state.settings.readingMode });
      applyReadingMode();
    });

    $('btnImport').addEventListener('click', importArticle);

    // 拖的时候只改显示，松手才落盘，免得拖动过程里反复写设置
    $('setFontSize').addEventListener('input', (e) => {
      $('fontSizeHint').textContent = e.target.value + ' px';
      document.documentElement.style.setProperty('--editor-font-size', e.target.value + 'px');
    });
    $('setFontSize').addEventListener('change', async (e) => {
      state.settings = await LP.setSettings({ fontSize: Number(e.target.value) });
      applyFontSize();
    });

    $('btnExportHtml').addEventListener('click', async () => {
      await flushSave();
      if (!state.current) return;
      setStatus('正在导出…');
      const res = await LP.exportHtml(state.current.id);
      if (res.ok) {
        toast('已导出：' + res.path, 'ok');
        setStatus('导出完成');
      } else if (!res.canceled) {
        toast('导出失败：' + (res.error || '未知错误'), 'err');
        setStatus('导出失败');
      } else {
        setStatus('已取消');
      }
    });

    $('btnExportMd').addEventListener('click', async () => {
      await flushSave();
      if (!state.current) return;
      const res = await LP.exportMarkdown(state.current.id);
      if (res.ok) toast('已导出：' + res.path, 'ok');
      else if (!res.canceled) toast('导出失败：' + (res.error || '未知错误'), 'err');
    });

    $('btnDataDir').addEventListener('click', () => LP.openDataDir());
    $('btnSettings').addEventListener('click', openSettings);
    $('openDataDir').addEventListener('click', () => LP.openDataDir());
    $('settingsOk').addEventListener('click', () => {
      $('settingsModal').hidden = true;
    });
    $('settingsClose').addEventListener('click', () => {
      $('settingsModal').hidden = true;
    });

    $('chartClose').addEventListener('click', closeChartDialog);
    $('chartCancel').addEventListener('click', closeChartDialog);
    $('chartInsert').addEventListener('click', confirmChartInsert);
    $('addSeries').addEventListener('click', () => {
      addSeriesRow('', '');
      previewChart();
    });
    $('chartHeight').addEventListener('input', (e) => {
      $('heightHint').textContent = e.target.value + ' px';
      previewChart();
    });
    for (const id of ['chartTitle', 'chartX', 'chartPie']) {
      $(id).addEventListener('input', previewChart);
    }

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow().then(() => toast('已保存', 'ok'));
        return;
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newArticle();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('chartModal').hidden) closeChartDialog();
        if (!$('settingsModal').hidden) $('settingsModal').hidden = true;
        if (!$('trashModal').hidden) $('trashModal').hidden = true;
        if (!$('tagsModal').hidden) $('tagsModal').hidden = true;
        if (!$('historyModal').hidden) $('historyModal').hidden = true;
      }
    });

    window.addEventListener('resize', resizeCharts);
    window.addEventListener('beforeunload', () => {
      if (state.dirty) saveNow();
    });
  }

  function applyPreviewState() {
    const panes = $('panes');
    const on = !!state.settings.showPreview;
    panes.classList.toggle('preview-off', !on);
    $('btnPreview').classList.toggle('on', on);
    renderPreview();
    if (on) setTimeout(resizeCharts, 30);
  }

  async function deleteCurrent() {
    if (!state.current) return;
    const title = $('title').value.trim() || '未命名';
    const ok = window.confirm(
      `把《${title}》放进回收站？\n\n文章会留在回收站里，之后还能恢复。\n正文里引用过的图片和附件文件不会被删掉。`,
    );
    if (!ok) return;
    const res = await LP.deleteArticle(state.current.id);
    if (!res || !res.ok) {
      toast('删除失败：' + ((res && res.error) || '未知错误'), 'err');
      return;
    }
    state.current = null;
    state.dirty = false;
    $('editorWrap').hidden = true;
    $('empty').hidden = false;
    disposeCharts();
    await reloadList();
    renderList();
    setView('list');
    toast('已放进回收站', 'ok');
  }

  // ---------------------------------------------------------------- 启动

  async function boot() {
    if (!LP || !MD || !CH) {
      document.body.innerHTML =
        '<div style="padding:40px;font-size:15px;line-height:2">' +
        '应用初始化失败：预加载脚本或本地模块没有加载成功。<br>' +
        '请尝试重启应用；如果一直如此，请把界面按 F12 打开控制台后的报错发出来。</div>';
      return;
    }

    state.settings = await LP.getSettings();
    applySettingsUi();
    applyPreviewState();
    setupSplitter();
    bind();
    await reloadList();
    renderList();
    setStatus('就绪');

    const info = await LP.appInfo();
    setStatus('数据目录：' + info.dataDir);
  }

  window.addEventListener('error', (e) => {
    setStatus('运行出错：' + (e.message || '未知错误'));
  });

  document.addEventListener('DOMContentLoaded', boot);
})();
