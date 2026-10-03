import { escapeHtml } from './markdown-render';

const ARTICLE_STYLE = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { background: #000; color: #e7e9ea; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.7; -webkit-font-smoothing: antialiased; }
    body { background: #000; min-height: 100vh; }
    .nav { position: sticky; top: 0; z-index: 10; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #2f3336; }
    .nav-inner { max-width: 700px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; gap: 16px; }
    .nav-logo { font-size: 20px; font-weight: 700; color: #1d9bf0; text-decoration: none; }
    .nav-back { color: #e7e9ea; text-decoration: none; font-size: 14px; opacity: 0.8; }
    .nav-back:hover { opacity: 1; }
    .article { max-width: 700px; margin: 0 auto; padding: 32px 16px 80px; }
    .article-header { margin-bottom: 32px; }
    .article-title { font-size: 32px; font-weight: 700; line-height: 1.3; margin-bottom: 16px; letter-spacing: -0.02em; }
    .article-meta { display: flex; align-items: center; gap: 12px; color: #71767b; font-size: 14px; }
    .author-name { color: #e7e9ea; font-weight: 500; }
    .article-cover { width: 100%; border-radius: 12px; overflow: hidden; margin-bottom: 32px; background: #16181c; }
    .article-cover img { width: 100%; height: auto; display: block; }
    .article-body { font-size: 17px; line-height: 1.8; color: #e7e9ea; }
    .article-body h2 { font-size: 24px; font-weight: 700; margin-top: 40px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #2f3336; }
    .article-body h2:first-child { margin-top: 0; }
    .article-body h3 { font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; }
    .article-body p { margin-bottom: 20px; }
    .article-body img { max-width: 100%; border-radius: 8px; margin: 24px 0; }
    .article-body strong { font-weight: 600; }
    .article-body em { font-style: italic; }
    .article-body ul, .article-body ol { margin: 16px 0; padding-left: 24px; }
    .article-body li { margin-bottom: 8px; }
    .article-body blockquote { border-left: 3px solid #1d9bf0; padding-left: 16px; margin: 20px 0; color: #71767b; font-style: italic; }
    .article-body code { background: #16181c; padding: 2px 6px; border-radius: 4px; font-family: "SF Mono", Consolas, monospace; font-size: 0.9em; }
    .article-body a { color: #1d9bf0; text-decoration: none; }
    .article-body a:hover { text-decoration: underline; }
    .gallery { margin: 32px 0; display: grid; gap: 16px; }
    .gallery img { width: 100%; border-radius: 8px; display: block; }
    .attachments { margin-top: 40px; padding-top: 24px; border-top: 1px solid #2f3336; }
    .attachments-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #e7e9ea; }
    .attachment-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #16181c; border-radius: 8px; margin-bottom: 8px; text-decoration: none; color: #e7e9ea; transition: background 0.2s; }
    .attachment-item:hover { background: #1d1f23; }
    .attachment-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #1d9bf0; border-radius: 6px; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .attachment-info { flex: 1; min-width: 0; }
    .attachment-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .attachment-size { font-size: 12px; color: #71767b; margin-top: 2px; }
    .article-stats { margin-top: 40px; padding-top: 20px; border-top: 1px solid #2f3336; display: flex; gap: 24px; color: #71767b; font-size: 14px; flex-wrap: wrap; }
    .article-footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #2f3336; text-align: center; color: #71767b; font-size: 13px; }
    .article-footer a { color: #1d9bf0; text-decoration: none; }
    @media (max-width: 640px) {
      .article-title { font-size: 26px; }
      .article-body { font-size: 16px; }
      .article { padding: 20px 14px 60px; }
    }`;

export interface ArticleTemplateParams {
  siteName: string;
  platformJson: string;
  title: string;
  excerpt: string;
  coverUrl: string;
  fullUrl: string;
  authorName: string;
  publishedAt: string;
  bodyHtml: string;
  images: string[];
  attachments: Array<{
    fileName: string;
    fileUrl: string;
    ext: string;
    sizeLabel: string;
  }>;
  readCount: number;
  commentCount: number;
  likeCount: number;
  bookmarkCount: number;
}

export function buildArticleHtml(params: ArticleTemplateParams): string {
  const {
    siteName,
    platformJson,
    title,
    excerpt,
    coverUrl,
    fullUrl,
    authorName,
    publishedAt,
    bodyHtml,
    images,
    attachments,
    readCount,
    commentCount,
    likeCount,
    bookmarkCount,
  } = params;

  const safeTitle = escapeHtml(title);
  const safeExcerpt = escapeHtml(excerpt);
  const safeCover = escapeHtml(coverUrl);
  const safeUrl = escapeHtml(fullUrl);
  const safeAuthor = escapeHtml(authorName);
  const safeDate = escapeHtml(publishedAt);
  const safeSite = escapeHtml(siteName);

  const ogImageMeta = coverUrl
    ? `  <meta property="og:image" content="${safeCover}">\n`
    : '';
  const twitterImageMeta = coverUrl
    ? `  <meta name="twitter:image" content="${safeCover}">\n`
    : '';

  const galleryHtml =
    images.length > 0
      ? `    <div class="gallery">
${images
  .map(
    (img) =>
      `      <img src="${escapeHtml(img)}" alt="文中配图" loading="lazy">`,
  )
  .join('\n')}
    </div>`
      : '';

  const attachmentsHtml =
    attachments.length > 0
      ? `    <div class="attachments">
      <div class="attachments-title">附件下载</div>
${attachments
  .map(
    (att) =>
      `      <a class="attachment-item" href="${escapeHtml(
        att.fileUrl,
      )}" target="_blank" rel="noopener">
        <div class="attachment-icon">${escapeHtml(att.ext)}</div>
        <div class="attachment-info">
          <div class="attachment-name">${escapeHtml(att.fileName)}</div>
          <div class="attachment-size">${escapeHtml(att.sizeLabel)}</div>
        </div>
      </a>`,
  )
  .join('\n')}
    </div>`
      : '';

  const coverHtml = coverUrl
    ? `    <div class="article-cover">
      <img src="${safeCover}" alt="${safeTitle}" loading="eager">
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} — ${safeSite}</title>
  <meta name="description" content="${safeExcerpt}">

  <meta property="og:type" content="article">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeExcerpt}">
${ogImageMeta}  <meta property="og:url" content="${safeUrl}">
  <meta property="og:site_name" content="${safeSite}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="theme-color" content="#1d9bf0">
  <meta name="mobile-web-app-capable" content="yes">
  <link rel="icon" href="/app/app_17ea4bnn0xw/favicon.png">
  <link rel="apple-touch-icon" href="/app/app_17ea4bnn0xw/icon-192.png">
  <link rel="manifest" href="/app/app_17ea4bnn0xw/manifest.json">
  <script>
    try {
      window.__platform__ = JSON.parse('${platformJson}');
    } catch (e) {
      console.error('Failed to parse __platform__', e);
    }
  </script>

  <style>${ARTICLE_STYLE}
  </style>
</head>

<body>
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="nav-logo">${safeSite}</a>
      <a href="/" class="nav-back">← 返回首页</a>
    </div>
  </nav>

  <article class="article">
    <header class="article-header">
      <h1 class="article-title">${safeTitle}</h1>
      <div class="article-meta">
        <span class="author-name">${safeAuthor}</span>
        <span>·</span>
        <span>${safeDate}</span>
      </div>
    </header>

${coverHtml}

    <div class="article-body">
${bodyHtml}
    </div>

${galleryHtml}

${attachmentsHtml}

    <div class="article-stats">
      <span>👁 ${readCount} 阅读</span>
      <span>💬 ${commentCount} 评论</span>
      <span>❤️ ${likeCount} 点赞</span>
      <span>🔖 ${bookmarkCount} 收藏</span>
    </div>

    <div class="article-footer">
      <p>本文由 <strong>${safeSite}</strong> 发布 · 分享自 <a href="${safeUrl}">${safeUrl}</a></p>
    </div>
  </article>
</body>

</html>`;
}

export function buildNotFoundHtml(siteName: string): string {
  const safeSite = escapeHtml(siteName);
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#1d9bf0">
  <meta name="mobile-web-app-capable" content="yes">
  <link rel="icon" href="/app/app_17ea4bnn0xw/favicon.png">
  <link rel="apple-touch-icon" href="/app/app_17ea4bnn0xw/icon-192.png">
  <link rel="manifest" href="/app/app_17ea4bnn0xw/manifest.json">
  <title>文章不存在 — ${safeSite}</title>
  <meta property="og:title" content="文章不存在">
  <meta property="og:description" content="该文章可能已被删除或尚未发布。">
  <style>
    body { background: #000; color: #e7e9ea; font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .note { text-align: center; padding: 40px 20px; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { color: #71767b; margin-bottom: 20px; }
    a { color: #1d9bf0; text-decoration: none; }
  </style>
</head>
<body>
  <div class="note">
    <h1>文章不存在</h1>
    <p>该文章可能已被删除或尚未发布。</p>
    <p><a href="/">返回首页</a></p>
  </div>
</body>
</html>`;
}
