import {
  chartCardToEchartsOption,
  chartHeight,
  splitChartCards,
} from '@shared/chart-card';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 只放行安全协议（http, https, mailto, 相对路径与锚点）；
 * 阻断 javascript:、data:、vbscript: 等伪协议注入。
 */
export function safeUrl(url: string): string | null {
  const u = String(url || '').trim();
  if (!u) return null;
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^(#|\.{0,2}\/)/.test(u)) return u;
  return null;
}

function inlineFormat(text: string): string {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/(^|\W)\*(.+?)\*/g, '$1<em>$2</em>');
  escaped = escaped.replace(/`(.+?)`/g, '<code>$1</code>');
  escaped = escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, url) => {
      const safe = safeUrl(url);
      if (!safe) return label;
      return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );
  return escaped;
}

function wrapListItems(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const isLi = line.startsWith('<li>');
    if (isLi) {
      const content = line.replace(/^<li>|<\/li>$/g, '');
      const isOrdered = /^\d+\./.test(content);
      if (isOrdered) {
        if (!inOl) {
          if (inUl) {
            result.push('</ul>');
            inUl = false;
          }
          result.push('<ol>');
          inOl = true;
        }
      } else {
        if (!inUl) {
          if (inOl) {
            result.push('</ol>');
            inOl = false;
          }
          result.push('<ul>');
          inUl = true;
        }
      }
      result.push(line);
    } else {
      if (inUl) {
        result.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        result.push('</ol>');
        inOl = false;
      }
      result.push(line);
    }
  }

  if (inUl) result.push('</ul>');
  if (inOl) result.push('</ol>');

  return result.join('\n');
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const html: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim();
      if (text) {
        html.push(`<p>${inlineFormat(text)}</p>`);
      }
      paragraphBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      html.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph();
      html.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      html.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      html.push(
        `<blockquote>${inlineFormat(trimmed.slice(2))}</blockquote>`,
      );
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph();
      html.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      flushParagraph();
      const content = trimmed.replace(/^\d+\.\s/, '');
      html.push(`<li>${inlineFormat(content)}</li>`);
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();

  return wrapListItems(html.join('\n'));
}

export interface ArticleBodyRenderResult {
  html: string;
  /** 正文中的图表数量，用于决定是否加载 echarts */
  chartCount: number;
}

/**
 * 渲染文章正文：普通段落交给 markdown 渲染，```chart 围栏块替换成 echarts 容器。
 *
 * 容器上只放 data-option（转义后的 option JSON），真正的初始化交给页面里的一小段脚本，
 * 这样服务端不需要理解图表细节，也不会把 1MB 的 echarts 内联进 HTML。
 */
export function renderArticleBody(
  markdown: string,
  theme: 'light' | 'dark' = 'dark',
): ArticleBodyRenderResult {
  const segments = splitChartCards(markdown ?? '');
  const html: string[] = [];
  let chartCount = 0;

  for (const segment of segments) {
    if (segment.kind === 'markdown') {
      const rendered = markdownToHtml(segment.content).trim();
      if (rendered) html.push(rendered);
      continue;
    }

    if (segment.kind === 'chart') {
      const option = chartCardToEchartsOption(segment.card, theme);
      const height = chartHeight(segment.card);
      html.push(
        `<div class="lp-chart" style="height:${height}px" data-option="${escapeHtml(
          JSON.stringify(option),
        )}"></div>`,
      );
      chartCount += 1;
      continue;
    }

    // 图表块写错了：原样留成代码块，作者在阅读页上一眼就能看出问题
    html.push(
      `<pre class="lp-chart-error"><code>${escapeHtml(
        segment.raw.trim(),
      )}</code></pre>`,
    );
  }

  return { html: html.join('\n'), chartCount };
}

export function formatSize(sizeBytes: number | null): string {
  if (!sizeBytes || sizeBytes <= 0) return '未知大小';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024)
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExt(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1
    ? parts[parts.length - 1].toUpperCase().slice(0, 4)
    : 'FILE';
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}
