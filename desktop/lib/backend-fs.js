'use strict';

/**
 * 仓库层的「磁盘后端」。
 *
 * 只做最原始的几件事：读/写 JSON、把文件收进 files/、列文件、读文件内容。
 * 「文章怎么排序、回收站怎么算」这类规则不在这里，全在 lib/repo.js —— 那样
 * 手机端的 IndexedDB 后端只要实现同样的这几个动作，两边行为就自动一致。
 *
 * 写入一律「先写临时文件再 rename」，避免中途崩掉留下半个文件。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_SETTINGS = {
  theme: 'dark',
  lastArticleId: '',
  showPreview: true,
  sidebarWidth: 280,
  sort: 'updated',
  readingMode: false,
  fontSize: 16,
};

function createFsBackend() {
  let BASE = null;

  function setBase(dir) {
    BASE = dir;
    fs.mkdirSync(BASE, { recursive: true });
    fs.mkdirSync(filesDir(), { recursive: true });
    if (!fs.existsSync(articlesFile())) writeJson(articlesFile(), []);
    if (!fs.existsSync(settingsFile())) writeJson(settingsFile(), { ...DEFAULT_SETTINGS });
  }

  function assertReady() {
    if (!BASE) throw new Error('数据目录尚未初始化');
  }

  function dataDir() {
    assertReady();
    return BASE;
  }

  function filesDir() {
    assertReady();
    return path.join(BASE, 'files');
  }

  function articlesFile() {
    return path.join(dataDir(), 'articles.json');
  }

  function settingsFile() {
    return path.join(dataDir(), 'settings.json');
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

  return {
    setBase,
    dataDir,
    filesDir,

    readArticles() {
      const arr = readJson(articlesFile(), []);
      return Array.isArray(arr) ? arr : [];
    },
    writeArticles(list) {
      writeJson(articlesFile(), list);
    },

    readSettings() {
      return readJson(settingsFile(), {});
    },
    writeSettings(obj) {
      writeJson(settingsFile(), obj);
    },

    /** ref 是磁盘上的绝对路径：拷进 files/，返回渲染层要用的那份元信息。 */
    importFile(absPath) {
      const stat = fs.statSync(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
      const stored = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
      fs.copyFileSync(absPath, path.join(filesDir(), stored));
      return {
        name: path.basename(absPath),
        stored,
        size: stat.size,
        isImage: isImageExt(safeExt),
        url: `lp://files/${stored}`,
      };
    },

    listFiles() {
      const dir = filesDir();
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => !f.startsWith('.'))
        .map((f) => {
          let size = 0;
          try {
            size = fs.statSync(path.join(dir, f)).size;
          } catch {
            size = 0;
          }
          return { stored: f, size, isImage: isImageExt(path.extname(f).toLowerCase()), url: `lp://files/${f}` };
        })
        .sort((a, b) => a.stored.localeCompare(b.stored));
    },

    readFileBlob(stored) {
      const abs = path.join(filesDir(), stored);
      if (!fs.existsSync(abs)) return null;
      return fs.readFileSync(abs);
    },

    deleteFile(stored) {
      try {
        const abs = path.join(filesDir(), stored);
        if (!fs.existsSync(abs)) return false;
        fs.unlinkSync(abs);
        return true;
      } catch {
        return false;
      }
    },

    fileSize(stored) {
      try {
        return fs.statSync(path.join(filesDir(), stored)).size;
      } catch {
        return 0;
      }
    },
  };
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg']);
function isImageExt(ext) {
  return IMAGE_EXTS.has(String(ext || '').toLowerCase());
}

module.exports = { createFsBackend, DEFAULT_SETTINGS, isImageExt };
