import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapCdata(content) {
  const safe = String(content || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

function buildRss2Xml(meta, items) {
  const language = meta.language || 'zh-CN';
  const buildDate = (meta.lastBuildDate || new Date()).toUTCString();

  const itemsXml = items
    .map((item) => {
      const pubDate = new Date(item.publishedAt).toUTCString();
      const author = item.authorName || meta.authorName || 'LongPost Author';
      const desc = item.excerpt || item.title;
      const body = item.content || item.excerpt || '';

      return `    <item>
      <title>${wrapCdata(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${wrapCdata(author)}</dc:creator>
      <description>${wrapCdata(desc)}</description>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/">${wrapCdata(body)}</content:encoded>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${wrapCdata(meta.title)}</title>
    <link>${escapeXml(meta.link)}</link>
    <description>${wrapCdata(meta.description)}</description>
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <generator>LongPost Syndication Engine v2.9.5</generator>
    <atom:link href="${escapeXml(meta.feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

function buildAtomXml(meta, items) {
  const updated = (meta.lastBuildDate || new Date()).toISOString();

  const entriesXml = items
    .map((item) => {
      const published = new Date(item.publishedAt).toISOString();
      const itemUpdated = (item.updatedAt ? new Date(item.updatedAt) : new Date(item.publishedAt)).toISOString();
      const author = item.authorName || meta.authorName || 'LongPost Author';
      const summary = item.excerpt || item.title;
      const body = item.content || item.excerpt || '';

      return `  <entry>
    <title type="html">${wrapCdata(item.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeXml(item.link)}" />
    <id>${escapeXml(item.link)}</id>
    <published>${published}</published>
    <updated>${itemUpdated}</updated>
    <author>
      <name>${escapeXml(author)}</name>
    </author>
    <summary type="html">${wrapCdata(summary)}</summary>
    <content type="html">${wrapCdata(body)}</content>
  </entry>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${wrapCdata(meta.title)}</title>
  <subtitle>${wrapCdata(meta.description)}</subtitle>
  <link rel="alternate" type="text/html" href="${escapeXml(meta.link)}" />
  <link rel="self" type="application/atom+xml" href="${escapeXml(meta.feedUrl)}" />
  <id>${escapeXml(meta.feedUrl)}</id>
  <updated>${updated}</updated>
  <generator uri="https://github.com/yeyanli543-dot/longpost" version="2.9.5">LongPost</generator>
${entriesXml}
</feed>`;
}

describe('RSS 2.0 & Atom 1.0 Syndication Suite', () => {
  const mockMeta = {
    title: 'LongPost - 发现深度好文 & 思想创作',
    link: 'https://longpost.app',
    description: '优质深度长文聚合订阅源 <科技 & 人文>',
    feedUrl: 'https://longpost.app/rss.xml',
    lastBuildDate: new Date('2026-10-14T08:00:00Z'),
  };

  const mockItems = [
    {
      id: 'post-1',
      title: '深度解析：零拷贝流式计算在现代系统的应用',
      link: 'https://longpost.app/p/zero-copy-2026',
      excerpt: '探讨现代操作系统与底层网络栈的协同优化...',
      content: '<h2>1. 核心架构</h2><p>零拷贝机制的核心在于避免页缓存与用户态内存的冗余搬运。</p>',
      authorName: 'Alex River',
      publishedAt: new Date('2026-10-14T07:30:00Z'),
      updatedAt: new Date('2026-10-14T07:45:00Z'),
    },
    {
      id: 'post-2',
      title: '特殊字符测试 <script> & "quotes" & ]]>',
      link: 'https://longpost.app/article/b429a1b8-2993-4e4b-97e3-057d6b38c351',
      excerpt: '防注入校验',
      content: '<p>内容含 <tag> 与 ]]> 闭合标记测试</p>',
      authorName: 'Security Tester',
      publishedAt: new Date('2026-10-13T12:00:00Z'),
    },
  ];

  it('should generate valid RSS 2.0 XML complying with W3C specification', () => {
    const rssXml = buildRss2Xml(mockMeta, mockItems);

    assert.ok(rssXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(rssXml.includes('<rss version="2.0"'));
    assert.ok(rssXml.includes('<atom:link href="https://longpost.app/rss.xml" rel="self" type="application/rss+xml" />'));
    assert.ok(rssXml.includes('<generator>LongPost Syndication Engine v2.9.5</generator>'));

    // Check item 1
    assert.ok(rssXml.includes('<title><![CDATA[深度解析：零拷贝流式计算在现代系统的应用]]></title>'));
    assert.ok(rssXml.includes('<link>https://longpost.app/p/zero-copy-2026</link>'));
    assert.ok(rssXml.includes('<guid isPermaLink="true">https://longpost.app/p/zero-copy-2026</guid>'));
    assert.ok(rssXml.includes('<dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/"><![CDATA[Alex River]]></dc:creator>'));
    assert.ok(rssXml.includes('<content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[<h2>1. 核心架构</h2><p>零拷贝机制的核心在于避免页缓存与用户态内存的冗余搬运。</p>]]></content:encoded>'));

    // Check item 2 CDATA break handling
    assert.ok(rssXml.includes('<![CDATA[特殊字符测试 <script> & "quotes" & ]]]]><![CDATA[>]]>'));
  });

  it('should generate valid Atom 1.0 XML complying with RFC 4287', () => {
    const atomMeta = {
      ...mockMeta,
      feedUrl: 'https://longpost.app/atom.xml',
    };
    const atomXml = buildAtomXml(atomMeta, mockItems);

    assert.ok(atomXml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.ok(atomXml.includes('<feed xmlns="http://www.w3.org/2005/Atom">'));
    assert.ok(atomXml.includes('<link rel="self" type="application/atom+xml" href="https://longpost.app/atom.xml" />'));
    assert.ok(atomXml.includes('<updated>2026-10-14T08:00:00.000Z</updated>'));

    // Check entry 1
    assert.ok(atomXml.includes('<entry>'));
    assert.ok(atomXml.includes('<id>https://longpost.app/p/zero-copy-2026</id>'));
    assert.ok(atomXml.includes('<published>2026-10-14T07:30:00.000Z</published>'));
    assert.ok(atomXml.includes('<updated>2026-10-14T07:45:00.000Z</updated>'));
    assert.ok(atomXml.includes('<name>Alex River</name>'));
  });

  it('should gracefully handle empty items feed', () => {
    const rssXml = buildRss2Xml(mockMeta, []);
    assert.ok(rssXml.includes('<channel>'));
    assert.ok(!rssXml.includes('<item>'));

    const atomXml = buildAtomXml(mockMeta, []);
    assert.ok(atomXml.includes('<feed'));
    assert.ok(!atomXml.includes('<entry>'));
  });
});
