import { platform } from '@/lib/platform';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

export interface PagedPdfOptions {
  title: string;
  contentHtml: string;
  author?: string;
  abstractText?: string;
  keywords?: string[];
  date?: string;
}

/**
 * 出版与学术论文级打印 CSS
 */
export const ACADEMIC_PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 20mm 18mm 22mm 18mm;
  @bottom-right {
    content: counter(page);
    font-size: 9pt;
    color: #64748b;
  }
}

@media print {
  html, body {
    background: #ffffff !important;
    color: #0f172a !important;
    font-size: 10.5pt;
    line-height: 1.65;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Noto Serif CJK SC", serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* 防止标题孤行与被切断 */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid !important;
    break-after: avoid !important;
    color: #0f172a !important;
    font-weight: 700;
  }

  h1 {
    font-size: 20pt;
    margin-top: 0;
    margin-bottom: 12pt;
    text-align: center;
    line-height: 1.3;
  }

  h2 {
    font-size: 14pt;
    margin-top: 18pt;
    margin-bottom: 8pt;
    border-bottom: 0.5pt solid #cbd5e1;
    padding-bottom: 3pt;
  }

  h3 {
    font-size: 12pt;
    margin-top: 14pt;
    margin-bottom: 6pt;
  }

  /* 核心防跨页切断规则 */
  pre, code, table, blockquote, figure, .echarts-for-react, .chart-container, .math-display {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  p {
    margin: 6pt 0;
    orphans: 3;
    widows: 3;
    text-align: justify;
  }

  blockquote {
    border-left: 3pt solid #3b82f6 !important;
    padding: 4pt 10pt !important;
    margin: 8pt 0 !important;
    background-color: #f8fafc !important;
    color: #475569 !important;
  }

  pre {
    background-color: #f8fafc !important;
    border: 0.5pt solid #e2e8f0 !important;
    border-radius: 4pt;
    padding: 8pt;
    font-family: "JetBrains Mono", Consolas, Menlo, monospace !important;
    font-size: 9pt;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-all;
  }

  code {
    font-family: "JetBrains Mono", Consolas, Menlo, monospace !important;
    font-size: 9pt;
    background-color: #f1f5f9 !important;
    padding: 1pt 3pt;
    border-radius: 2pt;
  }

  pre code {
    background: transparent !important;
    padding: 0;
  }

  table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin: 10pt 0 !important;
    font-size: 9.5pt;
  }

  th, td {
    border: 0.5pt solid #94a3b8 !important;
    padding: 4pt 8pt !important;
  }

  th {
    background-color: #f1f5f9 !important;
    font-weight: 600;
  }

  img {
    max-width: 95% !important;
    height: auto !important;
    display: block;
    margin: 10pt auto;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  a {
    color: #0f172a !important;
    text-decoration: none;
  }

  /* 打印时隐藏 UI 界面元素 */
  .no-print, header, nav, footer, .sidebar, .toolbar, button {
    display: none !important;
  }
}
`;

/**
 * 组装学术 PDF 独立渲染 HTML 模板
 */
export function buildAcademicPdfHtml(options: PagedPdfOptions): string {
  const { title, contentHtml, author = 'LongPost Author', date = new Date().toLocaleDateString('zh-CN') } = options;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    ${ACADEMIC_PRINT_CSS}
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
    }
    .paper-header {
      text-align: center;
      margin-bottom: 24pt;
      padding-bottom: 12pt;
      border-bottom: 1pt solid #e2e8f0;
    }
    .paper-title {
      font-size: 22pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8pt;
    }
    .paper-meta {
      font-size: 10pt;
      color: #64748b;
      margin-top: 6pt;
    }
    .paper-content {
      font-size: 10.5pt;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="paper-header">
    <div class="paper-title">${title}</div>
    <div class="paper-meta">
      <span>作者：${author}</span>
      <span> · </span>
      <span>日期：${date}</span>
      <span> · </span>
      <span>排版引擎：LongPost Paged PDF</span>
    </div>
  </div>
  <div class="paper-content">
    ${contentHtml}
  </div>
</body>
</html>`;
}

/**
 * 跨端分流学术 PDF 导出
 */
export async function exportAcademicPdf(options: PagedPdfOptions): Promise<{ success: boolean; filePath?: string }> {
  const fullHtml = buildAcademicPdfHtml(options);

  // 1. Electron 桌面端：走主进程 webContents.printToPDF 原生渲染
  if (platform.isDesktop) {
    try {
      const res = await platform.exportPdf({
        title: options.title,
        html: fullHtml,
        options: {
          pageSize: 'A4',
          printBackground: true,
        },
      });
      if (res.success) {
        toast.success(`学术 PDF 已成功保存至本地！${res.filePath ? `(${res.filePath})` : ''}`);
        return res;
      }
    } catch (err) {
      logger.error('桌面端 PDF 导出失败，退化为浏览器打印', err);
    }
  }

  // 2. Web 浏览器端：创建专用静默打印 Iframe + window.print()
  if (typeof window !== 'undefined') {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.srcdoc = fullHtml;

      iframe.onload = () => {
        try {
          setTimeout(() => {
            if (iframe.contentWindow) {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
              resolve({ success: true });
            }
          }, 300);
        } catch (err) {
          logger.error('唤起浏览器打印异常', err);
          // 降级为直接当前窗口打印
          window.print();
          resolve({ success: true });
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 3000);
        }
      };

      document.body.appendChild(iframe);
    });
  }

  return { success: false };
}
