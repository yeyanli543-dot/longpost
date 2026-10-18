import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产实现：以前这里把 escapeXml / wrapCdata / 整个 XML 模板抄了一份，
// 导致改坏了线上生成器测试也照样绿。
import { buildAtomXml, buildRss2Xml } from '../server/common/utils/rss-builder.ts';
import { APP_VERSION } from '../shared/version.ts';

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
    assert.ok(
      rssXml.includes(`<generator>LongPost Syndication Engine v${APP_VERSION}</generator>`),
      'RSS generator 必须带上当前版本号',
    );

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
    assert.ok(
      atomXml.includes(`version="${APP_VERSION}">LongPost</generator>`),
      'Atom generator 必须带上当前版本号',
    );

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
