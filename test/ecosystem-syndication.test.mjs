import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildObsidianMarkdown(article) {
  const title = article.title || '未命名长文';
  const author = article.authorName || 'LongPost 创作者';
  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt).toISOString()
    : new Date().toISOString();
  const updatedDate = article.updatedAt
    ? new Date(article.updatedAt).toISOString()
    : publishedDate;

  const rawTags = article.tags || [];
  const tagList = Array.from(
    new Set(['longpost', ...rawTags.map((t) => t.replace(/^#/, '').trim())]),
  ).filter(Boolean);

  const tagsYaml = tagList.map((t) => `  - ${t}`).join('\n');
  const safeTitle = title.replace(/"/g, '\\"');
  const safeExcerpt = (article.excerpt || '').replace(/"/g, '\\"');
  const sourceUrl = article.url || '';

  const frontmatter = [
    '---',
    `title: "${safeTitle}"`,
    `author: "${author}"`,
    `date: ${publishedDate}`,
    `updated: ${updatedDate}`,
    'tags:',
    tagsYaml,
    ...(sourceUrl ? [`source: "${sourceUrl}"`] : []),
    ...(article.slug ? [`slug: "${article.slug}"`] : []),
    ...(safeExcerpt ? [`excerpt: "${safeExcerpt}"`] : []),
    'generator: "LongPost Second Brain Exporter"',
    '---',
    '',
    `# ${title}`,
    '',
    article.content,
    '',
    ...(sourceUrl
      ? [
          '---',
          `*原文链接: [${sourceUrl}](${sourceUrl}) · 导出自 LongPost 深度长文知识库*`,
          '',
        ]
      : []),
  ].join('\n');

  return frontmatter;
}

function buildWechatMpInlineHtml(title, content) {
  const safeTitle = escapeHtml(title || '未命名长文');
  let bodyHtml = escapeHtml(content || '').replace(/\n/g, '<br/>');

  const header = '<section style="background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; padding: 22px 18px; margin-bottom: 24px; color: #ffffff;"><h1 style="margin: 0 0 8px 0; font-size: 21px; font-weight: 700; color: #ffffff;">' + safeTitle + '</h1><div style="font-size: 12px; color: #94a3b8;">LongPost 深度长文 · ' + new Date().toLocaleDateString('zh-CN') + '</div></section>';
  const footer = '<section style="margin-top: 36px; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13px; color: #64748b; text-align: center;"><p style="margin: 0; font-weight: 600; color: #1e293b;">✨ 本文由 LongPost 排版生成 · 粘贴即成文</p></section>';

  return '<section style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; line-height: 1.85; color: #334155;">' + header + bodyHtml + footer + '</section>';
}

describe('Ecosystem Syndication & Second Brain Suite', () => {
  const mockArticle = {
    title: '知识图谱与第二大脑集成实战',
    content: '## 1. 架构总览\n\n通过标准化元数据打通知识孤岛。',
    authorName: 'Ecosystem Architect',
    publishedAt: new Date('2026-10-14T06:00:00Z'),
    updatedAt: new Date('2026-10-14T06:30:00Z'),
    tags: ['#pkm', 'obsidian', 'knowledge-base'],
    slug: 'second-brain-2026',
    url: 'https://longpost.app/p/second-brain-2026',
    excerpt: '解析个人知识管理体系与 LongPost 的深度互联',
  };

  it('should generate standard Obsidian YAML frontmatter markdown', () => {
    const md = buildObsidianMarkdown(mockArticle);

    assert.ok(md.startsWith('---\n'));
    assert.ok(md.includes('title: "知识图谱与第二大脑集成实战"'));
    assert.ok(md.includes('author: "Ecosystem Architect"'));
    assert.ok(md.includes('date: 2026-10-14T06:00:00.000Z'));
    assert.ok(md.includes('updated: 2026-10-14T06:30:00.000Z'));
    assert.ok(md.includes('tags:\n  - longpost\n  - pkm\n  - obsidian\n  - knowledge-base'));
    assert.ok(md.includes('source: "https://longpost.app/p/second-brain-2026"'));
    assert.ok(md.includes('slug: "second-brain-2026"'));
    assert.ok(md.includes('# 知识图谱与第二大脑集成实战'));
    assert.ok(md.includes('*原文链接: [https://longpost.app/p/second-brain-2026](https://longpost.app/p/second-brain-2026) · 导出自 LongPost 深度长文知识库*'));
  });

  it('should generate WeChat Official Account inline CSS rich text HTML', () => {
    const html = buildWechatMpInlineHtml(mockArticle.title, mockArticle.content);

    assert.ok(html.includes('style="max-width: 677px; margin: 0 auto;'));
    assert.ok(html.includes('LongPost 深度长文'));
    assert.ok(html.includes('知识图谱与第二大脑集成实战'));
    assert.ok(html.includes('✨ 本文由 LongPost 排版生成 · 粘贴即成文'));
  });
});
