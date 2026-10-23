/**
 * Markdown → .docx（Word）。
 *
 * 目标不是「完美还原」，而是交稿能用：
 *   · #/##/### 映射到 Word 的「标题 1/2/3」样式 —— 这样 Word 能自动生成目录；
 *   · 正文段落、加粗/斜体/行内代码、无序与有序列表、引用、代码块；
 *   · 中文字体优先（宋体正文 / 黑体标题），行距 1.5。
 *
 * 不支持的语法（表格、图片、脚注）保守降级为纯文本，不报错 ——
 * 导出失败比丢格式更糟。
 */
'use strict';

const { zipStore } = require('./zip.js');

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 行内解析：**粗**、*斜*、反引号代码 */
function inlineRuns(text) {
  const runs = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) runs.push(plainRun(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith('**')) runs.push(styledRun(token.slice(2, -2), { bold: true }));
    else if (token.charAt(0) === '`') runs.push(codeRun(token.slice(1, -1)));
    else runs.push(styledRun(token.slice(1, -1), { italic: true }));
    last = match.index + token.length;
  }
  if (last < text.length) runs.push(plainRun(text.slice(last)));
  return runs.length ? runs.join('') : plainRun('');
}

function plainRun(text) {
  return '<w:r><w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}

function styledRun(text, options) {
  const opts = options || {};
  const props = (opts.bold ? '<w:b/>' : '') + (opts.italic ? '<w:i/>' : '');
  return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}

function codeRun(text) {
  return (
    '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F1F3F4"/></w:rPr>' +
    '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>'
  );
}

function paragraph(content, styleId) {
  const pPr = styleId ? '<w:pPr><w:pStyle w:val="' + styleId + '"/></w:pPr>' : '';
  return '<w:p>' + pPr + content + '</w:p>';
}

/**
 * @param {string} markdown
 * @returns {{ xml: string, title: string }}
 */
function markdownToDocumentXml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let codeBuffer = [];
  let firstHeading = '';

  const flushCode = () => {
    if (codeBuffer.length === 0) return;
    for (const codeLine of codeBuffer) {
      out.push(
        '<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>' +
          '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr>' +
          '<w:t xml:space="preserve">' + escapeXml(codeLine || ' ') + '</w:t></w:r></w:p>',
      );
    }
    codeBuffer = [];
  };

  const bt = String.fromCharCode(96); // `
  const fence = new RegExp('^' + bt + bt + bt);

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (fence.test(line)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(raw);
      continue;
    }
    if (line.trim() === '') continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      const text = heading[2].trim();
      if (!firstHeading && level === 1) firstHeading = text;
      out.push(paragraph(inlineRuns(text), 'Heading' + level));
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      out.push(paragraph(inlineRuns(quote[1]), 'Quote'));
      continue;
    }

    const task = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (task) {
      const mark = task[1].toLowerCase() === 'x' ? '[x] ' : '[ ] ';
      out.push(paragraph(inlineRuns(mark + task[2]), 'ListBullet'));
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      out.push(paragraph(inlineRuns(bullet[1]), 'ListBullet'));
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      out.push(paragraph(inlineRuns(ordered[1]), 'ListNumber'));
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="DADCE0"/></w:pBdr></w:pPr></w:p>');
      continue;
    }

    out.push(paragraph(inlineRuns(line), null));
  }
  if (inCode) flushCode();

  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + out.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';

  return { xml: xml, title: firstHeading };
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const DOC_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

function headingStyle(id, name, size, opts) {
  const options = opts || {};
  return (
    '<w:style w:type="paragraph" w:styleId="' + id + '">' +
    '<w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="' + (options.level || 0) + '"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="黑体" w:hAnsi="Calibri"/><w:b/>' +
    '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr></w:style>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Calibri" w:eastAsia="宋体" w:hAnsi="Calibri" w:cs="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>' +
  '</w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  headingStyle('Heading1', 'heading 1', 44, { level: 0 }) +
  headingStyle('Heading2', 'heading 2', 36, { level: 1 }) +
  headingStyle('Heading3', 'heading 3', 30, { level: 2 }) +
  headingStyle('Heading4', 'heading 4', 26, { level: 3 }) +
  headingStyle('Heading5', 'heading 5', 24, { level: 4 }) +
  headingStyle('Heading6', 'heading 6', 22, { level: 5 }) +
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="DADCE0"/></w:pBdr></w:pPr>' +
  '<w:rPr><w:i/><w:color w:val="5F6368"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:ind w:left="567" w:hanging="284"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:ind w:left="567" w:hanging="284"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:shd w:val="clear" w:fill="F8F9FA"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>' +
  '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>' +
  '</w:styles>';

/**
 * @param {{ title?: string, markdown: string }} input
 * @returns {Buffer}
 */
function buildDocx(input) {
  const data = input || {};
  const parsed = markdownToDocumentXml(data.markdown || '');
  const finalTitle = String(data.title || parsed.title || '未命名').trim();

  const coreProps =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>' + escapeXml(finalTitle) + '</dc:title><dc:creator>LongPost</dc:creator>' +
    '</cp:coreProperties>';

  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: coreProps },
    { name: 'word/document.xml', data: parsed.xml },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
  ]);
}

module.exports = { buildDocx, markdownToDocumentXml, escapeXml };
