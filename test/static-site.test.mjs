import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../desktop/lib/static-site.js');

describe('静态站导出：slug', () => {
  it('中文标题保留，去掉标点', () => {
    assert.equal(S.slugify('写了三年长文，我才明白！', 'x'), '写了三年长文我才明白');
  });

  it('空格转连字符、连续连字符合并', () => {
    assert.equal(S.slugify('Hello   World  Again', 'x'), 'hello-world-again');
  });

  it('去掉路径分隔符，避免写出目录', () => {
    assert.equal(S.slugify('a/b\\c', 'x'), 'abc');
  });

  it('空标题用 fallback', () => {
    assert.equal(S.slugify('', 'post-1'), 'post-1');
  });

  it('撞车时自动加序号', () => {
    const slugs = S.uniqueSlugs([{ title: '同名', id: 1 }, { title: '同名', id: 2 }, { title: '同名', id: 3 }]);
    assert.deepEqual(slugs, ['同名', '同名-2', '同名-3']);
  });
});

describe('静态站导出：页面', () => {
  const posts = [
    { title: '第一篇', slug: '第一篇', date: '2026-10-18', excerpt: '摘要一' },
    { title: '第二篇', slug: '第二篇', date: '2026-10-17', excerpt: '' },
  ];

  it('首页用相对链接指向 posts/', () => {
    const html = S.buildIndex({ siteName: '我的站', posts });
    assert.ok(html.includes('href="posts/第一篇.html"'));
    assert.ok(!html.includes('href="/posts'), '不能有绝对路径');
    assert.ok(html.includes('我的站'));
    assert.ok(html.includes('共 2 篇'));
  });

  it('单篇页返回上一级用 ../index.html', () => {
    const html = S.buildPost({ title: 'T', bodyHtml: '<p>正文</p>', siteName: 'S' });
    assert.ok(html.includes('href="../index.html"'));
    assert.ok(html.includes('<p>正文</p>'));
  });

  it('标题里的尖括号被转义', () => {
    const html = S.buildIndex({ siteName: 'S', posts: [{ title: '<script>', slug: 'x' }] });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('空文章列表给出提示而不是空白页', () => {
    assert.ok(S.buildIndex({ siteName: 'S', posts: [] }).includes('还没有文章'));
  });
});

describe('静态站导出：订阅与索引', () => {
  const posts = [{ title: 'A', slug: 'a', date: '2026-10-18', excerpt: '摘要' }];

  it('没有站点地址时不生成 feed（相对链接的 RSS 没法订阅）', () => {
    assert.equal(S.buildFeed({ siteName: 'S', posts }), null);
    assert.equal(S.buildSitemap({ posts }), null);
  });

  it('有地址时生成绝对链接的 RSS 与 sitemap', () => {
    const feed = S.buildFeed({ siteName: 'S', siteUrl: 'https://blog.example.com/', posts });
    assert.ok(feed.includes('<link>https://blog.example.com/posts/a.html</link>'));
    assert.ok(feed.includes('<pubDate>'));

    const sitemap = S.buildSitemap({ siteUrl: 'https://blog.example.com', posts });
    assert.ok(sitemap.includes('<loc>https://blog.example.com/posts/a.html</loc>'));
  });

  it('日期格式化成 YYYY-MM-DD，非法日期返回空串', () => {
    assert.equal(S.formatDate('2026-10-18T12:00:00Z'), '2026-10-18');
    assert.equal(S.formatDate('nope'), '');
    assert.equal(S.formatDate(null), '');
  });
});
