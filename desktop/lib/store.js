'use strict';

/**
 * 本地存储层。
 *
 * 目录结构（全部在 app.getPath('userData')/data 下）：
 *   articles.json   所有文章
 *   settings.json   界面设置
 *   files/          附件与图片（按导入顺序，不自动清理）
 *
 * 写入一律「先写临时文件再 rename」，避免中途崩掉留下半个文件。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let BASE = null;

function init(userDataDir) {
  BASE = path.join(userDataDir, 'data');
  fs.mkdirSync(BASE, { recursive: true });
  fs.mkdirSync(path.join(BASE, 'files'), { recursive: true });
  if (!fs.existsSync(articlesFile())) writeJson(articlesFile(), []);
  if (!fs.existsSync(settingsFile())) writeJson(settingsFile(), defaultSettings());
}

function dataDir() {
  if (!BASE) throw new Error('store.init() 尚未调用');
  return BASE;
}
function filesDir() {
  return path.join(dataDir(), 'files');
}
function articlesFile() {
  return path.join(dataDir(), 'articles.json');
}
function settingsFile() {
  return path.join(dataDir(), 'settings.json');
}

function defaultSettings() {
  return {
    theme: 'dark',
    lastArticleId: '',
    showPreview: true,
    sidebarWidth: 280,
  };
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function newId() {
  return `a${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

/** 从正文里抽一段纯文本做摘要（去掉图表围栏与 Markdown 记号）。 */
function makeSummary(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// ---------------------------------------------------------------------------
// 文章
// ---------------------------------------------------------------------------

function readAll() {
  const arr = readJson(articlesFile(), []);
  return Array.isArray(arr) ? arr : [];
}

function listArticles() {
  return readAll()
    .map((a) => ({
      id: a.id,
      title: a.title || '未命名',
      summary: a.summary || '',
      tags: Array.isArray(a.tags) ? a.tags : [],
      chars: String(a.content || '').length,
      charts: (String(a.content || '').match(/^```chart\s*$/gm) || []).length,
      searchText: (String(a.title || '') + ' ' + String(a.content || ''))
        .slice(0, 4000)
        .toLowerCase(),
      createdAt: a.createdAt || 0,
      updatedAt: a.updatedAt || 0,
    }))
    .sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
}

function getArticle(id) {
  const found = readAll().find((a) => a.id === id);
  if (!found) return null;
  return {
    ...found,
    title: found.title || '未命名',
    content: found.content || '',
    tags: Array.isArray(found.tags) ? found.tags : [],
  };
}

function saveArticle(payload) {
  const list = readAll();
  const now = Date.now();
  const input = payload || {};
  const title = String(input.title || '').trim() || '未命名';
  const content = String(input.content == null ? '' : input.content);
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    : [];

  let index = input.id ? list.findIndex((a) => a.id === input.id) : -1;
  if (index === -1) {
    const article = {
      id: newId(),
      title,
      content,
      tags,
      summary: makeSummary(content),
      createdAt: now,
      updatedAt: now,
    };
    list.unshift(article);
    writeJson(articlesFile(), list);
    return { ...article };
  }

  const prev = list[index];
  const next = {
    ...prev,
    title,
    content,
    tags,
    summary: makeSummary(content),
    updatedAt: now,
  };
  list[index] = next;
  writeJson(articlesFile(), list);
  return { ...next, content: next.content };
}

function deleteArticle(id) {
  const list = readAll();
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) return { ok: false, error: '文章不存在' };
  writeJson(articlesFile(), next);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 附件
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);

/** 生成只含小写字母数字的安全文件名，避免路径与大小写问题。 */
function storedName(originalPath) {
  const rawExt = path.extname(originalPath).toLowerCase();
  const ext = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : '';
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

function importFile(absPath) {
  const stat = fs.statSync(absPath);
  const stored = storedName(absPath);
  const dest = path.join(filesDir(), stored);
  fs.copyFileSync(absPath, dest);
  const ext = path.extname(stored).toLowerCase();
  return {
    name: path.basename(absPath),
    stored,
    size: stat.size,
    isImage: IMAGE_EXTS.has(ext),
    url: `lp://files/${stored}`,
  };
}

function listFiles() {
  const dir = filesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .map((f) => {
      const abs = path.join(dir, f);
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        size = 0;
      }
      return { stored: f, size, url: `lp://files/${f}` };
    })
    .sort((a, b) => a.stored.localeCompare(b.stored));
}

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------

function getSettings() {
  const saved = readJson(settingsFile(), {});
  return { ...defaultSettings(), ...(saved && typeof saved === 'object' ? saved : {}) };
}

function setSettings(patch) {
  const next = { ...getSettings(), ...(patch || {}) };
  writeJson(settingsFile(), next);
  return next;
}

module.exports = {
  init,
  dataDir,
  filesDir,
  listArticles,
  getArticle,
  saveArticle,
  deleteArticle,
  importFile,
  listFiles,
  getSettings,
  setSettings,
};
