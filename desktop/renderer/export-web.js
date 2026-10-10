/**
 * 网页 / 手机版的「单文件 HTML」导出。
 *
 * 跟桌面版的区别：桌面版会在旁边生成一个「标题.files」附件夹，HTML 里用相对路径引它；
 * 手机上没有「旁边的文件夹」这回事，用户拿到的只有一个文件，所以这里：
 *   - 图片一律转成 data: URL 内联进去，发给谁都能直接看
 *   - 非图片附件不超过 8MB 也内联；超过的记在页首提示里，避免把 HTML 撑成几十兆
 *   - ECharts 运行库尽量内联；取不到就退回 CDN 标签（联网时图表照样显示）
 *
 * 页面样式与启动脚本用的是 lib/page-style.js 那一份，跟桌面导出完全一致。
 */
(function () {
  'use strict';

  const INLINE_LIMIT = 8 * 1024 * 1024;
  const FILE_REF_RE = /lp:\/\/files\/([A-Za-z0-9._-]+)/g;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
      reader.readAsDataURL(blob);
    });
  }

  function collectRefs(content) {
    const found = [];
    let m;
    FILE_REF_RE.lastIndex = 0;
    const text = String(content || '');
    while ((m = FILE_REF_RE.exec(text)) !== null) {
      if (found.indexOf(m[1]) === -1) found.push(m[1]);
    }
    return found;
  }

  function renderChartBlock(card) {
    const CH = window.LPChart;
    const option = CH.chartCardToEchartsOption(card, 'light');
    const json = JSON.stringify(option).replace(/</g, '\\u003c');
    return (
      '<figure class="lp-chart" style="height:' +
      CH.chartHeight(card) +
      'px" data-option="' +
      escapeHtml(json) +
      '"></figure>'
    );
  }

  function renderBody(content) {
    const MD = window.LPMarkdown;
    const CH = window.LPChart;
    const parts = [];
    for (const seg of CH.splitChartCards(content)) {
      if (seg.kind === 'chart') {
        parts.push(renderChartBlock(seg.card));
      } else {
        const html = MD.renderMarkdown(seg.text).trim();
        if (html) parts.push(html);
      }
    }
    return parts.join('\n');
  }

  async function readEcharts(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return '';
      const text = await res.text();
      // 内联的脚本里出现 </script 会被 HTML 解析器当成结束标签
      return text.indexOf('echarts') !== -1 ? text.replace(/<\/script/gi, '<\\/script') : '';
    } catch {
      return '';
    }
  }

  /**
   * @param article  {title, content, updatedAt, tags}
   * @param opts     {readFileBlob(stored), listFiles(), echartsUrl}
   */
  async function buildSelfContained(article, opts) {
    const PS = window.LPPageStyle;
    if (!PS) return { ok: false, error: '页面样式模块没有加载' };

    const title = (article && article.title) || '未命名';
    const content = (article && article.content) || '';

    let body = renderBody(content);

    // 附件：能内联的内联，内联不了的记下来
    let meta = {};
    try {
      const rows = (await opts.listFiles()) || [];
      for (const r of rows) meta[r.stored] = r;
    } catch {
      meta = {};
    }

    const refs = collectRefs(content);
    const skipped = [];
    for (const stored of refs) {
      const info = meta[stored] || { name: stored, size: 0, isImage: false };
      let blob = null;
      try {
        blob = await opts.readFileBlob(stored);
      } catch {
        blob = null;
      }
      const size = blob && typeof blob.size === 'number' ? blob.size : info.size || 0;
      const isImage = !!info.isImage;
      const canInline = !!blob && (isImage || size <= INLINE_LIMIT);

      if (canInline) {
        try {
          const dataUrl = await readAsDataUrl(blob);
          const re = new RegExp('lp://files/' + stored.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          body = body.replace(re, dataUrl);
          continue;
        } catch {
          /* 落到下面的 skipped */
        }
      }
      skipped.push({ name: info.name || stored, size });
      const re = new RegExp('lp://files/' + stored.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      body = body.replace(re, '#');
    }

    const echarts = await readEcharts(opts.echartsUrl || 'vendor/echarts.min.js');
    const updated = article && article.updatedAt ? new Date(article.updatedAt).toLocaleDateString('zh-CN') : '';
    const tags = Array.isArray(article && article.tags) ? article.tags : [];

    const metaLine = [
      updated ? '最后更新：' + escapeHtml(updated) : '',
      tags.length ? tags.map((t) => '#' + escapeHtml(t)).join(' ') : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const skippedNote = skipped.length
      ? '<div class="lp-meta lp-skipped">这一版没有随文打包的文件（原件仍在写作端）：' +
        skipped.map((s) => escapeHtml(s.name) + '（' + Math.round(s.size / 1024) + ' KB）').join('、') +
        '</div>'
      : '';

    const html = [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>' + escapeHtml(title) + '</title>',
      '<style>' + PS.pageCss() + '</style>',
      '</head>',
      '<body>',
      '<main class="lp-page">',
      '<h1 class="lp-title">' + escapeHtml(title) + '</h1>',
      metaLine ? '<div class="lp-meta">' + metaLine + '</div>' : '',
      skippedNote,
      '<article class="lp-body">',
      body,
      '</article>',
      '</main>',
      echarts ? '<script>' + echarts + '</script>' : '',
      echarts
        ? ''
        : '<script src="https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js"></script>',
      '<script>' + PS.bootScript(true) + '</script>',
      '</body>',
      '</html>',
    ]
      .filter(Boolean)
      .join('\n');

    return { ok: true, html: html, skipped: skipped, inlined: refs.length - skipped.length };
  }

  window.LPExportWeb = { buildSelfContained, collectRefs, INLINE_LIMIT };
})();
