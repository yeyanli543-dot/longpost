/**
 * Markdown 表格解析与序列化（纯逻辑）
 *
 * 从 TableGridEditor.tsx 抽出：这些函数不依赖 React，但留在组件文件里
 * 测试无法直接 import（Node 不解析 .tsx），只能抄一份到测试用例，等于没测。
 */

export type TableAlignment = 'left' | 'center' | 'right';

export interface ParsedTableData {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
  startIndex?: number;
  endIndex?: number;
}

/**
 * 支持转义竖线 \| 与行内代码反引号保护的表格行切分器
 */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  let content = trimmed;
  if (content.startsWith('|')) content = content.slice(1);
  if (content.endsWith('|')) content = content.slice(0, -1);

  const cells: string[] = [];
  let currentCell = '';
  let inCode = false;
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (isEscaped) {
      currentCell += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      currentCell += char;
      isEscaped = true;
      continue;
    }

    if (char === '`') {
      inCode = !inCode;
      currentCell += char;
      continue;
    }

    if (char === '|' && !inCode) {
      cells.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  cells.push(currentCell.trim());
  return cells;
}

/**
 * 将 Markdown 表格解析为二维数组与对齐状态
 */
export function parseMarkdownTable(md: string): ParsedTableData {
  const lines = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));

  if (lines.length < 2) {
    // 默认生成 3列 x 2行 的初始表格
    return {
      headers: ['标题 1', '标题 2', '标题 3'],
      alignments: ['left', 'center', 'left'],
      rows: [
        ['数据 1', '数据 2', '数据 3'],
        ['数据 4', '数据 5', '数据 6'],
      ],
    };
  }

  // 1. 解析表头（受转义竖线与代码块反引号保护）
  const rawHeaders = splitTableRow(lines[0]);

  // 2. 解析对齐行
  const rawAlignments = splitTableRow(lines[1]);

  const alignments: TableAlignment[] = rawAlignments.map((a) => {
    const leftColon = a.startsWith(':');
    const rightColon = a.endsWith(':');
    if (leftColon && rightColon) return 'center';
    if (rightColon) return 'right';
    return 'left';
  });

  // 3. 解析数据行（受转义竖线与代码块反引号保护）
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitTableRow(lines[i]);
    // 补齐列数
    while (cells.length < rawHeaders.length) {
      cells.push('');
    }
    rows.push(cells.slice(0, rawHeaders.length));
  }

  // 补齐对齐列
  while (alignments.length < rawHeaders.length) {
    alignments.push('left');
  }

  return {
    headers: rawHeaders,
    alignments,
    rows: rows.length > 0 ? rows : [['', '', '']],
  };
}

/**
 * 将二维数据数组序列化为标准美观对齐的 Markdown 表格
 */
export function serializeMarkdownTable(data: ParsedTableData): string {
  const { headers, alignments, rows } = data;
  const colCount = headers.length;

  // 计算每列的最大显示宽度（最小宽度 4 字符）
  const colWidths = new Array(colCount).fill(4);
  for (let c = 0; c < colCount; c++) {
    colWidths[c] = Math.max(colWidths[c], (headers[c] || '').length);
    for (const r of rows) {
      colWidths[c] = Math.max(colWidths[c], (r[c] || '').length);
    }
  }

  // 生成 Header 行
  const headerLine =
    '| ' +
    headers.map((h, i) => (h || '').padEnd(colWidths[i])).join(' | ') +
    ' |';

  // 生成对齐分隔行
  const alignLine =
    '| ' +
    alignments
      .map((align, i) => {
        const w = colWidths[i];
        if (align === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
        if (align === 'right') return '-'.repeat(Math.max(1, w - 1)) + ':';
        return ':' + '-'.repeat(Math.max(1, w - 1));
      })
      .join(' | ') +
    ' |';

  // 生成各数据行
  const rowLines = rows.map((row) => {
    return (
      '| ' +
      headers
        .map((_, i) => (row[i] || '').padEnd(colWidths[i]))
        .join(' | ') +
      ' |'
    );
  });

  return [headerLine, alignLine, ...rowLines].join('\n') + '\n\n';
}
