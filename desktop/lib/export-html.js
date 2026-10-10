'use strict';

/**
 * 把一篇文章渲染成一个可以直接双击打开、也可以随便发给别人的 HTML 文件。
 *
 * 规则：
 *  - ECharts 运行库内联进 HTML，图表离线也能画出来
 *  - 正文里 lp://files/xxx 改写成 ./文章名.files/xxx，附件由调用方复制到同目录
 *  - 图片、其他附件一视同仁，都是普通文件链接
 */

const fs = require('node:fs');
const path = require('node:path');

const { renderMarkdown, escapeHtml } = require('./markdown');
const { splitChartCards, chartCardToEchartsOption, chartHeight } = require('./chart');

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

  let html = body.replace(
    /lp:\/\/files\/([A-Za-z0-9._-]+)/g,
    PLACEHOLDER + '/$1',
  );
  html = html.replace(/\{\{ASSET_DIR\}\}/g, './' + assetDirName);

  // 内联进来的 JS 里如果出现 </script（当前版本没有，防一手），
  // 会被 HTML 解析器当成脚本结束标签，所以统一转义成 <\/script
  const echarts = readEcharts().replace(/<\/script/gi, '<\\/script');
  const meta = article.updatedAt
    ? new Date(article.updatedAt).toLocaleDateString('zh-CN')
    : '';

  const page = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + escapeHtml(title) + '</title>',
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

function bootScript(hasEcharts) {
  return [
    '(function(){',
    '  var nodes = document.querySelectorAll(".lp-chart");',
    '  if (!nodes.length) return;',
    hasEcharts ? '' : '  return;',
    '  for (var i = 0; i < nodes.length; i++) {',
    '    var el = nodes[i];',
    '    try {',
    '      var option = JSON.parse(el.getAttribute("data-option") || "{}");',
    '      var chart = window.echarts.init(el, null, { renderer: "canvas" });',
    '      chart.setOption(option);',
    '      window.addEventListener("resize", (function (c) {',
    '        return function () { c.resize(); };',
    '      })(chart));',
    '    } catch (e) {',
    '      el.textContent = "图表渲染失败";',
    '    }',
    '  }',
    '})();',
  ]
    .filter(function (l) {
      return l !== '';
    })
    .join('\n');
}

function pageCss() {
  return [
    ':root{color-scheme:light}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:#f6f7f9;color:#16181d;',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;",
    'line-height:1.78;font-size:16.5px}',
    '.lp-page{max-width:760px;margin:0 auto;padding:56px 22px 96px;background:#fff;min-height:100vh}',
    '@media(max-width:820px){.lp-page{padding:32px 18px 64px}}',
    '.lp-title{font-size:32px;line-height:1.3;margin:0 0 10px;letter-spacing:-.01em}',
    '.lp-meta{color:#8a9099;font-size:13.5px;margin-bottom:34px}',
    '.lp-body h1,.lp-body h2,.lp-body h3,.lp-body h4{line-height:1.35;margin:2em 0 .6em;font-weight:700}',
    '.lp-body h1{font-size:26px}.lp-body h2{font-size:23px}.lp-body h3{font-size:19px}.lp-body h4{font-size:17px}',
    '.lp-body p{margin:1em 0}',
    '.lp-body a{color:#2563eb;text-decoration:none}',
    '.lp-body a:hover{text-decoration:underline}',
    '.lp-body img{max-width:100%;height:auto;border-radius:8px;display:block;margin:1.2em auto}',
    '.lp-body ul,.lp-body ol{padding-left:1.5em;margin:1em 0}',
    '.lp-body li{margin:.3em 0}',
    '.lp-body blockquote{margin:1.2em 0;padding:.6em 1.1em;border-left:3px solid #d7dbe0;background:#fafbfc;color:#4a5158;border-radius:0 6px 6px 0}',
    '.lp-body hr{border:0;border-top:1px solid #e6e9ed;margin:2.2em 0}',
    '.lp-body code{background:#f1f3f6;padding:.15em .4em;border-radius:4px;font-size:.9em;',
    "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
    '.lp-body pre.code-block{background:#1b1f27;color:#e6e9ef;padding:16px 18px;border-radius:10px;overflow:auto;margin:1.4em 0}',
    '.lp-body pre.code-block code{background:none;color:inherit;padding:0;font-size:13.5px;line-height:1.6}',
    '.lp-body table{border-collapse:collapse;width:100%;margin:1.4em 0;font-size:15px;display:block;overflow-x:auto}',
    '.lp-body th,.lp-body td{border:1px solid #e3e7ec;padding:8px 12px;text-align:left}',
    '.lp-body th{background:#f7f8fa;font-weight:600}',
    '.lp-chart{margin:1.8em 0;width:100%}',
    '.lp-body del{color:#8a9099}',
  ].join('');
}

module.exports = buildHtml;
