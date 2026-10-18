export interface RenderOptions {
  width?: number;
  pageHeight?: number;
  padding?: number;
  baseFontSize?: number;
  lineHeight?: number;
  textColor?: string;
  themeColor?: string;
  backgroundColor?: string;
}

export interface TextLine {
  text: string;
  isBold?: boolean;
  fontSize: number;
  isQuote?: boolean;
  isDivider?: boolean;
}

export interface RenderedPage {
  pageIndex: number;
  totalPage: number;
  canvas?: any;
  dataUrl?: string;
}

// 行首禁则标点：严禁出现在换行后的行首
export const KINSOKU_START = /^[，。！？、；：）》】”’,.!?;:)\]}]/;

/**
 * 智能分词器：英文单词与连续数字作为一个整体 Token，汉字或其它字符作为单字 Token
 */
export function tokenizeText(text: string): string[] {
  const tokens: string[] = [];
  // 匹配连续的英文字符与数字、连续空白、中文字符或任意单个字符
  const regex = /([a-zA-Z0-9]+(?:'[a-zA-Z]+)?|\s+|[\u4e00-\u9fa5]|.)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0]) tokens.push(match[0]);
  }
  return tokens;
}

/**
 * 智能换行与避头尾处理 (Kinsoku Shori)
 */
export function wrapTokens(
  tokens: string[],
  maxLineWidth: number,
  measureWidth: (str: string) => number
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const candidate = currentLine + token;
    const width = measureWidth(candidate);

    if (width <= maxLineWidth || !currentLine) {
      currentLine = candidate;
    } else {
      // 当前行已满，需换行
      // 检查下一个 token（即即将放入新行行首的字符）是否命中行首禁则标点
      if (KINSOKU_START.test(token)) {
        // 避头尾规则：将禁则标点追加到上一行行末（悬挂标点）
        currentLine += token;
        lines.push(currentLine);
        currentLine = '';
      } else {
        lines.push(currentLine);
        currentLine = token.trimStart();
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * 解析 Markdown 段落块类型
 */
export interface MarkdownBlock {
  type: 'h1' | 'h2' | 'quote' | 'divider' | 'paragraph';
  content: string;
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const rawLines = text.split('\n');
  const blocks: MarkdownBlock[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', content: trimmed.replace(/^#\s+/, '') });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', content: trimmed.replace(/^##\s+/, '') });
    } else if (trimmed.startsWith('>')) {
      blocks.push({ type: 'quote', content: trimmed.replace(/^>\s*/, '') });
    } else if (/^---+$|^===+$/.test(trimmed)) {
      blocks.push({ type: 'divider', content: '' });
    } else {
      // 去除内联 **加粗** 星号标记并保留文字
      const cleanText = trimmed.replace(/\*\*(.*?)\*\*/g, '$1');
      blocks.push({ type: 'paragraph', content: cleanText });
    }
  }

  return blocks;
}

/**
 * Canvas 排版渲染核心引擎
 */
export class CanvasRenderer {
  private width: number;
  private pageHeight: number;
  private padding: number;
  private baseFontSize: number;
  private lineHeight: number;
  private textColor: string;
  private themeColor: string;
  private backgroundColor: string;

  constructor(options: RenderOptions = {}) {
    this.width = options.width || 800;
    this.pageHeight = options.pageHeight || 1200;
    this.padding = options.padding || 40;
    this.baseFontSize = options.baseFontSize || 16;
    this.lineHeight = options.lineHeight || 1.6;
    this.textColor = options.textColor || '#1e293b';
    this.themeColor = options.themeColor || '#2563eb';
    this.backgroundColor = options.backgroundColor || '#ffffff';
  }

  /**
   * 将 Markdown 文本进行分页计算与排版绘制
   */
  layout(markdown: string): { pagesCount: number; linesByPage: TextLine[][] } {
    const blocks = parseMarkdownBlocks(markdown);
    const contentWidth = this.width - this.padding * 2;
    const contentHeight = this.pageHeight - this.padding * 2;

    const linesByPage: TextLine[][] = [[]];
    let currentPageIndex = 0;
    let currentY = 0;

    // 简单字符宽度估算函数（英文字符与标点 0.55em，中文字符 1.0em）
    const getMeasureWidth = (fontSize: number) => (str: string) => {
      let w = 0;
      for (const ch of str) {
        w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55;
      }
      return w;
    };

    for (const block of blocks) {
      if (block.type === 'divider') {
        const dividerHeight = 30;
        if (currentY + dividerHeight > contentHeight && linesByPage[currentPageIndex].length > 0) {
          linesByPage.push([]);
          currentPageIndex++;
          currentY = 0;
        }
        linesByPage[currentPageIndex].push({
          text: '',
          fontSize: this.baseFontSize,
          isDivider: true,
        });
        currentY += dividerHeight;
        continue;
      }

      let fontSize = this.baseFontSize;
      let isBold = false;
      let isQuote = false;
      let topMargin = 8;
      let bottomMargin = 8;

      if (block.type === 'h1') {
        fontSize = Math.round(this.baseFontSize * 1.35);
        isBold = true;
        topMargin = 20;
        bottomMargin = 12;
      } else if (block.type === 'h2') {
        fontSize = Math.round(this.baseFontSize * 1.18);
        isBold = true;
        topMargin = 14;
        bottomMargin = 8;
      } else if (block.type === 'quote') {
        isQuote = true;
        topMargin = 10;
        bottomMargin = 10;
      }

      const availableWidth = isQuote ? contentWidth - 24 : contentWidth;
      const tokens = tokenizeText(block.content);
      const wrapped = wrapTokens(tokens, availableWidth, getMeasureWidth(fontSize));
      const lineStep = Math.round(fontSize * this.lineHeight);

      // 段前留白
      currentY += topMargin;

      for (const lineText of wrapped) {
        if (currentY + lineStep > contentHeight && linesByPage[currentPageIndex].length > 0) {
          linesByPage.push([]);
          currentPageIndex++;
          currentY = 0;
        }

        linesByPage[currentPageIndex].push({
          text: lineText,
          fontSize,
          isBold,
          isQuote,
        });
        currentY += lineStep;
      }

      // 段后留白
      currentY += bottomMargin;
    }

    return {
      pagesCount: linesByPage.length,
      linesByPage,
    };
  }

  /**
   * 在 HTML Canvas 上渲染指定页面的文字与视觉元素
   */
  renderPageToCanvas(pageLines: TextLine[], canvas: HTMLCanvasElement): void {
    canvas.width = this.width;
    canvas.height = this.pageHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘制背景
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, this.width, this.pageHeight);

    let y = this.padding + 10;
    const leftX = this.padding;

    for (const item of pageLines) {
      if (item.isDivider) {
        y += 15;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(this.width - this.padding, y);
        ctx.stroke();
        y += 15;
        continue;
      }

      const lineStep = Math.round(item.fontSize * this.lineHeight);
      let textX = leftX;

      if (item.isQuote) {
        // 绘制 3px 主题色竖线
        ctx.fillStyle = this.themeColor;
        ctx.fillRect(leftX, y - item.fontSize + 4, 3, lineStep);
        textX += 16;
        ctx.fillStyle = '#64748b';
      } else {
        ctx.fillStyle = this.textColor;
      }

      ctx.font = `${item.isBold ? 'bold ' : ''}${item.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.text, textX, y);

      y += lineStep;
    }
  }
}
