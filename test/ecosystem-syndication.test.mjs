import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产实现，不再在测试文件里复制一份导出器
import { buildObsidianMarkdown } from '../client/src/lib/obsidian-exporter.ts';
import { buildWeChatHtml } from '../client/src/lib/wechat-formatter.ts';

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
    assert.ok(md.includes('generator: "LongPost Second Brain Exporter"'));
    assert.ok(md.includes('# 知识图谱与第二大脑集成实战'));
    assert.ok(
      md.includes(
        '*原文链接: [https://longpost.app/p/second-brain-2026](https://longpost.app/p/second-brain-2026) · 导出自 LongPost 深度长文知识库*',
      ),
    );
  });

  it('Obsidian 导出必须转义标题里的双引号，避免 YAML 断裂', () => {
    const md = buildObsidianMarkdown({ ...mockArticle, title: '中文 "引号" 测试' });
    assert.ok(md.includes('title: "中文 \\"引号\\" 测试"'), '双引号必须被转义');
  });

  it('should generate WeChat Official Account inline CSS rich text HTML', () => {
    const html = buildWeChatHtml(mockArticle);

    assert.ok(html.includes('max-width: 677px'), '必须使用公众号正文最大宽度容器');
    assert.ok(html.includes('知识图谱与第二大脑集成实战'), '标题必须出现在正文里');
    assert.ok(html.includes('LongPost 深度长文'), '必须带品牌署名');
    assert.ok(html.includes('架构总览'), '正文标题必须保留');
  });

  it('公众号 HTML 必须对恶意内容做转义，不能原样注入', () => {
    const html = buildWeChatHtml({
      ...mockArticle,
      title: '<script>alert(1)</script>标题',
      content: '正文 <img src=x onerror=alert(1)> 结束',
    });
    assert.ok(!html.includes('<script>alert(1)</script>'), '标题中的 script 必须被转义');
    assert.ok(!html.includes('onerror=alert(1)'), '正文中的事件属性必须被转义');
  });
});
