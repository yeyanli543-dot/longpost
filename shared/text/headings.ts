/**
 * Markdown 标题大纲提取（H1~H4）
 *
 * 用于编辑器的 outline 抽屉：给出标题层级、行号与字符偏移，点击即可跳转。
 * 关键点：必须跳过 Fenced 代码块内部的 `# 注释`，否则文档大纲会被代码里的井号污染。
 */

export interface HeadingItem {
  id: string;
  level: number;
  /** 标题文字（不含 # 前缀） */
  text: string;
  /** 0 基行号 */
  lineIndex: number;
  /** 该行起始字符在全文中的偏移，用于编辑器定位 */
  charIndex: number;
}

export function extractHeadings(markdown: string): HeadingItem[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const headings: HeadingItem[] = [];
  let charCounter = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      charCounter += line.length + 1;
      continue;
    }

    if (!inCodeBlock) {
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        headings.push({
          id: `heading-${i}-${charCounter}`,
          level: match[1].length,
          text: match[2].trim(),
          lineIndex: i,
          charIndex: charCounter,
        });
      }
    }

    charCounter += line.length + 1;
  }

  return headings;
}
