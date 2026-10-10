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
    chartInstances: [],
    dialogType: 'bar',
    saveTimer: null,
    previewTimer: null,
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
    state.articles = (await LP.listArticles()) || [];
    renderList();
    if (!keepCurrent && !state.current && state.articles.length) {
      // 不做自动打开，保留「新建」空态；由调用方决定
    }
  }

  function visibleArticles() {
    const q = state.query.trim().toLowerCase();
    if (!q) return state.articles;
    return state.articles.filter((a) => (a.searchText || '').indexOf(q) !== -1);
  }

  function renderList() {
    const list = $('list');
    const items = visibleArticles();
    list.innerHTML = '';

    if (!items.length) {
      const div = document.createElement('div');
      div.className = 'list-empty';
      div.textContent = state.articles.length ? '没有匹配的文章' : '还没有文章，点上面「新建文章」开始';
      list.appendChild(div);
    } else {
      for (const a of items) {
        const el = document.createElement('div');
        el.className = 'item' + (state.current && state.current.id === a.id ? ' active' : '');
        el.dataset.id = a.id;

        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = a.title || '未命名';

        const sum = document.createElement('div');
        sum.className = 'item-sum';
        sum.textContent = a.summary || '（空）';

        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = `${a.chars} 字${a.charts ? ' · ' + a.charts + ' 图表' : ''} · ${formatTime(a.updatedAt)}`;

        el.appendChild(title);
        el.appendChild(sum);
        el.appendChild(meta);
        list.appendChild(el);
      }
    }

    $('count').textContent = `${state.articles.length} 篇`;
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
    renderList();
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
    await reloadList(true);
    renderList();
    $('title').focus();
    $('title').select();
    setStatus('新文章');
  }

  function updateStats() {
    const content = $('editor').value || '';
    const charts = CH.chartCount(content);
    $('stats').textContent = `${content.length} 字${charts ? ' · ' + charts + ' 个图表' : ''}`;
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

  // ---------------------------------------------------------------- 设置

  function applyTheme() {
    document.body.className = state.settings.theme === 'light' ? 'light' : '';
    const box = $('themeSwitch');
    box.innerHTML = '';
    for (const t of [
      { key: 'dark', label: '深色' },
      { key: 'light', label: '浅色' },
    ]) {
      const b = document.createElement('button');
      b.className = 'seg' + (state.settings.theme === t.key ? ' on' : '');
      b.textContent = t.label;
      b.addEventListener('click', async () => {
        state.settings = await LP.setSettings({ theme: t.key });
        applyTheme();
        renderPreview();
        if (!$('chartModal').hidden) previewChart();
      });
      box.appendChild(b);
    }
  }

  async function openSettings() {
    const info = await LP.appInfo();
    $('dataDirText').textContent = info.dataDir;
    $('aboutText').textContent =
      `LongPost 桌面版 v${info.version} · ${info.platform}\n` +
      '离线可用。文章、图片、附件全部存放在上面这个目录里，不会上传到任何服务器。' +
      '卸载应用不会删除这个目录，需要的话可以手动备份。';
    $('aboutText').style.whiteSpace = 'pre-line';
    applyTheme();
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

  // ---------------------------------------------------------------- 事件绑定

  function bind() {
    $('btnNew').addEventListener('click', newArticle);
    $('btnNew2').addEventListener('click', newArticle);

    $('list').addEventListener('click', (e) => {
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
      markDirty();
    });

    $('btnChart').addEventListener('click', openChartDialog);
    $('btnImage').addEventListener('click', insertImages);
    $('btnFile').addEventListener('click', insertFiles);
    $('btnDelete').addEventListener('click', deleteCurrent);

    $('btnPreview').addEventListener('click', async () => {
      state.settings = await LP.setSettings({ showPreview: !state.settings.showPreview });
      applyPreviewState();
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
    const ok = window.confirm(`确定删除《${title}》吗？\n\n删除后无法撤销。已插入正文的图片和附件文件不会被删掉。`);
    if (!ok) return;
    const res = await LP.deleteArticle(state.current.id);
    if (!res || !res.ok) {
      toast('删除失败', 'err');
      return;
    }
    state.current = null;
    state.dirty = false;
    $('editorWrap').hidden = true;
    $('empty').hidden = false;
    disposeCharts();
    await reloadList();
    renderList();
    toast('已删除', 'ok');
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
    applyTheme();
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
