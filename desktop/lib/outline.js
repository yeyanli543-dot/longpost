/**
 * 从 Markdown 正文里抽标题，做成阅读目录。
 *
 * 单独放一个文件、不去动 lib/markdown.js，是因为渲染器那边已经稳定在跑了，
 * 目录只是个只读的旁路分析：扫一遍 `# 标题` 这种行，跳过代码块里面的内容。
 *
 * 双模加载：Node require，浏览器里挂 window.LPOutline。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LPOutline = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_LEVEL = 4;

  /** ATX 标题：# 到 ####，允许行尾跟一堆 # 号收尾。 */
  const HEADING_RE = /^(#{1,4})\s+(.+?)\s*#*\s*$/;

  function stripInline(text) {
    return String(text || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/~~([^~]*)~~/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @returns [{level, text, line, id}]
   *   id 只是「第几个标题」的序号，稳定、不用做中文 slug —— 目录点击时按序号定位，
   *   不依赖 h1/h2 在页面上的 id（预览区是动态重渲染的，id 会变）。
   */
  function extractHeadings(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const out = [];
    let inFence = false;
    let fenceMark = '';

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];

      const fence = /^\s*(```|~~~)/.exec(line);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceMark = fence[1];
        } else if (fence[1] === fenceMark) {
          inFence = false;
          fenceMark = '';
        }
        continue;
      }
      if (inFence) continue;

      const m = HEADING_RE.exec(line);
      if (!m) continue;
      const text = stripInline(m[2]);
      if (!text) continue;
      out.push({ level: m[1].length, text: text, line: i, id: 'h' + out.length });
    }
    return out;
  }

  /** 目录里只显示到第几级：正文只有一两个标题时没必要撑出层级感。 */
  function effectiveLevels(headings) {
    if (!headings.length) return 0;
    const used = {};
    for (const h of headings) used[h.level] = true;
    for (let l = 1; l <= MAX_LEVEL; l += 1) {
      const deeper = Object.keys(used).filter((k) => Number(k) > l).length;
      if (!deeper) return l;
    }
    return MAX_LEVEL;
  }

  function buildToc(markdown) {
    const headings = extractHeadings(markdown);
    const deepest = effectiveLevels(headings);
    return {
      headings: headings,
      deepest: deepest,
      /** 去掉比 deepest 更深的那几级，避免目录里出现孤零零的一个四级标题 */
      items: headings.filter((h) => h.level <= deepest),
    };
  }

  return { extractHeadings, buildToc, effectiveLevels, stripInline };
});
