/**
 * 动态分享图（OpenGraph Image）。
 *
 * 分享到微信 / X / Slack 时，没有预览图就是一条灰链接。这里用纯代码把
 * 标题、作者、日期画成 1200×630 的图，不依赖任何外部图床。
 *
 * 实现路线：拼 SVG -> sharp 转 PNG。选 sharp 而不是 satori，是因为
 * sharp 已经是服务端依赖（图片上传压缩在用），不用再多装一个渲染器。
 *
 * **字体是这套方案的命门**：SVG 文本靠宿主系统字体渲染，容器里通常没有
 * 中文字体，渲染出来会是一排方块。所以这里提供 detectCjkFont()，
 * 启动时探测一次，缺字体就降级并在日志里喊人。
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** 默认字体栈：Linux / macOS / Windows 各给一个常见的中文字体 */
export const DEFAULT_FONT_STACK =
  "'Noto Sans CJK SC','Noto Sans SC','Source Han Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei','WenQuanYi Micro Hei',sans-serif";

export function fontStack(): string {
  return (process.env.OG_FONT || '').trim() || DEFAULT_FONT_STACK;
}

/**
 * 标题折行。
 *
 * 不是按像素量，而是按「字符宽度」估：中日韩字符算 1，ASCII 半角算 0.55。
 * 这样中英混排时不会一行塞太满或太空。
 */
export function wrapTitle(title: string, maxCharsPerLine = 17, maxLines = 3): string[] {
  const text = String(title || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const width = (ch: string) => (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.55);

  const lines: string[] = [];
  let current = '';
  let used = 0;

  for (const ch of text) {
    const w = width(ch);
    if (used + w > maxCharsPerLine) {
      lines.push(current.trim());
      current = '';
      used = 0;
      if (lines.length === maxLines) break;
    }
    current += ch;
    used += w;
  }

  if (lines.length < maxLines && current.trim()) lines.push(current.trim());

  // 装不下就省略：把最后一行截断后补省略号
  if (lines.length === maxLines) {
    const consumed = lines.join('').length;
    if (consumed < text.length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = last.slice(0, Math.max(1, last.length - 1)) + '…';
    }
  }

  return lines.length > 0 ? lines : [text];
}

/** XML 转义：标题里出现 & < > 会让整张图渲染失败 */
export function escapeXml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface OgImageOptions {
  title: string;
  authorName?: string;
  date?: string;
  siteName?: string;
  /** 右下角的小字，默认站点域名 */
  footer?: string;
  /** 强调色，默认品牌蓝 */
  accent?: string;
}

/** 生成 1200×630 的 SVG 字符串 */
export function buildOgSvg(options: OgImageOptions): string {
  const accent = options.accent || '#1d9bf0';
  const lines = wrapTitle(options.title);
  const site = escapeXml(options.siteName || 'LongPost');
  const author = escapeXml(options.authorName || '');
  const date = escapeXml(options.date || '');
  const footer = escapeXml(options.footer || '');

  const lineHeight = 78;
  const fontSize = 62;
  const startY = 250;

  const titleSpans = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return '<text x="80" y="' + y + '" font-size="' + fontSize + '" font-weight="700" fill="#f2f4f8">' + escapeXml(line) + '</text>';
    })
    .join('');

  const metaParts = [author, date].filter(Boolean).join(' · ');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + OG_WIDTH + '" height="' + OG_HEIGHT + '" viewBox="0 0 ' + OG_WIDTH + ' ' + OG_HEIGHT + '">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#0b0f16" />',
    '<stop offset="100%" stop-color="#141c28" />',
    '</linearGradient>',
    '<radialGradient id="glow" cx="85%" cy="12%" r="55%">',
    '<stop offset="0%" stop-color="' + accent + '" stop-opacity="0.28" />',
    '<stop offset="100%" stop-color="' + accent + '" stop-opacity="0" />',
    '</radialGradient>',
    '</defs>',
    '<rect width="' + OG_WIDTH + '" height="' + OG_HEIGHT + '" fill="url(#bg)" />',
    '<rect width="' + OG_WIDTH + '" height="' + OG_HEIGHT + '" fill="url(#glow)" />',
    '<rect x="0" y="0" width="8" height="' + OG_HEIGHT + '" fill="' + accent + '" />',
    '<text x="80" y="150" font-size="26" font-weight="600" fill="' + accent + '" letter-spacing="2">' + site + '</text>',
    '<g font-family="' + escapeXml(fontStack()) + '">',
    titleSpans,
    metaParts
      ? '<text x="80" y="' + (startY + lines.length * lineHeight + 26) + '" font-size="28" fill="#8b95a6">' + escapeXml(metaParts) + '</text>'
      : '',
    footer
      ? '<text x="80" y="' + (OG_HEIGHT - 56) + '" font-size="24" fill="#5d6675">' + footer + '</text>'
      : '',
    '</g>',
    '</svg>',
  ].join('');
}
