/**
 * 整站静态导出。
 *
 * 目标：把本地文章库导成一个可以直接扔进 GitHub Pages / Cloudflare Pages
 * 的纯静态站。用户拿走的不是一个 JSON，而是一个能直接访问的网站。
 *
 * 关键决定：**全部用相对链接**。
 * GitHub Pages 的项目站挂在 /repo-name/ 下，绝对路径一换目录就断；
 * 相对路径放到任意子目录都能跑。
 */

'use strict';

(function () {
  /** 转义 HTML 文本 */
  function escapeHtml(input) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 生成文件名安全的 slug。
   * 中文标题保留（现代浏览器与 GitHub Pages 都支持），只把分隔符与
   * 文件系统不友好的字符换掉。
   */
  function slugify(title, fallback) {
    const base = String(title || '')
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[\\/:*?"<>|#%&{}，。！？、；：“”‘’（）【】《》…—·]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    return base || String(fallback || 'post');
  }

  /** 同一批文章里 slug 可能撞车，撞了就加序号 */
  function uniqueSlugs(posts) {
    const used = new Map();
    return posts.map((post) => {
      const base = slugify(post.title, post.id);
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      return n === 0 ? base : base + '-' + (n + 1);
    });
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  const BASE_CSS = [
    ':root{color-scheme:dark light}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:#0b0f16;color:#e6edf3;font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
    'a{color:#58a6ff;text-decoration:none}',
    'a:hover{text-decoration:underline}',
    '.wrap{max-width:720px;margin:0 auto;padding:48px 20px 80px}',
    'header.site{margin-bottom:40px}',
    'header.site h1{margin:0 0 6px;font-size:26px}',
    'header.site p{margin:0;color:#8b949e;font-size:14px}',
    'ul.posts{list-style:none;padding:0;margin:0}',
    'ul.posts li{padding:18px 0;border-bottom:1px solid #1f2630}',
    'ul.posts li:last-child{border-bottom:0}',
    'ul.posts h2{margin:0 0 6px;font-size:18px;line-height:1.4}',
    'ul.posts .meta{color:#6e7681;font-size:13px}',
    'ul.posts .excerpt{margin:6px 0 0;color:#8b949e;font-size:14px}',
    'article h1{margin:0 0 10px;font-size:30px;line-height:1.35}',
    'article .meta{color:#6e7681;font-size:13px;margin-bottom:28px}',
    'article img{max-width:100%;height:auto;border-radius:10px}',
    'article pre{background:#11161d;padding:14px;border-radius:10px;overflow:auto;font-size:13px}',
    'article code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
    'article blockquote{margin:0;padding-left:14px;border-left:3px solid #1f6feb;color:#9aa4b2}',
    'article table{border-collapse:collapse;width:100%}article th,article td{border:1px solid #1f2630;padding:6px 10px}',
    'footer.site{margin-top:56px;color:#6e7681;font-size:13px}',
    '.back{display:inline-block;margin-bottom:28px;font-size:14px}',
  ].join('\n');

  function page(options) {
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width,initial-scale=1" />',
      '<title>' + escapeHtml(options.title) + '</title>',
      options.description ? '<meta name="description" content="' + escapeHtml(options.description) + '" />' : '',
      '<style>' + BASE_CSS + '</style>',
      '</head>',
      '<body><div class="wrap">',
      options.body,
      '</div></body></html>',
    ].join('');
  }

  /** 首页：文章列表 */
  function buildIndex(options) {
    const siteName = options.siteName || 'LongPost';
    const items = (options.posts || [])
      .map(function (post) {
        return [
          '<li>',
          '<h2><a href="posts/' + post.slug + '.html">' + escapeHtml(post.title) + '</a></h2>',
          '<div class="meta">' + escapeHtml(post.date || '') + '</div>',
          post.excerpt ? '<p class="excerpt">' + escapeHtml(post.excerpt) + '</p>' : '',
          '</li>',
        ].join('');
      })
      .join('');

    return page({
      title: siteName,
      description: options.description,
      body: [
        '<header class="site">',
        '<h1>' + escapeHtml(siteName) + '</h1>',
        options.description ? '<p>' + escapeHtml(options.description) + '</p>' : '',
        '</header>',
        items ? '<ul class="posts">' + items + '</ul>' : '<p>还没有文章。</p>',
        '<footer class="site">共 ' + (options.posts || []).length + ' 篇 · 由 LongPost 导出</footer>',
      ].join(''),
    });
  }

  /** 单篇：正文由调用方传入已经渲染好的 HTML */
  function buildPost(options) {
    const siteName = options.siteName || 'LongPost';
    return page({
      title: options.title + ' · ' + siteName,
      description: options.excerpt,
      body: [
        '<a class="back" href="../index.html">← 返回列表</a>',
        '<article>',
        '<h1>' + escapeHtml(options.title) + '</h1>',
        '<div class="meta">' + escapeHtml([options.authorName, options.date].filter(Boolean).join(' · ')) + '</div>',
        options.bodyHtml,
        '</article>',
        '<footer class="site">' + escapeHtml(siteName) + '</footer>',
      ].join(''),
    });
  }

  /** RSS 2.0；没有站点地址时返回 null（相对链接的 feed 没人能用） */
  function buildFeed(options) {
    const siteUrl = String(options.siteUrl || '').replace(/\/+$/, '');
    if (!siteUrl) return null;

    const items = (options.posts || [])
      .map(function (post) {
        const url = siteUrl + '/posts/' + post.slug + '.html';
        return [
          '<item>',
          '<title>' + escapeHtml(post.title) + '</title>',
          '<link>' + escapeHtml(url) + '</link>',
          '<guid isPermaLink="true">' + escapeHtml(url) + '</guid>',
          post.date ? '<pubDate>' + new Date(post.date).toUTCString() + '</pubDate>' : '',
          post.excerpt ? '<description>' + escapeHtml(post.excerpt) + '</description>' : '',
          '</item>',
        ].join('');
      })
      .join('');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0"><channel>',
      '<title>' + escapeHtml(options.siteName || 'LongPost') + '</title>',
      '<link>' + escapeHtml(siteUrl) + '</link>',
      '<description>' + escapeHtml(options.description || '') + '</description>',
      items,
      '</channel></rss>',
    ].join('');
  }

  /** sitemap.xml；同样需要绝对地址 */
  function buildSitemap(options) {
    const siteUrl = String(options.siteUrl || '').replace(/\/+$/, '');
    if (!siteUrl) return null;

    const urls = ['<url><loc>' + escapeHtml(siteUrl + '/') + '</loc></url>'].concat(
      (options.posts || []).map(function (post) {
        return '<url><loc>' + escapeHtml(siteUrl + '/posts/' + post.slug + '.html') + '</loc></url>';
      }),
    );
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls.join(''),
      '</urlset>',
    ].join('');
  }

  const API = {
    escapeHtml: escapeHtml,
    slugify: slugify,
    uniqueSlugs: uniqueSlugs,
    formatDate: formatDate,
    buildIndex: buildIndex,
    buildPost: buildPost,
    buildFeed: buildFeed,
    buildSitemap: buildSitemap,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.LPStaticSite = API;
})();
