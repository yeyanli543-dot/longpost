import { toast } from 'sonner';

export interface ObsidianArticleData {
  title: string;
  content: string;
  authorName?: string;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  tags?: string[];
  slug?: string;
  url?: string;
  excerpt?: string;
}

function sanitizeFileName(name: string): string {
  return String(name || 'untitled')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export function buildObsidianMarkdown(article: ObsidianArticleData): string {
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

export function exportObsidianMarkdown(article: ObsidianArticleData): boolean {
  try {
    const mdContent = buildObsidianMarkdown(article);
    const fileName = `${sanitizeFileName(article.slug || article.title || 'article')}.md`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`已导出 Obsidian 格式笔记: ${fileName}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(`导出 Obsidian 笔记失败: ${msg}`);
    return false;
  }
}
