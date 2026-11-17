import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createRepo } = require('../desktop/lib/repo.js');
const { createFsBackend } = require('../desktop/lib/backend-fs.js');

function memoryBackend() {
  let articles = [];
  let settings = {};
  let files = [];
  const clone = (value) => structuredClone(value);
  return {
    async readArticles() { return clone(articles); },
    async writeArticles(value) { await new Promise((resolve) => setTimeout(resolve, 2)); articles = clone(value); },
    async readSettings() { return clone(settings); },
    async writeSettings(value) { await new Promise((resolve) => setTimeout(resolve, 2)); settings = clone(value); },
    async listFiles() { return clone(files); },
    setFiles(value) { files = clone(value); },
  };
}

describe('本地文章库的数据保护', () => {
  it('并发新建文章和更新设置不会丢失彼此的写入', async () => {
    const repo = createRepo(memoryBackend());
    await Promise.all(Array.from({ length: 25 }, (_, i) => repo.saveArticle({ title: '文章 ' + i, content: '正文' })));
    const list = await repo.listArticles();
    assert.equal(list.length, 25);
    assert.equal(new Set(list.map((item) => item.id)).size, 25);
    await Promise.all([repo.setSettings({ theme: 'light' }), repo.setSettings({ fontSize: 20 })]);
    const settings = await repo.getSettings();
    assert.equal(settings.theme, 'light');
    assert.equal(settings.fontSize, 20);
  });

  it('空间切换后不能读取、覆盖或删除另一空间的文章和建议', async () => {
    const repo = createRepo(memoryBackend());
    await repo.setSettings({ authUser: { spaceKey: 'code:ONE' } });
    const article = await repo.saveArticle({ title: '秘密', content: '正文' });
    await repo.saveProposals(article.id, [{ text: '建议' }]);
    await repo.setSettings({ authUser: { spaceKey: 'code:TWO' } });
    assert.equal(await repo.getArticle(article.id), null);
    assert.deepEqual(await repo.listArticles({ spaceKey: 'code:ONE' }), []);
    assert.deepEqual(await repo.getProposals(article.id), []);
    assert.deepEqual(await repo.saveProposals(article.id, [{ text: '篡改' }]), []);
    assert.equal((await repo.purgeArticle(article.id)).ok, false);
    await assert.rejects(repo.saveArticle({ id: article.id, title: '篡改' }), /当前空间/);
    await assert.rejects(repo.saveArticle({ id: article.id, spaceKey: 'code:ONE' }), /当前空间/);
    // 队列在失败后仍可继续处理后续请求。
    await repo.setSettings({ authUser: { spaceKey: 'code:ONE' } });
    assert.equal((await repo.getArticle(article.id)).title, '秘密');
    assert.equal((await repo.getProposals(article.id))[0].text, '建议');
  });

  it('附件仍被历史版本引用，或存在无法检查的私密空间时，不判为孤儿', async () => {
    const backend = memoryBackend();
    const repo = createRepo(backend);
    backend.setFiles([{ stored: 'old.png' }, { stored: 'unused.png' }]);
    const item = await repo.saveArticle({ title: '文章', content: '![图](lp://files/old.png)' });
    await repo.saveArticle({ id: item.id, title: '文章', content: '新正文' });
    assert.deepEqual((await repo.listOrphanFiles()).map((f) => f.stored), ['unused.png']);
    await repo.setSettings({ authUser: { spaceKey: 'code:PRIVATE' } });
    await repo.saveArticle({ title: '私密', content: '![图](lp://files/unused.png)' });
    assert.deepEqual(await repo.listOrphanFiles(), []);
    await repo.setSettings({ authUser: null });
    assert.deepEqual(await repo.listOrphanFiles(), []);
  });

  it('损坏或格式错误的磁盘文章库不会被空数据覆盖', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-data-'));
    try {
      const backend = createFsBackend();
      backend.setBase(dir);
      const file = path.join(dir, 'articles.json');
      for (const raw of ['{broken', '', '{}']) {
        fs.writeFileSync(file, raw);
        const repo = createRepo(backend);
        await assert.rejects(repo.saveArticle({ title: '不应覆盖' }), /数据|读取/);
        assert.equal(fs.readFileSync(file, 'utf8'), raw);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('附件操作拒绝使用路径穿越访问库外文件', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-files-'));
    try {
      const backend = createFsBackend();
      backend.setBase(dir);
      const outside = path.join(dir, 'outside.txt');
      fs.writeFileSync(outside, 'keep');
      assert.equal(backend.readFileBlob('../outside.txt'), null);
      assert.equal(backend.deleteFile('../outside.txt'), false);
      assert.equal(backend.fileSize('../outside.txt'), 0);
      assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
