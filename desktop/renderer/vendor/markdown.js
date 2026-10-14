/**
 * 自带 Markdown 渲染器（Markdown -> HTML）。
 *
 * 为什么不用现成库：这个文件要在两个地方跑 —— Electron 渲染进程（预览）和主进程（导出），
 * 环境要求不同；自己写一份纯函数，两边行为完全一致，也不引入额外依赖。
 *
 * 安全约定：所有文本先做 HTML 转义，链接只放行 http/https/mailto/lp，
 * 因此正文里写 <script> 不会被当标签执行。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LPMarkdown = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 只放行已知安全的协议；其余（javascript:、data: 等）一律降级成纯文本。 */
  function safeUrl(url) {
    const u = String(url || '').trim();
    if (!u) return null;
    if (/^(https?:|mailto:|lp:)/i.test(u)) return u;
    if (/^(#|\.{0,2}\/)/.test(u)) return u;
    return null;
  }

  const CODE_SLOT = '\u0000C';

  function renderInline(text) {
    const codes = [];
    let s = String(text == null ? '' : text).replace(/`([^`\n]+)`/g, (_m, c) => {
      codes.push(c);
      return CODE_SLOT + (codes.length - 1) + '\u0000';
    });

    s = escapeHtml(s);

    // 图片（在链接之前处理，避免 ![x](y) 被当成链接）
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, alt, url, title) => {
      const safe = safeUrl(url);
      if (!safe) return alt;
      const t = title ? ' title="' + title + '"' : '';
      return '<img src="' + safe + '" alt="' + alt + '"' + t + ' loading="lazy">';
    });

    s = s.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, label, url, title) => {
      const safe = safeUrl(url);
      if (!safe) return label;
      const t = title ? ' title="' + title + '"' : '';
      return '<a href="' + safe + '" target="_blank" rel="noreferrer noopener"' + t + '>' + label + '</a>';
    });

    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    s = s.replace(/\u0000C(\d+)\u0000/g, (_m, i) => '<code>' + escapeHtml(codes[Number(i)]) + '</code>');
    return s;
  }

  const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
  const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
  const OL_RE = /^(\s*)\d+\.\s+(.*)$/;

  function isTableDelimiter(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('|');
  }

  function startsBlock(line, next) {
    if (!String(line).trim()) return true;
    if (FENCE_RE.test(line)) return true;
    if (/^#{1,6}\s+/.test(line)) return true;
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
    if (/^\s{0,3}>\s?/.test(line)) return true;
    if (UL_RE.test(line)) return true;
    if (OL_RE.test(line)) return true;
    if (next && String(line).includes('|') && isTableDelimiter(next)) return true;
    return false;
  }

  function splitRow(line) {
    return String(line)
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  function renderTable(headerLine, delimLine, bodyLines) {
    const head = splitRow(headerLine);
    const aligns = splitRow(delimLine).map((c) => {
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });
    const style = (k) => (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : '');

    let html = '<table><thead><tr>';
    head.forEach((c, k) => {
      html += '<th' + style(k) + '>' + renderInline(c) + '</th>';
    });
    html += '</tr></thead><tbody>';
    for (const row of bodyLines) {
      const cells = splitRow(row);
      html += '<tr>';
      cells.forEach((c, k) => {
        html += '<td' + style(k) + '>' + renderInline(c) + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  /** 收集一段列表，返回条目（每个条目是多行数组）和下一行的位置。 */
  function collectList(lines, start, ordered) {
    const re = ordered ? OL_RE : UL_RE;
    const first = lines[start].match(re);
    const baseIndent = first[1].length;
    const items = [];
    let i = start;

    while (i < lines.length) {
      const m = lines[i].match(re);
      if (m && m[1].length === baseIndent) {
        items.push([m[2]]);
        i += 1;
      } else if (!lines[i].trim()) {
        break;
      } else if (items.length && lines[i].search(/\S/) > baseIndent) {
        items[items.length - 1].push(lines[i]);
        i += 1;
      } else {
        break;
      }

      // 条目内的续行（缩进更深）
      while (i < lines.length && lines[i].trim() && lines[i].search(/\S/) > baseIndent) {
        items[items.length - 1].push(lines[i]);
        i += 1;
      }
    }
    return { items, next: i };
  }

  function dedent(lines) {
    const indents = lines.filter((l) => l.trim()).map((l) => l.search(/\S/));
    const min = indents.length ? Math.min.apply(null, indents) : 0;
    return lines.map((l) => l.slice(min));
  }

  function renderList(items, ordered) {
    const tag = ordered ? 'ol' : 'ul';
    let html = '<' + tag + '>';
    for (const itemLines of items) {
      if (itemLines.length === 1) {
        html += '<li>' + renderInline(itemLines[0]) + '</li>';
        continue;
      }
      const body = dedent(itemLines).join('\n');
      const inner = renderMarkdown(body);
      // 单段落时去掉多余的 <p>，让列表看起来更紧凑
      const onePara = inner.startsWith('<p>') && inner.indexOf('</p>') === inner.length - 4;
      html += '<li>' + (onePara ? inner.slice(3, -4) : inner) + '</li>';
    }
    html += '</' + tag + '>';
    return html;
  }

  function renderMarkdown(source) {
    const lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const total = lines.length;
    let i = 0;

    while (i < total) {
      const line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      // 围栏代码块
      const fence = line.match(FENCE_RE);
      if (fence) {
        const marker = fence[2][0];
        const len = fence[2].length;
        const lang = (fence[3] || '').toLowerCase();
        const buf = [];
        i += 1;
        while (i < total) {
          const close = lines[i].match(FENCE_RE);
          if (close && close[2][0] === marker && close[2].length >= len) {
            i += 1;
            break;
          }
          buf.push(lines[i]);
          i += 1;
        }
        out.push(
          '<pre class="code-block"><code data-lang="' +
            escapeHtml(lang) +
            '">' +
            escapeHtml(buf.join('\n')) +
            '</code></pre>',
        );
        continue;
      }

      // 标题
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + '>' + renderInline(heading[2].trim()) + '</h' + level + '>');
        i += 1;
        continue;
      }

      // 分隔线
      if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      // 引用
      if (/^\s{0,3}>\s?/.test(line)) {
        const buf = [];
        while (i < total && /^\s{0,3}>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i += 1;
        }
        out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
        continue;
      }

      // 表格
      if (i + 1 < total && line.includes('|') && isTableDelimiter(lines[i + 1])) {
        const headerLine = line;
        const delim = lines[i + 1];
        const body = [];
        i += 2;
        while (i < total && lines[i].trim() && lines[i].includes('|')) {
          body.push(lines[i]);
          i += 1;
        }
        out.push(renderTable(headerLine, delim, body));
        continue;
      }

      // 列表
      if (UL_RE.test(line) || OL_RE.test(line)) {
        const ordered = OL_RE.test(line) && !UL_RE.test(line);
        const collected = collectList(lines, i, ordered);
        out.push(renderList(collected.items, ordered));
        i = collected.next;
        continue;
      }

      // 段落
      const buf = [];
      while (i < total && !startsBlock(lines[i], lines[i + 1])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (buf.length) {
        out.push('<p>' + renderInline(buf.join('\n')) + '</p>');
      } else {
        // 兜底：避免上面规则都没命中时死循环
        out.push('<p>' + renderInline(lines[i]) + '</p>');
        i += 1;
      }
    }

    return out.join('\n');
  }

  return { renderMarkdown: renderMarkdown, renderInline: renderInline, escapeHtml: escapeHtml };
});
