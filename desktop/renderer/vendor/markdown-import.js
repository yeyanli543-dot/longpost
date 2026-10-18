/**
 * Markdown 文件夹导入（Obsidian / Logseq / 任意 .md 目录）。
 *
 * 迁移是「敢不敢搬进来」的前提：不能要求用户一篇篇复制粘贴。
 *
 * 这里只做纯逻辑 —— 解析 frontmatter、推导标题、识别重复、生成待写入的文档。
 * 文件读取与落库分别在主进程和渲染层，方便单测。
 */

'use strict';

(function () {

/**
 * 极简 YAML frontmatter 解析。
 *
 * 刻意不引入 yaml 库：Obsidian 笔记里 99% 的 frontmatter 只有
 * key: value、数组 [- a] 或 [a, b]、以及带引号的字符串。
 * 为剩下的 1% 背一个解析器不划算，认不出来就当普通文本。
 */
function parseFrontmatter(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, content: text };

  const data = {};
  let lastKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && lastKey) {
      const value = stripQuotes(listItem[1].trim());
      if (!Array.isArray(data[lastKey])) data[lastKey] = [];
      data[lastKey].push(value);
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!pair) continue;

    const key = pair[1];
    const rawValue = pair[2].trim();
    lastKey = key;

    if (!rawValue) {
      data[key] = [];
      continue;
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      data[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
      continue;
    }

    data[key] = stripQuotes(rawValue);
  }

  return { data, content: text.slice(match[0].length) };
}

function stripQuotes(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

/** 从正文里取第一个一级标题 */
function firstHeading(content) {
  const match = String(content || '').match(/^\s*#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

/** 去掉正文开头的一级标题（它会变成文章标题，留着会重复） */
function stripLeadingHeading(content, title) {
  const text = String(content || '');
  if (!title) return text.trim();
  const pattern = new RegExp('^\\s*#\\s+' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\r?\\n+');
  return text.replace(pattern, '').trim();
}

/** 把 frontmatter 里的标签规范化成字符串数组 */
function normalizeTags(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[,，\s]+/);
  return list
    .map((tag) => String(tag).replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** 把 "2026-10-18" / "2026-10-18 12:00" 解析成 ISO 字符串；失败返回 null */
function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 把一份 Markdown 转成可写入的文档。
 *
 * @param {{ relativePath: string, text: string, fallbackTime?: number }} input
 */
function toDocument(input) {
  const relativePath = String((input && input.relativePath) || '');
  const raw = String((input && input.text) || '');
  const { data, content } = parseFrontmatter(raw);

  const heading = firstHeading(content);
  const baseName = relativePath.split(/[\\/]/).pop().replace(/\.md$/i, '');
  const title =
    (typeof data.title === 'string' && data.title.trim()) ||
    heading ||
    baseName ||
    '未命名';

  const tags = normalizeTags(data.tags || data.tag);
  const createdAt = parseDate(data.date || data.created || data.createdAt);

  // 目录也当标签用：Blog/技术/a.md -> 技术
  const dirs = relativePath.split(/[\\/]/).slice(0, -1).filter(Boolean);
  const dirTag = dirs.length > 0 ? dirs[dirs.length - 1] : '';
  if (dirTag && !tags.includes(dirTag)) tags.unshift(dirTag);

  return {
    title,
    content: stripLeadingHeading(content, heading),
    tags: tags.slice(0, 12),
    createdAt,
    sourcePath: relativePath,
  };
}

/**
 * 导入计划：把文件列表分成「要导入」和「跳过」。
 *
 * 跳过规则（按严重程度）：
 *   - 空文件
 *   - 标题已存在（默认不覆盖，迁移场景下覆盖是最危险的动作）
 */
function planImport(files, existingTitles) {
  const existing = new Set(
    (existingTitles || []).map((title) => String(title || '').trim().toLowerCase()),
  );

  const docs = [];
  const skipped = [];
  const seen = new Set();

  for (const file of files || []) {
    const doc = toDocument(file);
    const key = doc.title.toLowerCase();

    if (!doc.content.trim()) {
      skipped.push({ title: doc.title, path: doc.sourcePath, reason: 'empty' });
      continue;
    }
    if (existing.has(key)) {
      skipped.push({ title: doc.title, path: doc.sourcePath, reason: 'exists' });
      continue;
    }
    if (seen.has(key)) {
      skipped.push({ title: doc.title, path: doc.sourcePath, reason: 'duplicate-in-import' });
      continue;
    }

    seen.add(key);
    docs.push(doc);
  }

  return { docs, skipped };
}

const API = {
  parseFrontmatter,
  firstHeading,
  stripLeadingHeading,
  normalizeTags,
  parseDate,
  toDocument,
  planImport,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.LPMarkdownImport = API;
})();
