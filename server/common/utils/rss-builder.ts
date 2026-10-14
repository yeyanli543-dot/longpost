/**
 * 标准 RSS 2.0 与 Atom 1.0 聚合订阅源生成器。
 * 遵循 W3C RSS 2.0 规范与 IETF RFC 4287 (Atom) 规范，兼容全球主流阅读器：
 * Follow, NetNewsWire, Reeder, Inoreader, Feedly, Feedbro 等。
 */

function escapeXml(unsafe: string): string {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapCdata(content: string): string {
  // CDATA 块内如果包含 ]]>，需要拆分转义
  const safe = String(content || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

export interface RssChannelMeta {
  title: string;
  link: string;
  description: string;
  language?: string;
  feedUrl: string;
  authorName?: string;
  lastBuildDate?: Date;
}

export interface RssItemData {
  id: string;
  title: string;
  link: string;
  excerpt?: string | null;
  content?: string | null;
  authorName?: string;
  publishedAt: Date;
  updatedAt?: Date;
}

/**
 * 生成 RSS 2.0 标准 XML 字符串
 */
export function buildRss2Xml(meta: RssChannelMeta, items: RssItemData[]): string {
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

/**
 * 生成 Atom 1.0 标准 XML 字符串
 */
export function buildAtomXml(meta: RssChannelMeta, items: RssItemData[]): string {
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
