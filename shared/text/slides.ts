/**
 * Marp 风格幻灯片切分
 *
 * 把 Markdown 按独立一行的 `---` / `***` 切页，并严格排除：
 * 1. 文档顶部 YAML Frontmatter；
 * 2. Fenced 代码块内部的 `---`。
 *
 * 从 SlidePresenterModal 抽到 shared/ 的原因：纯字符串逻辑，
 * 留在组件里测试只能照抄一份，抽出来才能被单测直接覆盖。
 */

/**
 * 将当前 Markdown 文档按独立行的 `\n---\n` 或 `\n***\n` 切分为多页幻灯片
 * 特别防护：
 * 1. 严格排除文档顶部的 YAML Frontmatter（`---\n...\n---`）；
 * 2. 严格排除代码块 ``` 内部的 `---` 分隔符，杜绝误切分。
 */
export function splitSlides(markdown: string): string[] {
  if (!markdown || !markdown.trim()) {
    return ['# 演示文稿\n\n暂无内容'];
  }

  // 1. 剔除文档顶部的 YAML Frontmatter（若存在）
  const cleanMarkdown = markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '');

  // 优先尝试 Markdown-it 15 词法分析器按顶层 hr (level === 0) 切分
  if (typeof window !== 'undefined' && (window as any).markdownit) {
    try {
      const md = (window as any).markdownit();
      const tokens = md.parse(cleanMarkdown, {});
      const hrLines: number[] = [];
      for (const token of tokens) {
        if (token.type === 'hr' && token.level === 0 && token.map && token.map[0] !== undefined) {
          hrLines.push(token.map[0]);
        }
      }
      if (hrLines.length > 0) {
        const lines = cleanMarkdown.split(/\r?\n/);
        const result: string[] = [];
        let prevLine = 0;
        for (const lineIdx of hrLines) {
          const slideText = lines.slice(prevLine, lineIdx).join('\n').trim();
          if (slideText) result.push(slideText);
          prevLine = lineIdx + 1;
        }
        const lastSlide = lines.slice(prevLine).join('\n').trim();
        if (lastSlide) result.push(lastSlide);
        if (result.length > 0) return result;
      }
    } catch {
      // 降级为语法树掩码切分
    }
  }

  // 2. 隐藏 Fenced 代码块，防止代码块内的 --- 破坏切片
  const codeBlocks: string[] = [];
  const textWithoutCode = cleanMarkdown.replace(/```[^\n]*\r?\n[\s\S]*?\r?\n```/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `\n\u0000SLIDE_CODEBLOCK_${idx}\u0000\n`;
  });

  // 3. 按照独立一行的 --- 或 *** 切分
  const rawSegments = textWithoutCode.split(/\r?\n\s*(?:---|(?:\*\*\*))\s*\r?\n/);

  // 4. 还原各页内的代码块
  const slides = rawSegments
    .map((seg) => {
      const restored = seg.replace(
        /\u0000SLIDE_CODEBLOCK_(\d+)\u0000/g,
        (_, idx) => codeBlocks[Number(idx)] || '',
      );
      return restored.trim();
    })
    .filter((s) => s.length > 0);

  return slides.length > 0 ? slides : [cleanMarkdown.trim() || '# 演示文稿'];
}
