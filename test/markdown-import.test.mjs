import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../desktop/lib/markdown-import.js');

describe('Markdown 导入：frontmatter', () => {
  it('解析 key: value', () => {
    const { data, content } = M.parseFrontmatter('---\ntitle: 标题\ndate: 2026-10-18\n---\n正文');
    assert.equal(data.title, '标题');
    assert.equal(data.date, '2026-10-18');
    assert.equal(content.trim(), '正文');
  });

  it('解析行内数组与行列表', () => {
    const a = M.parseFrontmatter('---\ntags: [写作, 长文]\n---\nx');
    assert.deepEqual(a.data.tags, ['写作', '长文']);

    const b = M.parseFrontmatter('---\ntags:\n  - 写作\n  - 长文\n---\nx');
    assert.deepEqual(b.data.tags, ['写作', '长文']);
  });

  it('去掉值两端的引号', () => {
    const { data } = M.parseFrontmatter('---\ntitle: "带引号"\n---\n');
    assert.equal(data.title, '带引号');
  });

  it('没有 frontmatter 时原样返回', () => {
    const { data, content } = M.parseFrontmatter('# 标题\n正文');
    assert.deepEqual(data, {});
    assert.equal(content, '# 标题\n正文');
  });

  it('BOM 不影响识别', () => {
    const { data } = M.parseFrontmatter('\uFEFF---\ntitle: T\n---\n');
    assert.equal(data.title, 'T');
  });
});

describe('Markdown 导入：文档推导', () => {
  it('优先用 frontmatter 的 title', () => {
    const doc = M.toDocument({ relativePath: 'a/b.md', text: '---\ntitle: 真标题\n---\n# 别的\n正文' });
    assert.equal(doc.title, '真标题');
  });

  it('没有 title 时用正文的一级标题', () => {
    const doc = M.toDocument({ relativePath: 'a/b.md', text: '# 一级标题\n正文' });
    assert.equal(doc.title, '一级标题');
  });

  it('都没有时用文件名', () => {
    const doc = M.toDocument({ relativePath: 'a/我的笔记.md', text: '正文' });
    assert.equal(doc.title, '我的笔记');
  });

  it('正文里与标题重复的一级标题会被去掉', () => {
    const doc = M.toDocument({ relativePath: 'b.md', text: '# 标题\n\n正文' });
    assert.equal(doc.title, '标题');
    assert.equal(doc.content, '正文');
  });

  it('目录名变成一个标签，便于迁移后仍然按文件夹分类', () => {
    const doc = M.toDocument({ relativePath: '技术/写作/a.md', text: '正文' });
    assert.equal(doc.tags[0], '写作');
  });

  it('标签去重且最多 12 个', () => {
    const many = Array.from({ length: 20 }, (_, i) => 't' + i).join(', ');
    const doc = M.toDocument({ relativePath: 'x.md', text: '---\ntags: ' + many + '\n---\n正文' });
    assert.ok(doc.tags.length <= 12);
  });

  it('日期解析失败时不产生非法时间', () => {
    assert.equal(M.parseDate('not-a-date'), null);
    assert.equal(M.parseDate(''), null);
    assert.equal(M.parseDate('2026-10-18'), '2026-10-18T00:00:00.000Z');
  });
});

describe('Markdown 导入：导入计划', () => {
  const files = [
    { relativePath: 'a.md', text: '# A\n正文' },
    { relativePath: 'b.md', text: '# B\n正文' },
    { relativePath: 'c.md', text: '' },
    { relativePath: 'd.md', text: '# A\n重复标题' },
  ];

  it('跳过空文件', () => {
    const { skipped } = M.planImport(files, []);
    assert.ok(skipped.some((s) => s.reason === 'empty'));
  });

  it('跳过已存在的标题（迁移时不覆盖是最安全的默认）', () => {
    const { docs, skipped } = M.planImport(files, ['A']);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].title, 'B');
    assert.ok(skipped.some((s) => s.reason === 'exists' && s.title === 'A'));
  });

  it('同一批里的重复标题只导入一次', () => {
    const { docs, skipped } = M.planImport(files, []);
    assert.equal(docs.filter((d) => d.title === 'A').length, 1);
    assert.ok(skipped.some((s) => s.reason === 'duplicate-in-import'));
  });

  it('标题比较忽略大小写与空白', () => {
    const { docs } = M.planImport([{ relativePath: 'x.md', text: '# Hello\n正文' }], ['  hello ']);
    assert.equal(docs.length, 0);
  });
});
