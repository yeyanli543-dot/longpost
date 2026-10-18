import { logger } from '@/lib/logger';

// ============================================================================
// 1. 纯 TypeScript 零依赖 ZIP 归档引擎（符合 PKWare ZIP / EPUB 3.0 规范）
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * 纯算法高效计算 CRC-32 校验和
 */
export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  path: string;
  data: Uint8Array;
  uncompressedSize: number;
  compressedSize: number;
  crc32: number;
  method: number; // 0 = STORE, 8 = DEFLATE
  offset: number;
  modTime: number;
  modDate: number;
}

/**
 * 原生 CompressionStream 压缩器（带 STORE 优雅降级）
 */
async function compressDeflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') {
    return null;
  }
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(data as unknown as BufferSource);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch (err) {
    logger.warn('CompressionStream("deflate-raw") 执行异常，将自动降级为 STORE 存储模式', err);
    return null;
  }
}

/**
 * 纯 TypeScript 零依赖 ZIP 打包器
 */
export class ZipArchive {
  private entries: ZipEntry[] = [];
  private encoder = new TextEncoder();

  /**
   * 添加文件至归档
   * @param path 归档内的相对路径
   * @param content 文本或二进制数据
   * @param options compress: true 尝试使用 deflate 压缩；false 强制 STORE（EPUB mimetype 必须为 false）
   */
  async addFile(
    path: string,
    content: string | Uint8Array,
    options: { compress?: boolean } = { compress: true },
  ): Promise<void> {
    const rawBytes = typeof content === 'string' ? this.encoder.encode(content) : content;
    const crc = computeCrc32(rawBytes);
    const uncompressedSize = rawBytes.length;

    let finalData = rawBytes;
    let method = 0; // STORE

    // mimetype 必须强制 STORE
    if (options.compress && path !== 'mimetype') {
      const compressed = await compressDeflateRaw(rawBytes);
      if (compressed && compressed.length < uncompressedSize) {
        finalData = compressed;
        method = 8; // DEFLATE
      }
    }

    const now = new Date();
    const time =
      ((now.getHours() & 0x1f) << 11) |
      ((now.getMinutes() & 0x3f) << 5) |
      ((now.getSeconds() >> 1) & 0x1f);
    const date =
      (((now.getFullYear() - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0x0f) << 5) |
      (now.getDate() & 0x1f);

    this.entries.push({
      path,
      data: finalData,
      uncompressedSize,
      compressedSize: finalData.length,
      crc32: crc,
      method,
      offset: 0,
      modTime: time,
      modDate: date,
    });
  }

  /**
   * 生成最终符合 PKWare 标准的二进制 ZIP Blob
   */
  build(mimeType = 'application/zip'): Blob {
    let currentOffset = 0;
    const localChunks: Uint8Array[] = [];

    // 1. 写入 Local File Headers & File Data
    for (const entry of this.entries) {
      entry.offset = currentOffset;
      const pathBytes = this.encoder.encode(entry.path);

      // Local File Header 固定 30 字节
      const header = new Uint8Array(30 + pathBytes.length);
      const view = new DataView(header.buffer);

      view.setUint32(0, 0x04034b50, true); // Local header signature
      view.setUint16(4, 20, true); // Version needed to extract (2.0)
      view.setUint16(6, 0x0800, true); // Flags: UTF-8 encoding
      view.setUint16(8, entry.method, true); // Method (0 or 8)
      view.setUint16(10, entry.modTime, true);
      view.setUint16(12, entry.modDate, true);
      view.setUint32(14, entry.crc32, true);
      view.setUint32(18, entry.compressedSize, true);
      view.setUint32(22, entry.uncompressedSize, true);
      view.setUint16(26, pathBytes.length, true);
      view.setUint16(28, 0, true); // Extra field length

      header.set(pathBytes, 30);

      localChunks.push(header);
      localChunks.push(entry.data);
      currentOffset += header.length + entry.data.length;
    }

    const centralDirOffset = currentOffset;
    const centralChunks: Uint8Array[] = [];

    // 2. 写入 Central Directory Headers
    for (const entry of this.entries) {
      const pathBytes = this.encoder.encode(entry.path);
      // Central Directory Header 固定 46 字节
      const cdir = new Uint8Array(46 + pathBytes.length);
      const view = new DataView(cdir.buffer);

      view.setUint32(0, 0x02014b50, true); // Central directory signature
      view.setUint16(4, 0x0314, true); // Version made by (UNIX 2.0)
      view.setUint16(6, 20, true); // Version needed to extract
      view.setUint16(8, 0x0800, true); // Flags: UTF-8
      view.setUint16(10, entry.method, true);
      view.setUint16(12, entry.modTime, true);
      view.setUint16(14, entry.modDate, true);
      view.setUint32(16, entry.crc32, true);
      view.setUint32(20, entry.compressedSize, true);
      view.setUint32(24, entry.uncompressedSize, true);
      view.setUint16(28, pathBytes.length, true);
      view.setUint16(30, 0, true); // Extra field length
      view.setUint16(32, 0, true); // Comment length
      view.setUint16(34, 0, true); // Disk start
      view.setUint16(36, 0, true); // Internal attributes
      view.setUint32(40, 0x81a40000, true); // External attributes (regular file 0644)
      view.setUint32(42, entry.offset, true); // Local header relative offset

      cdir.set(pathBytes, 46);
      centralChunks.push(cdir);
      currentOffset += cdir.length;
    }

    const centralDirSize = currentOffset - centralDirOffset;

    // 3. 写入 End of Central Directory Record (EOCD, 固定 22 字节)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
    eocdView.setUint16(4, 0, true); // Disk number
    eocdView.setUint16(6, 0, true); // Central dir disk
    eocdView.setUint16(8, this.entries.length, true); // Entries on this disk
    eocdView.setUint16(10, this.entries.length, true); // Total entries
    eocdView.setUint32(12, centralDirSize, true); // Central dir size
    eocdView.setUint32(16, centralDirOffset, true); // Offset of central dir
    eocdView.setUint16(20, 0, true); // Comment length

    return new Blob([...localChunks, ...centralChunks, eocd] as unknown as BlobPart[], { type: mimeType });
  }
}

// ============================================================================
// 2. XHTML 1.1 闭合清洗机（满足 IDPF EPUB 3.0 严苛 XML 格式）
// ============================================================================

/**
 * 将常规 HTML 字符串清洗为严格闭合的 XML/XHTML 1.1
 * 1. 自闭合空标签 (<img/>, <br/>, <hr/>, <input/>)
 * 2. 转义孤立的 & 字符为 &amp;
 * 3. 移除非法 XML 控制字符
 */
export function sanitizeToXHtml(html: string): string {
  if (!html) return '';

  let sanitized = html
    // 移除 XML 1.0 非法字符 (除 \t, \n, \r 之外的 ASCII 0-31 控制符)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 闭合未闭合的 void elements
    .replace(/<img\b([^>]*?)(?<!\/)>/gi, '<img$1 />')
    .replace(/<br\b([^>]*?)(?<!\/)>/gi, '<br$1 />')
    .replace(/<hr\b([^>]*?)(?<!\/)>/gi, '<hr$1 />')
    .replace(/<input\b([^>]*?)(?<!\/)>/gi, '<input$1 />')
    .replace(/<meta\b([^>]*?)(?<!\/)>/gi, '<meta$1 />')
    .replace(/<link\b([^>]*?)(?<!\/)>/gi, '<link$1 />');

  // 转义裸露的 & 字符（排除合法的实体如 &amp;, &lt;, &gt;, &quot;, &#1234; 等）
  sanitized = sanitized.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  return sanitized;
}

// ============================================================================
// 3. EPUB 3.0 电子书打包构筑器
// ============================================================================

export interface EpubMetadata {
  title: string;
  author?: string;
  publisher?: string;
  description?: string;
  language?: string;
  identifier?: string;
  pubDate?: string;
}

export interface EpubBuildOptions {
  metadata: EpubMetadata;
  contentHtml: string;
  /** 可选内嵌样式，不传则使用出版级经典书本排版样式 */
  customCss?: string;
}

const DEFAULT_EPUB_CSS = `
@charset "utf-8";
body {
  margin: 5% 8%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  line-height: 1.8;
  color: #2c3e50;
  text-align: justify;
}
h1, h2, h3, h4, h5, h6 {
  font-family: inherit;
  font-weight: 600;
  color: #1a202c;
  margin-top: 1.6em;
  margin-bottom: 0.8em;
  line-height: 1.35;
  page-break-after: avoid;
  break-after: avoid;
}
h1 { font-size: 1.85em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
p {
  margin: 0.9em 0;
  text-indent: 0;
}
blockquote {
  margin: 1.2em 0;
  padding: 0.6em 1.2em;
  border-left: 4px solid #3b82f6;
  background-color: #f8fafc;
  color: #475569;
  font-style: normal;
  page-break-inside: avoid;
  break-inside: avoid;
}
code {
  font-family: "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  padding: 0.2em 0.4em;
  background-color: #f1f5f9;
  border-radius: 4px;
}
pre {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
  font-size: 0.85em;
  line-height: 1.5;
  page-break-inside: avoid;
  break-inside: avoid;
}
pre code {
  padding: 0;
  background: transparent;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5em 0;
  page-break-inside: avoid;
  break-inside: avoid;
}
th, td {
  border: 1px solid #cbd5e1;
  padding: 8px 12px;
  text-align: left;
}
th {
  background-color: #f1f5f9;
  font-weight: 600;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  page-break-inside: avoid;
  break-inside: avoid;
}
.chart-container, .echarts-for-react {
  page-break-inside: avoid;
  break-inside: avoid;
}
`;

/**
 * 将页面中已渲染的 ECharts 实例或 Canvas 转换为 DataURL 静态图片
 */
export function snapshotEChartsInstances(): Record<string, string> {
  const chartSnapshots: Record<string, string> = {};
  if (typeof document === 'undefined') return chartSnapshots;

  try {
    const chartDoms = document.querySelectorAll<HTMLDivElement>('.echarts-for-react, [_echarts_instance_]');
    chartDoms.forEach((dom, index) => {
      const canvas = dom.querySelector<HTMLCanvasElement>('canvas');
      if (canvas) {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const id = dom.getAttribute('data-chart-id') || `chart_${index + 1}`;
          chartSnapshots[id] = dataUrl;
        } catch {
          // ignore tainted canvas
        }
      }
    });
  } catch (err) {
    logger.warn('抓取 ECharts 静态截图时异常', err);
  }

  return chartSnapshots;
}

/**
 * 核心：构建出版级标准 IDPF EPUB 3.0 文档
 */
export async function buildEpub(options: EpubBuildOptions): Promise<Blob> {
  const zip = new ZipArchive();
  const title = options.metadata.title || 'LongPost Document';
  const author = options.metadata.author || 'LongPost Author';
  const publisher = options.metadata.publisher || 'LongPost Studio';
  const language = options.metadata.language || 'zh-CN';
  const identifier = options.metadata.identifier || `urn:uuid:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // 1. 规范要求：第一个写入的文件必须是 mimetype，且必须为 STORE 无压缩
  await zip.addFile('mimetype', 'application/epub+zip', { compress: false });

  // 2. 写入 META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  await zip.addFile('META-INF/container.xml', containerXml, { compress: true });

  // 3. 写入 OEBPS/style.css
  const cssContent = options.customCss || DEFAULT_EPUB_CSS;
  await zip.addFile('OEBPS/style.css', cssContent, { compress: true });

  // 4. 清洗正文 XHTML
  let cleanHtml = options.contentHtml || '<p>暂无内容</p>';

  // 处理内嵌 base64 图片，提取为单独文件以保持 EPUB 最佳兼容性
  const manifestItems: Array<{ id: string; href: string; mediaType: string; properties?: string }> = [
    { id: 'style', href: 'style.css', mediaType: 'text/css' },
    { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: 'nav' },
    { id: 'chapter1', href: 'chapter1.xhtml', mediaType: 'application/xhtml+xml' },
  ];

  let imageCounter = 0;
  // 匹配并抽取 data:image/...;base64,... 图片
  cleanHtml = cleanHtml.replace(
    /<img\s+([^>]*?)src=["']data:image\/(png|jpeg|jpg|webp|gif);base64,([a-zA-Z0-9+/=]+)["']([^>]*?)\/?>/gi,
    (_match, prefix, ext, base64Data, suffix) => {
      imageCounter++;
      const fileExt = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
      const fileName = `images/img_${imageCounter}.${fileExt}`;
      const imgId = `img_${imageCounter}`;
      const mediaType = `image/${ext.toLowerCase()}`;

      try {
        const binStr = atob(base64Data);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        zip.addFile(`OEBPS/${fileName}`, bytes, { compress: true });
        manifestItems.push({ id: imgId, href: fileName, mediaType });
        return `<img ${prefix}src="${fileName}"${suffix} />`;
      } catch {
        return `<img ${prefix}src="data:image/${ext};base64,${base64Data}"${suffix} />`;
      }
    },
  );

  const xhtmlBody = sanitizeToXHtml(cleanHtml);

  // 5. 写入 OEBPS/chapter1.xhtml
  const chapter1Xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
  <head>
    <title>${title}</title>
    <meta charset="utf-8"/>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      <div class="article-content">
        ${xhtmlBody}
      </div>
    </article>
  </body>
</html>`;
  await zip.addFile('OEBPS/chapter1.xhtml', chapter1Xhtml, { compress: true });

  // 6. 写入 OEBPS/nav.xhtml（EPUB 3 官方标准导航目录）
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}">
  <head>
    <title>目录 - ${title}</title>
    <meta charset="utf-8"/>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>目录</h1>
      <ol>
        <li><a href="chapter1.xhtml">${title}</a></li>
      </ol>
    </nav>
  </body>
</html>`;
  await zip.addFile('OEBPS/nav.xhtml', navXhtml, { compress: true });

  // 7. 写入 OEBPS/content.opf
  const manifestXml = manifestItems
    .map(
      (item) =>
        `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${
          item.properties ? ` properties="${item.properties}"` : ''
        }/>`,
    )
    .join('\n');

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>${language}</dc:language>
    <dc:creator>${author}</dc:creator>
    <dc:publisher>${publisher}</dc:publisher>
    <meta property="dcterms:modified">${nowIso}</meta>
  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`;
  await zip.addFile('OEBPS/content.opf', contentOpf, { compress: true });

  // 8. 导出标准 application/epub+zip 二进制 Blob
  return zip.build('application/epub+zip');
}

/**
 * 触发浏览器端 EPUB 3.0 文件下载
 */
export function downloadEpubFile(blob: Blob, fileName: string): void {
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_') || 'document';
  const finalName = safeName.endsWith('.epub') ? safeName : `${safeName}.epub`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
