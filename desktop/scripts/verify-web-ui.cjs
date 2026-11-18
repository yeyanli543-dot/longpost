/**
 * Exercise the built web UI against an isolated, local fixture server.
 * Run after `npm run build:client`: cd desktop && npx electron scripts/verify-web-ui.cjs
 * No account, real articles or external network access are used.
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const Handlebars = require('../../node_modules/handlebars');

const root = path.resolve(__dirname, '../../dist/client');
const shell = Handlebars.compile(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const article = { id: 'article-ui', slug: null, title: '写作，是与自己缓慢对话', excerpt: '给想法一点时间，再把值得分享的内容交给世界。', coverUrl: null, readCount: 128, authorId: 'author-ui', authorName: '林间', authorAvatarUrl: null, authorRole: 'user', status: 'published', createdAt: '2026-11-15T09:00:00Z', imageCount: 0, attachmentCount: 0, likeCount: 24, commentCount: 6, repostCount: 3, bookmarkCount: 8, isPinned: false, isFeatured: false, moderationStatus: 'approved' };
const post = { id: 'post-ui', content: '好的工具，让人更靠近想表达的内容。', articleId: null, article: null, authorId: 'author-ui', authorName: '林间', authorAvatarUrl: null, authorRole: 'user', createdAt: '2026-11-16T09:00:00Z', likeCount: 12, commentCount: 2, repostCount: 1, isPinned: false, isFeatured: false, moderationStatus: 'approved' };
const detail = { ...article, content: '一段用于检查阅读排版的正文。\n\n## 第二节\n\n让内容自然呼吸。', images: [], attachments: [], linkedPosts: [] };
let failedSearches = 0;
const searchCounts = new Map();

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-web-ui-')));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (res, value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };

function serve(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const mounted = url.pathname === '/workspace' || url.pathname.startsWith('/workspace/');
  if (mounted) url.pathname = url.pathname.slice('/workspace'.length) || '/';
  if (url.pathname === '/api/timeline') {
    const hot = url.searchParams.get('view') === 'hot';
    return json(res, { items: hot ? [{ type: 'article', article: { ...article, title: '热门专题' } }] : [{ type: 'article', article }, { type: 'post', post }], nextCursor: null, hasMore: false });
  }
  if (url.pathname === '/api/search') {
    const q = url.searchParams.get('q') || '';
    searchCounts.set(q, (searchCounts.get(q) || 0) + 1);
    console.log('[web-ui fixture] search:', q);
    // The API client retries 5xx twice before exposing an error to the user.
    if (q === '失败' && failedSearches++ < 3) return json(res, { message: 'fixture error' }, 500);
    const title = q === '慢' ? '较慢的结果' : q === '快' ? '最新的结果' : '恢复后的结果';
    return setTimeout(() => json(res, { posts: [], articles: [{ ...article, title }], users: [], hashtags: [] }), q === '慢' ? 1500 : 20);
  }
  if (url.pathname.startsWith('/api/articles/')) return json(res, detail);
  if (url.pathname === '/api/posts/post-ui') return json(res, post);
  if (url.pathname === '/api/comments') return json(res, { items: [], total: 0, nextCursor: null, hasMore: false });
  if (url.pathname.startsWith('/api/follows/')) return json(res, { items: [{ id: 'author-ui', nickname: '林间', avatarUrl: null, bio: '喜欢写作', followingCount: 2, followerCount: 3, isFollowing: false }], nextCursor: null, hasMore: false });
  if (url.pathname === '/api/hashtags/writing') return json(res, { tag: { postCount: 1, articleCount: 0 }, items: [{ type: 'post', post }], nextCursor: null, hasMore: false });
  if (url.pathname.startsWith('/api/hashtags/')) return json(res, { items: [] });
  if (url.pathname === '/api/site-settings') return json(res, { googleLoginEnabled: false, registrationMode: 'email_and_google' });
  if (url.pathname.startsWith('/api/')) return json(res, {});

  const requested = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (requested.startsWith(root + path.sep) && fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    res.writeHead(200, { 'content-type': mime[path.extname(requested)] || 'application/octet-stream' });
    return fs.createReadStream(requested).pipe(res);
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  return res.end(shell({ assetBase: mounted ? '/workspace/' : '/' }));
}

async function waitFor(win, expression, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  const state = await win.webContents.executeJavaScript("({ path: location.pathname + location.search, text: document.body.innerText.slice(0, 700), inputs: [...document.querySelectorAll('input')].map(el => el.value) })");
  throw new Error('Timed out: ' + label + ' ' + JSON.stringify(state));
}

async function clickText(win, selector, text) {
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim().includes(${JSON.stringify(text)}) && el.getBoundingClientRect().width > 0);
    if (!target) return false; target.click(); return true;
  })()`);
  assert.ok(clicked, 'Missing control: ' + text);
}

async function setInput(win, selector, value) {
  await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Input not found');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

function contrast(first, second) {
  const luminance = (color) => {
    const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => x / 255).map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const a = luminance(first); const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function makeWindow(url, width, height, theme, mode) {
  const win = new BrowserWindow({ width, height, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('[web-ui renderer]', event.message);
  });
  await win.loadURL(url);
  await win.webContents.executeJavaScript(`localStorage.setItem('app-theme-preference', ${JSON.stringify(theme)}); localStorage.setItem('longpost_workspace_mode', ${JSON.stringify(mode)});`);
  await win.loadURL(url);
  await waitFor(win, "document.querySelector('.home-entry h3')?.textContent.includes('写作')", 'home content');
  return win;
}

async function runDesktop(url) {
  const win = await makeWindow(url, 1440, 900, 'light', 'pro');
  console.log('[web-ui] Checking timeline and contrast…');
  const colors = await win.webContents.executeJavaScript(`({
    bg: getComputedStyle(document.querySelector('.home-page')).backgroundColor,
    title: getComputedStyle(document.querySelector('.home-entry h3')).color,
    excerpt: getComputedStyle(document.querySelector('.home-entry h3 + p')).color
  })`);
  assert.ok(contrast(colors.title, colors.bg) >= 4.5, 'Light title contrast');
  assert.ok(contrast(colors.excerpt, colors.bg) >= 4.5, 'Light excerpt contrast');

  await clickText(win, '.home-tabs button', '热门');
  await waitFor(win, "document.querySelector('.home-entry h3')?.textContent.includes('热门专题')", 'hot timeline');
  await clickText(win, '.home-tabs button', '全部');
  await waitFor(win, "document.querySelector('.home-entry h3')?.textContent.includes('写作')", 'timeline reload');
  await clickText(win, '.home-tabs button', '关注');
  await waitFor(win, "document.body.textContent.includes('登录后查看关注动态')", 'following login prompt');
  assert.equal(await win.webContents.executeJavaScript("document.body.textContent.includes('这里还没有内容')"), false);
  await clickText(win, '.home-tabs button', '全部');

  console.log('[web-ui] Checking workspace mode…');
  await clickText(win, 'button', '极简');
  await waitFor(win, "document.documentElement.dataset.workspaceMode === 'lite' && !!document.querySelector('.apple-dock')", 'lite shell');
  await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', altKey: true, bubbles: true }))");
  await waitFor(win, "document.documentElement.dataset.workspaceMode === 'pro' && !!document.querySelector('aside')", 'single shortcut switch');

  console.log('[web-ui] Checking search…');
  await win.webContents.executeJavaScript("[...document.querySelectorAll('a[href=\"/search\"]')].find(el => el.getBoundingClientRect().width > 0).click()");
  const search = 'input[aria-label="搜索帖子、用户和话题"]';
  await waitFor(win, `document.querySelector(${JSON.stringify(search)})`, 'search page');
  await setInput(win, search, '慢'); await sleep(400);
  await setInput(win, search, '快');
  await waitFor(win, "document.body.textContent.includes('最新的结果')", 'latest search result');
  await sleep(1600);
  assert.equal(await win.webContents.executeJavaScript("document.body.textContent.includes('较慢的结果')"), false, 'Older search must not replace newer result');
  assert.equal(searchCounts.get('快'), 1, 'Updating the URL must not repeat a successful search');
  await setInput(win, search, '失败');
  await waitFor(win, "document.body.textContent.includes('搜索暂时不可用')", 'search error');
  await clickText(win, 'button', '重试');
  await waitFor(win, "document.body.textContent.includes('恢复后的结果')", 'search retry');

  console.log('[web-ui] Checking reader and command palette…');
  await win.webContents.executeJavaScript("document.querySelector('a[href=\"/article/article-ui\"]').click()");
  await waitFor(win, "document.querySelector('article h1')?.textContent.includes('写作')", 'article page');
  await win.webContents.executeJavaScript('window.history.back()');
  await waitFor(win, `document.querySelector(${JSON.stringify(search)})?.value === '失败' && document.body.textContent.includes('恢复后的结果')`, 'search history restoration');
  await win.webContents.executeJavaScript("document.querySelector('a[href=\"/article/article-ui\"]').click()");
  await waitFor(win, "document.querySelector('article h1')?.textContent.includes('写作')", 'return to article');
  const before = await win.webContents.executeJavaScript("parseFloat(getComputedStyle(document.querySelector('.article-editorial-text')).fontSize)");
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"增大字号\"]').click()");
  await waitFor(win, `parseFloat(getComputedStyle(document.querySelector('.article-editorial-text')).fontSize) > ${before}`, 'reader font size');
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"切换为深色主题\"]').click()");
  await waitFor(win, "document.documentElement.classList.contains('dark')", 'reader dark theme');
  await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))");
  await waitFor(win, "document.querySelector('[role=dialog][aria-label=\"全局命令面板\"]')", 'command palette');
  assert.equal(await win.webContents.executeJavaScript("document.body.textContent.includes('当前: 深色模式')"), true, 'Theme controls must agree');
  await clickText(win, '[role=dialog] button', '切换主题');
  await waitFor(win, "document.documentElement.classList.contains('light-mode')", 'palette light theme');

  await win.webContents.executeJavaScript("document.querySelector('button[title^=\"全局命令面板\"]').focus(); document.querySelector('button[title^=\"全局命令面板\"]').click()");
  await waitFor(win, "document.querySelector('input[aria-label=\"搜索命令\"]')", 'command search');
  await setInput(win, 'input[aria-label="搜索命令"]', '没有这个命令');
  await waitFor(win, "document.body.textContent.includes('未匹配到相关指令')", 'empty command results');
  await win.webContents.executeJavaScript("document.querySelector('input[aria-label=\"搜索命令\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(win, "!document.querySelector('[role=dialog][aria-label=\"全局命令面板\"]')", 'escape closes empty palette');
  await waitFor(win, "document.activeElement?.getAttribute('title')?.startsWith('全局命令面板')", 'restore focus after closing palette');

  console.log('[web-ui] Checking direct post link…');
  // A pasted share URL must load the built CSS and scripts at this deep path.
  await win.loadURL(url + '/post/post-ui');
  await waitFor(win, "document.querySelector('article')?.textContent.includes('好的工具')", 'direct post link');
  assert.equal(await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('article')).display"), 'block');
  await win.webContents.executeJavaScript("document.querySelector('button[aria-label=\"分享\"]').click()");
  await waitFor(win, "document.querySelector('input[aria-label=\"分享链接\"]')", 'share dialog');
  assert.ok((await win.webContents.executeJavaScript("document.querySelector('input[aria-label=\"分享链接\"]').value")).endsWith('/post/post-ui'));
  await win.loadURL(url + '/article/article-ui');
  await waitFor(win, "document.querySelector('article h1')?.textContent.includes('写作')", 'direct article link');

  console.log('[web-ui] Checking secondary pages in light theme…');
  await win.loadURL(url + '/user/author-ui/followers');
  await waitFor(win, "document.querySelector('a[href=\"/user/author-ui\"]')?.textContent.includes('林间')", 'accessible follower link');
  const followerColors = await win.webContents.executeJavaScript(`({
    bg: getComputedStyle(document.querySelector('#root > div')).backgroundColor,
    text: getComputedStyle(document.querySelector('a[href="/user/author-ui"] .text-foreground')).color
  })`);
  assert.ok(contrast(followerColors.text, followerColors.bg) >= 4.5, 'Follower text contrast');
  await win.loadURL(url + '/hashtag/writing');
  await waitFor(win, "document.body.textContent.includes('好的工具')", 'hashtag timeline');
  await win.loadURL(url + '/messages');
  await waitFor(win, "document.body.textContent.includes('登录后查看私信')", 'messages login prompt');
  const messageColors = await win.webContents.executeJavaScript(`({
    bg: getComputedStyle(document.querySelector('#root > div')).backgroundColor,
    text: getComputedStyle([...document.querySelectorAll('h2')].find(el => el.textContent.includes('登录后查看私信'))).color
  })`);
  assert.ok(contrast(messageColors.text, messageColors.bg) >= 4.5, 'Messages text contrast');
  await win.loadURL(url + '/privacy');
  await waitFor(win, "document.querySelector('h1')?.textContent.includes('隐私政策')", 'privacy page');
  const legalColors = await win.webContents.executeJavaScript(`({
    bg: getComputedStyle(document.querySelector('#root > div')).backgroundColor,
    text: getComputedStyle(document.querySelector('h1')).color
  })`);
  assert.ok(contrast(legalColors.text, legalColors.bg) >= 4.5, 'Privacy heading contrast');
  win.destroy();
  console.log('[web-ui] Desktop: themes, navigation, search, reader, sharing and secondary pages passed.');
}

async function runDark(url) {
  const win = await makeWindow(url, 1440, 900, 'dark', 'pro');
  const colors = await win.webContents.executeJavaScript(`({
    bg: getComputedStyle(document.querySelector('.home-page')).backgroundColor,
    title: getComputedStyle(document.querySelector('.home-entry h3')).color,
    excerpt: getComputedStyle(document.querySelector('.home-entry h3 + p')).color
  })`);
  assert.ok(contrast(colors.title, colors.bg) >= 4.5, 'Dark title contrast');
  assert.ok(contrast(colors.excerpt, colors.bg) >= 4.5, 'Dark excerpt contrast');
  win.destroy();
  console.log('[web-ui] Dark theme: text contrast passed.');
}

async function runMounted(url) {
  const win = new BrowserWindow({ width: 1280, height: 900, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await win.loadURL(url + '/workspace/post/post-ui');
  await waitFor(win, "document.querySelector('article')?.textContent.includes('好的工具')", 'mounted post link');
  await win.webContents.executeJavaScript("document.querySelector('button[aria-label=\"分享\"]').click()");
  await waitFor(win, "document.querySelector('input[aria-label=\"分享链接\"]')", 'mounted share dialog');
  const share = await win.webContents.executeJavaScript("document.querySelector('input[aria-label=\"分享链接\"]').value");
  assert.equal(share, url + '/workspace/post/post-ui', 'Share URL must retain the mount path');
  await win.loadURL(url + '/workspace/article/article-ui');
  await waitFor(win, "document.querySelector('article h1')?.textContent.includes('写作')", 'mounted article link');
  win.destroy();
  console.log('[web-ui] Subdirectory: assets, routes, API and share URL passed.');
}

async function runMobile(url, width) {
  const win = await makeWindow(url, width, 844, 'light', 'pro');
  const info = await win.webContents.executeJavaScript(`(() => {
    const nav = [...document.querySelectorAll('nav[aria-label="主导航"]')].find(el => getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().width > 0);
    const buttons = [...nav.querySelectorAll('a')].map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
    return { width: innerWidth, scroll: document.documentElement.scrollWidth, buttons };
  })()`);
  assert.ok(info.scroll <= info.width + 1, `${width}px page overflows horizontally`);
  assert.ok(info.buttons.every((item) => item.width >= 43 && item.height >= 43), `${width}px navigation target is too small`);
  await clickText(win, '.home-heading button', '极简');
  await waitFor(win, "document.documentElement.dataset.workspaceMode === 'lite'", 'mobile mode switch');
  await clickText(win, '.home-heading button', '专业');
  await waitFor(win, "document.documentElement.dataset.workspaceMode === 'pro'", 'mobile mode switch back');
  win.destroy();
  console.log(`[web-ui] Mobile ${width}px: layout, touch targets and mode switch passed.`);
}

app.whenReady().then(async () => {
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    await runDesktop(url);
    await runDark(url);
    await runMounted(url);
    await runMobile(url, 320);
    await runMobile(url, 390);
    server.close(); app.exit(0);
  } catch (error) {
    console.error('[web-ui] FAIL:', error && error.stack ? error.stack : error);
    server.close(); app.exit(1);
  }
});
