#!/usr/bin/env node
/**
 * 把 docs/WHITEPAPER.md 渲染成自包含 HTML（docs/whitepaper.html）。
 *
 * 用 marked 而不是仓库里那份手写 markdown.js：白皮书大量使用表格与嵌套代码围栏，
 * marked 的 GFM 支持更稳。生成的是独立文件，样式内联，双击即可阅读。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');

const root = path.join(__dirname, '..');
const mdPath = path.join(root, 'docs', 'WHITEPAPER.md');
const outPath = path.join(root, 'docs', 'whitepaper.html');

const md = fs.readFileSync(mdPath, 'utf8');

marked.setOptions({ gfm: true, headerIds: false, mangle: false });

const bodyHtml = marked.parse(md);

// 生成目录：抓 h2 / h3
const headings = [];
const slug = (text) =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

let index = 0;
const withIds = bodyHtml.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_m, tag, inner) => {
  index += 1;
  const text = inner.replace(/<[^>]+>/g, '').trim();
  const id = 'h' + index;
  if (text && text !== '目录') headings.push({ level: Number(tag[1]), text, id });
  return '<' + tag + ' id="' + id + '">' + inner + '</' + tag + '>';
});

const toc = headings
  .map((h) => '<li class="lv' + h.level + '"><a href="#' + h.id + '">' + h.text + '</a></li>')
  .join('\n');

const css = `
:root { --ink: #1a1d21; --sub: #5a6472; --line: #e3e7ec; --accent: #1d6fe0; --bg: #fbfcfd; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.85 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.page { max-width: 860px; margin: 0 auto; padding: 56px 48px 96px; }
.cover { text-align: center; padding: 72px 0 56px; border-bottom: 2px solid var(--line); margin-bottom: 40px; }
.cover h1 { font-size: 34px; margin: 0 0 12px; letter-spacing: -0.5px; }
.cover p { color: var(--sub); margin: 6px 0; font-size: 14px; }
.toc { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 22px 26px; margin: 0 0 44px; }
.toc h2 { margin: 0 0 12px; font-size: 16px; letter-spacing: 1px; color: var(--sub); text-transform: uppercase; }
.toc ul { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 32px; }
.toc li { break-inside: avoid; margin: 4px 0; font-size: 13.5px; }
.toc li.lv3 { padding-left: 14px; font-size: 12.5px; color: var(--sub); }
.toc a { color: var(--ink); text-decoration: none; }
.toc a:hover { color: var(--accent); }
h1, h2, h3, h4 { line-height: 1.35; margin: 2em 0 0.6em; }
h2 { font-size: 24px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
h3 { font-size: 18px; color: #23282f; }
h4 { font-size: 15.5px; }
p { margin: 0.7em 0; }
a { color: var(--accent); }
hr { border: none; border-top: 1px solid var(--line); margin: 40px 0; }
blockquote {
  margin: 1em 0; padding: 10px 18px; border-left: 3px solid var(--accent);
  background: #f2f6fd; color: #2b3a4a; border-radius: 0 8px 8px 0;
}
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
p code, li code { background: #eef1f5; padding: 1px 5px; border-radius: 4px; }
pre {
  background: #0f141a; color: #d8e0ea; padding: 16px 18px; border-radius: 10px;
  overflow: auto; font-size: 12.5px; line-height: 1.6;
}
pre code { color: inherit; background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13.5px; }
th, td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; vertical-align: top; }
th { background: #f3f6f9; font-weight: 600; }
tbody tr:nth-child(even) { background: #fafbfc; }
ul, ol { padding-left: 1.4em; }
li { margin: 0.3em 0; }
@media print {
  @page { size: A4; margin: 16mm 14mm; }
  body { background: #fff; font-size: 11pt; }
  .page { max-width: none; padding: 0; }
  .cover { page-break-after: always; padding-top: 30mm; }
  .toc { page-break-after: always; break-inside: avoid; }
  h2 { page-break-before: auto; page-break-after: avoid; }
  h3, h4 { page-break-after: avoid; }
  pre, table, blockquote { page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;

const title = (md.match(/^#\s+(.+)$/m) || [, 'LongPost 技术白皮书'])[1];
const stripMd = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

const meta = (md.match(/^> (.*)$/gm) || [])
  .slice(0, 4)
  .map((l) => '<p>' + stripMd(l.replace(/^>\s*/, '')) + '</p>')
  .join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div class="page">
  <div class="cover">
    <h1>${title}</h1>
    <div class="meta">${meta}</div>
  </div>
  <nav class="toc">
    <h2>目录</h2>
    <ul>${toc}</ul>
  </nav>
  <main>
${withIds}
  </main>
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log('[whitepaper] 已生成 ' + path.relative(root, outPath) + '（' + Math.round(html.length / 1024) + ' KB，' + headings.length + ' 个标题）');
