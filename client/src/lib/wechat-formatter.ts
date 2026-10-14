import { toast } from 'sonner';
import { logger } from './logger';

export interface WeChatArticleData {
  title: string;
  content: string;
  authorName?: string;
  publishedAt?: string | Date;
  coverUrl?: string | null;
  url?: string;
  excerpt?: string;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInlineMarkdown(text: string): string {
  const inlineCodes: string[] = [];
  let html = text.replace(/`([^`]+)`/g, (_, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(
      `<code style="background-color: #f1f5f9; color: #e11d48; padding: 2px 6px; border-radius: 4px; font-size: 88%; font-family: Menlo, Monaco, Consolas, Courier New, monospace;">${escapeHtml(code)}</code>`,
    );
    return `\u0000INLINECODE_${idx}\u0000`;
  });

  // Images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
    return `<figure style="margin: 20px 0; text-align: center;"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width: 100%; border-radius: 8px; display: block; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" />${alt ? `<figcaption style="margin-top: 8px; font-size: 13px; color: #94a3b8; text-align: center;">${escapeHtml(alt)}</figcaption>` : ''}</figure>`;
  });

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(label)}</a>`;
  });

  // Bold & Italics
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong style="font-weight: 700; color: #0f172a;"><em style="font-style: italic;">$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 700; color: #0f172a;">$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em style="font-style: italic; color: #334155;">$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del style="color: #94a3b8;">$1</del>');

  // Restore inline codes
  html = html.replace(/\u0000INLINECODE_(\d+)\u0000/g, (_, idx: string) => inlineCodes[Number(idx)] ?? '');
  return html;
}

export function buildWeChatHtml(article: WeChatArticleData): string {
  const title = article.title || '未命名长文';
  const authorName = article.authorName || 'LongPost 创作者';
  const dateStr = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
  const url = article.url || '';

  // Extract fenced code blocks
  const codeBlocks: string[] = [];
  const withoutFencedCode = article.content.replace(
    /```([^\n]*)\n([\s\S]*?)```/g,
    (_, lang: string, code: string) => {
      const idx = codeBlocks.length;
      const cleanLang = lang.trim();
      const codeHtml = `<section style="margin: 20px 0; background-color: #1e293b; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"><div style="background-color: #0f172a; padding: 6px 14px; font-size: 12px; color: #94a3b8; font-family: Menlo, Monaco, Consolas, monospace; display: flex; justify-content: space-between; align-items: center;"><span>${cleanLang ? escapeHtml(cleanLang) : 'code'}</span><span style="font-size: 11px; opacity: 0.7;">LongPost</span></div><pre style="margin: 0; padding: 14px; overflow-x: auto; font-family: Menlo, Monaco, Consolas, Courier New, monospace; font-size: 13px; line-height: 1.6; color: #f8fafc; background: transparent;"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre></section>`;
      codeBlocks.push(codeHtml);
      return `\n\u0000CODEBLOCK_${idx}\u0000\n`;
    },
  );

  const lines = withoutFencedCode.split(/\r?\n/);
  const bodyBlocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code block placeholder
    const codeMatch = trimmed.match(/^\u0000CODEBLOCK_(\d+)\u0000$/);
    if (codeMatch) {
      bodyBlocks.push(codeBlocks[Number(codeMatch[1])] ?? '');
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      bodyBlocks.push(
        '<section style="margin: 32px 0; text-align: center;"><hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 0 auto; width: 90%;" /></section>',
      );
      i++;
      continue;
    }

    // Headings (H1 to H4)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = formatInlineMarkdown(headingMatch[2].trim());
      if (level === 1) {
        bodyBlocks.push(
          `<h2 style="margin: 36px 0 16px; padding-bottom: 8px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.4; border-bottom: 2px solid #3b82f6; display: flex; align-items: center;"><span style="display: inline-block; width: 6px; height: 20px; background-color: #3b82f6; border-radius: 3px; margin-right: 8px;"></span>${headingText}</h2>`,
        );
      } else if (level === 2) {
        bodyBlocks.push(
          `<h3 style="margin: 30px 0 14px; padding-left: 10px; border-left: 4px solid #3b82f6; font-size: 18px; font-weight: 700; color: #1e293b; line-height: 1.4;">${headingText}</h3>`,
        );
      } else {
        bodyBlocks.push(
          `<h4 style="margin: 24px 0 12px; font-size: 16px; font-weight: 600; color: #334155; line-height: 1.4;">${headingText}</h4>`,
        );
      }
      i++;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        const cleaned = lines[i].trimStart().replace(/^>\s?/, '');
        quoteLines.push(formatInlineMarkdown(cleaned));
        i++;
      }
      bodyBlocks.push(
        `<blockquote style="margin: 22px 0; padding: 14px 18px; background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; color: #475569; font-size: 14px; line-height: 1.75; font-style: normal;"><p style="margin: 0; color: #475569;">${quoteLines.join('<br />')}</p></blockquote>`,
      );
      continue;
    }

    // Lists (Unordered & Ordered)
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))
      ) {
        const itemContent = lines[i].trim().replace(/^([*-+]|\d+\.)\s+/, '');
        items.push(
          `<li style="margin-bottom: 8px; line-height: 1.8;">${formatInlineMarkdown(itemContent)}</li>`,
        );
        i++;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      bodyBlocks.push(
        `<${tag} style="margin: 0 0 20px; padding-left: 24px; color: #334155; font-size: 15px;">${items.join('')}</${tag}>`,
      );
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trimStart().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('\u0000CODEBLOCK_')
    ) {
      paraLines.push(formatInlineMarkdown(lines[i].trim()));
      i++;
    }
    if (paraLines.length > 0) {
      bodyBlocks.push(
        `<p style="font-size: 15px; color: #334155; line-height: 1.85; margin: 0 0 16px; text-align: justify; word-break: break-word; letter-spacing: 0.5px;">${paraLines.join('<br />')}</p>`,
      );
    }
  }

  // Cover image header
  const coverHtml = article.coverUrl
    ? `<section style="margin-bottom: 24px; text-align: center;"><img src="${escapeHtml(article.coverUrl)}" style="max-width: 100%; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); display: block; margin: 0 auto;" /></section>`
    : '';

  // Header card
  const headerCard = `
<section style="background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; padding: 24px 20px; margin-bottom: 28px; color: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
  <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; line-height: 1.4; color: #ffffff; letter-spacing: 0.5px;">${escapeHtml(title)}</h1>
  <div style="font-size: 13px; color: #94a3b8; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
    <span style="font-weight: 600; color: #cbd5e1;">${escapeHtml(authorName)}</span>
    <span>·</span>
    <span>${escapeHtml(dateStr)}</span>
    <span>·</span>
    <span style="background-color: rgba(59, 130, 246, 0.25); color: #60a5fa; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">LongPost 深度长文</span>
  </div>
</section>`;

  // Footer card
  const footerCard = `
<section style="margin-top: 40px; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 13px; color: #64748b; line-height: 1.6; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
  <p style="margin: 0 0 6px 0; font-weight: 600; color: #1e293b; font-size: 14px;">✨ 本文由 LongPost 深度长文创作平台排版生成</p>
  ${
    url
      ? `<p style="margin: 0; color: #64748b; font-size: 12px;">阅读原文参与互动或订阅作者：<a href="${escapeHtml(url)}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(url)}</a></p>`
      : ''
  }
</section>`;

  // Wrap all in outer section with clean typography defaults
  return `<section style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; font-size: 15px; line-height: 1.85; color: #334155; word-wrap: break-word;">${headerCard}${coverHtml}${bodyBlocks.join('\n')}${footerCard}</section>`;
}

/**
 * 复制为微信公众号富文本排版格式到系统剪贴板。
 * 微信公众号后台（mp.weixin.qq.com）粘贴时依赖内联 CSS 样式，
 * 此函数写入包含 inline CSS 的 text/html，粘贴即成文。
 */
export async function copyWeChatFormatted(article: WeChatArticleData): Promise<boolean> {
  const wechatHtml = buildWeChatHtml(article);
  const plainText = `${article.title}\n\n${article.content}\n\n来源：${article.url || 'LongPost'}`;

  // 1. 优先尝试现代剪贴板 API (text/html + text/plain)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const htmlBlob = new Blob([wechatHtml], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
      toast.success('微信公众号格式已复制！在公众号编辑器直接粘贴即可');
      return true;
    } catch (err) {
      logger.warn('navigator.clipboard.write 写入富文本失败，切换至 DOM 降级方案:', err);
    }
  }

  // 2. 降级方案：创建隐藏 contentEditable 容器并通过 execCommand('copy') 复制富文本
  try {
    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.innerHTML = wechatHtml;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(container);
      selection.addRange(range);
      const successful = document.execCommand('copy');
      selection.removeAllRanges();
      document.body.removeChild(container);

      if (successful) {
        toast.success('微信公众号格式已复制！在公众号编辑器直接粘贴即可');
        return true;
      }
    } else {
      document.body.removeChild(container);
    }
  } catch (domErr) {
    logger.error('DOM 复制富文本失败:', domErr);
  }

  // 3. 兜底回退：纯文本复制
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plainText);
      toast.info('富文本未受浏览器完全授权，已复制纯文本格式');
      return true;
    } catch {
      // Ignore
    }
  }

  toast.error('复制失败，请检查浏览器剪贴板权限');
  return false;
}
