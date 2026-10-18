export interface HeadingNode {
  id: string;
  level: number;
  title: string;
  startLine: number;
  endLine: number;
  charStart: number;
  charEnd: number;
  hiddenCharCount: number;
  isFolded: boolean;
}

/**
 * 解析 Markdown 文本中的 H1~H6 标题层级与章节范围
 * 严格排除 Fenced 代码块 (```) 内部包含的假标题
 */
export function parseHeadingSections(
  markdown: string,
  foldedIds: Set<string> = new Set(),
): HeadingNode[] {
  if (!markdown) return [];

  const lines = markdown.split(/\r?\n/);
  const headings: Array<{
    id: string;
    level: number;
    title: string;
    startLine: number;
    charStart: number;
  }> = [];

  let inCodeBlock = false;
  let charCounter = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // 检查 Fenced 代码块边界
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      charCounter += line.length + 1;
      continue;
    }

    if (!inCodeBlock) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const title = match[2].trim();
        const id = `heading-${lineIdx}-${level}`;
        headings.push({
          id,
          level,
          title,
          startLine: lineIdx,
          charStart: charCounter,
        });
      }
    }

    charCounter += line.length + 1;
  }

  // 计算每个章节的折叠区间 (直到下一个同级或更高优先级的标题)
  const sections: HeadingNode[] = [];
  const totalLines = lines.length;

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    let endLine = totalLines - 1;

    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= current.level) {
        endLine = headings[j].startLine - 1;
        break;
      }
    }

    // 计算被折叠区间内的文字数量
    let sectionChars = 0;
    for (let l = current.startLine + 1; l <= endLine; l++) {
      sectionChars += (lines[l] || '').length;
    }

    const nextCharStart =
      i + 1 < headings.length ? headings[i + 1].charStart : markdown.length;

    sections.push({
      id: current.id,
      level: current.level,
      title: current.title,
      startLine: current.startLine,
      endLine,
      charStart: current.charStart,
      charEnd: nextCharStart,
      hiddenCharCount: Math.max(0, sectionChars),
      isFolded: foldedIds.has(current.id),
    });
  }

  return sections;
}

/**
 * 依据折叠状态，生成带折叠胶囊标签的内容视图
 */
export function computeFoldedDisplayLines(
  markdown: string,
  foldedIds: Set<string>,
): {
  displayLines: string[];
  foldCapsules: Record<number, { headingId: string; hiddenCount: number }>;
} {
  const lines = markdown.split(/\r?\n/);
  const sections = parseHeadingSections(markdown, foldedIds);
  const hiddenLineIndices = new Set<number>();
  const foldCapsules: Record<number, { headingId: string; hiddenCount: number }> = {};

  for (const sec of sections) {
    if (sec.isFolded && sec.endLine > sec.startLine) {
      for (let l = sec.startLine + 1; l <= sec.endLine; l++) {
        hiddenLineIndices.add(l);
      }
      foldCapsules[sec.startLine] = {
        headingId: sec.id,
        hiddenCount: sec.hiddenCharCount,
      };
    }
  }

  const displayLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!hiddenLineIndices.has(i)) {
      displayLines.push(lines[i]);
    }
  }

  return { displayLines, foldCapsules };
}
