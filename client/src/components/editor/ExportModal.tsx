import React, { useState } from 'react';
import {
  FileText,
  FileCode,
  Image as ImageIcon,
  Printer,
  Download,
  X,
  Check,
  Sparkles,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExportModalProps {
  title: string;
  content: string;
  isOpen: boolean;
  onClose: () => void;
  onExportLongImage?: () => void;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('data:image/')
  ) {
    return escapeHtml(trimmed);
  }
  return '#';
}

function formatInlineMarkdown(raw: string): string {
  const inlineCodes: string[] = [];
  const textWithPlaceholders = raw.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000INLINECODE_${idx}\u0000`;
  });

  let html = escapeHtml(textWithPlaceholders);

  // Images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
    const safeUrl = sanitizeHref(url);
    return `<img src="${safeUrl}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:12px 0;" />`;
  });

  // Links: [label](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    const safeUrl = sanitizeHref(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Highlights: ==text==
  html = html.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  // Bold + Italic: ***text***
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Strikethrough: ~~text~~
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Restore inline code
  html = html.replace(/\u0000INLINECODE_(\d+)\u0000/g, (_, idx: string) => inlineCodes[Number(idx)] ?? '');
  return html;
}

function markdownToSafeHtml(markdown: string): string {
  const codeBlocks: string[] = [];
  const withoutFencedCode = markdown.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang: string, code: string) => {
    const idx = codeBlocks.length;
    const safeLang = escapeHtml(lang.trim());
    const langAttr = safeLang ? ` class="language-${safeLang}"` : '';
    codeBlocks.push(`<pre><code${langAttr}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n\u0000CODEBLOCK_${idx}\u0000\n`;
  });

  const lines = withoutFencedCode.split(/\r?\n/);
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const codeMatch = trimmed.match(/^\u0000CODEBLOCK_(\d+)\u0000$/);
    if (codeMatch) {
      blocks.push(codeBlocks[Number(codeMatch[1])] ?? '');
      i++;
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push('<hr />');
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${formatInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        const cleaned = lines[i].trimStart().replace(/^>\s?/, '');
        if (!/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(cleaned)) {
          quoteLines.push(formatInlineMarkdown(cleaned));
        } else {
          const calloutType = cleaned.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)?.[1]?.toUpperCase() || 'NOTE';
          quoteLines.push(`<strong>[${calloutType}]</strong>`);
        }
        i++;
      }
      blocks.push(`<blockquote>${quoteLines.join('<br />')}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*+]\s+/, '');
        items.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\u0000CODEBLOCK_\d+\u0000$/.test(lines[i].trim()) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(formatInlineMarkdown(lines[i]));
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${paraLines.join('<br />')}</p>`);
    }
  }

  return blocks.join('\n');
}

export const ExportModal: React.FC<ExportModalProps> = ({
  title,
  content,
  isOpen,
  onClose,
  onExportLongImage,
}) => {
  const [exporting, setExporting] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1. 导出为标准 Markdown 文件
  const handleExportMarkdown = () => {
    try {
      const fileName = `${(title || '未命名长文').replace(/[\/\\:*?"<>|]/g, '_')}.md`;
      const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: "${new Date().toISOString()}"
generator: "LongPost"
---

`;
      const fullText = `${frontmatter}${content}`;
      const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('已导出 Markdown 文件');
      onClose();
    } catch (e: any) {
      toast.error('导出 Markdown 失败: ' + e?.message);
    }
  };

  // 2. 导出为独立无损单文件 HTML
  const handleExportStandaloneHtml = () => {
    setExporting('html');
    try {
      const fileName = `${(title || '未命名长文').replace(/[\/\\:*?"<>|]/g, '_')}.html`;
      const safeDocTitle = escapeHtml(title || 'LongPost 文章');
      const safeHeadingTitle = escapeHtml(title || '无标题文章');
      const renderedContentHtml = markdownToSafeHtml(content);

      const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeDocTitle}</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12141c;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --border: #1e2230;
      --primary: #38bdf8;
    }
    body {
      margin: 0;
      padding: 40px 20px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      line-height: 1.8;
      display: flex;
      justify-content: center;
    }
    .article-container {
      max-width: 800px;
      width: 100%;
    }
    h1.title {
      font-size: 2.4rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 24px;
      line-height: 1.25;
      color: #fff;
    }
    .meta {
      display: flex;
      gap: 12px;
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .content {
      font-size: 1.05rem;
      word-break: break-word;
    }
    .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
      color: #fff;
      margin-top: 1.6em;
      margin-bottom: 0.6em;
      line-height: 1.35;
    }
    .content p {
      margin: 1em 0;
    }
    .content ul, .content ol {
      margin: 1em 0;
      padding-left: 1.6em;
    }
    .content li {
      margin: 0.35em 0;
    }
    .content a {
      color: var(--primary);
      text-decoration: underline;
    }
    .content code {
      background: var(--card-bg);
      padding: 0.15em 0.4em;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
    }
    .content pre code {
      background: transparent;
      padding: 0;
    }
    .content mark {
      background: rgba(250, 204, 21, 0.25);
      color: #fef08a;
      padding: 0.1em 0.3em;
      border-radius: 4px;
    }
    .content hr {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 2em 0;
    }
    pre {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 12px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9rem;
    }
    blockquote {
      border-left: 4px solid var(--primary);
      margin: 20px 0;
      padding-left: 16px;
      color: var(--text-muted);
      background: rgba(56, 189, 248, 0.05);
      border-radius: 0 8px 8px 0;
      padding: 12px 16px;
    }
    footer {
      margin-top: 60px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <article class="article-container">
    <h1 class="title">${safeHeadingTitle}</h1>
    <div class="meta">
      <span>发布于 LongPost</span>
      <span>·</span>
      <span>${new Date().toLocaleDateString('zh-CN')}</span>
    </div>
    <div class="content">${renderedContentHtml}</div>
    <footer>
      本文档由 LongPost 独立全功能工作台生成 · 纯本地自包含离线页面
    </footer>
  </article>
</body>
</html>`;

      const blob = new Blob([htmlTemplate], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('已导出独立单文件 HTML 网页');
      onClose();
    } catch (e: any) {
      toast.error('导出 HTML 失败: ' + e?.message);
    } finally {
      setExporting(null);
    }
  };

  // 3. 打印 / PDF 导出
  const handlePrint = () => {
    window.print();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-popover/95 p-6 shadow-2xl backdrop-blur-xl animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground leading-none">多维格式导出</h3>
            <p className="text-xs text-muted-foreground mt-1">无需外部服务，纯本地极速生成</p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {/* 单文件 HTML */}
          <button
            onClick={handleExportStandaloneHtml}
            className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-left transition-all group"
          >
            <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-500 group-hover:scale-105 transition-transform">
              <Globe className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">独立单文件 HTML 网页</div>
              <div className="text-xs text-muted-foreground">内置精美样式，任何设备离线直接双击打开</div>
            </div>
          </button>

          {/* Markdown 文件 */}
          <button
            onClick={handleExportMarkdown}
            className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-left transition-all group"
          >
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:scale-105 transition-transform">
              <FileCode className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">标准 Markdown (.md)</div>
              <div className="text-xs text-muted-foreground">含 Frontmatter 元数据，兼容 Obsidian/Notion</div>
            </div>
          </button>

          {/* 高清长图 */}
          {onExportLongImage && (
            <button
              onClick={() => {
                onExportLongImage();
                onClose();
              }}
              className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-left transition-all group"
            >
              <div className="p-2.5 rounded-lg bg-violet-500/10 text-violet-500 group-hover:scale-105 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">生成分享长图 (.png)</div>
                <div className="text-xs text-muted-foreground">超清渲染排版，适合手机长图传播</div>
              </div>
            </button>
          )}

          {/* 打印 / PDF */}
          <button
            onClick={handlePrint}
            className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-left transition-all group"
          >
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 group-hover:scale-105 transition-transform">
              <Printer className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">打印 / 另存为 PDF</div>
              <div className="text-xs text-muted-foreground">调用系统无损排版打印机生成 PDF 电子书</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
