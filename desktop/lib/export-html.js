'use strict';

/**
 * 把一篇文章渲染成一个可以直接双击打开、也可以随便发给别人的 HTML 文件。
 *
 * 规则：
 *  - ECharts 运行库内联进 HTML，图表离线也能画出来
 *  - 正文里 lp://files/xxx 改写成 ./文章名.files/xxx，附件由调用方复制到同目录
 *  - 图片、其他附件一视同仁，都是普通文件链接
 *
 * 手机/网页版走的是另一条路（renderer/export-web.js，把附件转成 data: URL
 * 打成单文件），但页面样式与启动脚本共用 lib/page-style.js，保证两边长得一样。
 */

const fs = require('node:fs');
const path = require('node:path');

const { renderMarkdown, escapeHtml } = require('./markdown');
const { splitChartCards, chartCardToEchartsOption, chartHeight } = require('./chart');
const { pageCss, bootScript } = require('./page-style');

const FILE_REF_RE = /lp:\/\/files\/([A-Za-z0-9._-]+)/g;
const PLACEHOLDER = '{{ASSET_DIR}}';

function readEcharts() {
  const candidates = [
    path.join(__dirname, '..', 'renderer', 'vendor', 'echarts.min.js'),
    path.join(__dirname, '..', '..', 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch {
      /* 继续试下一个 */
    }
  }
  return '';
}

function renderChartBlock(card) {
  const option = chartCardToEchartsOption(card, 'light');
  const json = JSON.stringify(option).replace(/</g, '\\u003c');
  return (
    '<figure class="lp-chart" style="height:' +
    chartHeight(card) +
    'px" data-option="' +
    escapeHtml(json) +
    '"></figure>'
  );
}

function renderBody(content) {
  const segments = splitChartCards(content);
  const parts = [];
  for (const seg of segments) {
    if (seg.kind === 'chart') {
      parts.push(renderChartBlock(seg.card));
    } else {
      const html = renderMarkdown(seg.text).trim();
      if (html) parts.push(html);
    }
  }
  return parts.join('\n');
}

/** 收集正文里引用到的附件文件名。 */
function collectRefs(content) {
  const found = new Set();
  let m;
  FILE_REF_RE.lastIndex = 0;
  while ((m = FILE_REF_RE.exec(String(content || ''))) !== null) {
    found.add(m[1]);
  }
  return Array.from(found);
}

function buildHtml(article, filesDir, assetDirName) {
  const title = article.title || '未命名';
  const body = renderBody(article.content || '');

  const refs = collectRefs(article.content || '').filter((stored) =>
    fs.existsSync(path.join(filesDir, stored)),
  );

  let html = body.replace(/lp:\/\/files\/([A-Za-z0-9._-]+)/g, PLACEHOLDER + '/$1');
  html = html.replace(/\{\{ASSET_DIR\}\}/g, './' + assetDirName);

  // 内联进来的 JS 里如果出现 </script（当前版本没有，防一手），
  // 会被 HTML 解析器当成脚本结束标签，所以统一转义成 <\/script
  const echarts = readEcharts().replace(/<\/script/gi, '<\\/script');
  const meta = article.updatedAt ? new Date(article.updatedAt).toLocaleDateString('zh-CN') : '';

  const excerpt =
    article.summary ||
    (article.content || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/lp:\/\/files\/\S+/g, ' ')
      .replace(/[#*`~\[\]()!<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  const imgMatch = /!\[.*?\]\((lp:\/\/files\/[^\)]+|\S+\.(?:png|jpe?g|webp|gif))\)/i.exec(article.content || '');
  let coverUrl = '';
  if (imgMatch) {
    coverUrl = imgMatch[1].replace('lp://files/', './' + assetDirName + '/');
  }

  const page = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + escapeHtml(title) + '</title>',
    '<meta name="description" content="' + escapeHtml(excerpt) + '">',
    '<meta property="og:type" content="article">',
    '<meta property="og:title" content="' + escapeHtml(title) + '">',
    '<meta property="og:description" content="' + escapeHtml(excerpt) + '">',
    '<meta property="og:site_name" content="LongPost">',
    coverUrl ? '<meta property="og:image" content="' + escapeHtml(coverUrl) + '">' : '',
    '<meta name="twitter:card" content="' + (coverUrl ? 'summary_large_image' : 'summary') + '">',
    '<meta name="twitter:title" content="' + escapeHtml(title) + '">',
    '<meta name="twitter:description" content="' + escapeHtml(excerpt) + '">',
    coverUrl ? '<meta name="twitter:image" content="' + escapeHtml(coverUrl) + '">' : '',
    '<style>' + pageCss() + '</style>',
    '</head>',
    '<body>',
    '<main class="lp-page">',
    '<h1 class="lp-title">' + escapeHtml(title) + '</h1>',
    meta ? '<div class="lp-meta">最后更新：' + escapeHtml(meta) + '</div>' : '',
    '<article class="lp-body">',
    html,
    '</article>',
    '</main>',
    echarts ? '<script>' + echarts + '</script>' : '',
    '<script>' + bootScript(echarts ? true : false) + '</script>',
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');

  const files = refs.map((stored) => ({ stored: stored }));
  return { html: page, files: files };
}

module.exports = buildHtml;
module.exports.collectRefs = collectRefs;
module.exports.renderBody = renderBody;
