/**
 * LongPost 剪藏扩展（MV3 service worker）
 *
 * 提取策略（按优先级）：
 *   1. 用户有选区 -> 用选区（最可靠，canvas 应用也能拿到）
 *   2. 常见正文容器（article / main / [role=main] / 已知正文 class）
 *   3. 打分挑块：按「文字量 / 链接文字量 / 段落数」综合评分，避开导航与侧栏
 *   4. 整页 innerText 兜底
 *
 * canvas 类应用（Google Docs / Figma / 在线 PPT）DOM 里没有正文，
 * 这时明确告诉用户「请先全选复制」，而不是给一篇空文章。
 */

const MENU_PAGE = 'lp-save-page';
const MENU_SELECTION = 'lp-save-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_PAGE, title: '保存到 LongPost', contexts: ['page', 'action'] });
  chrome.contextMenus.create({ id: MENU_SELECTION, title: '保存选区到 LongPost', contexts: ['selection'] });
});

async function getConfig() {
  const data = await chrome.storage.local.get(['pairing', 'defaultTags']);
  if (!data.pairing) return null;
  const parts = String(data.pairing).split(':');
  if (parts.length !== 3 || Number.isNaN(Number(parts[1]))) return null;
  return { port: Number(parts[1]), token: parts[2], tags: data.defaultTags || '' };
}

/**
 * 在页面里跑：抽取标题、正文、选中文字。
 * 注意：这个函数会被序列化后注入目标页面，不能引用外部变量。
 */
function extractPageData(onlySelection) {
  var selection = String(window.getSelection ? window.getSelection() : '').trim();

  function textOf(el) {
    if (!el) return '';
    return String(el.innerText || el.textContent || '');
  }

  /** 去掉导航 / 广告 / 评论等样板区的文字量 */
  function isBoilerplate(el) {
    var tag = (el.tagName || '').toLowerCase();
    if (['nav', 'header', 'footer', 'aside', 'form', 'noscript'].indexOf(tag) >= 0) return true;
    var role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'navigation' || role === 'banner' || role === 'complementary') return true;
    var cls = String(el.className || '').toLowerCase();
    return /(^|\s)(nav|menu|sidebar|footer|header|comment|share|related|advert|ads?)(\s|$)/.test(cls);
  }

  /** 打分：正文多、链接少、段落多者胜 */
  function scoreOf(el) {
    var text = textOf(el).trim();
    if (text.length < 80) return -1;

    var linkChars = 0;
    var links = el.querySelectorAll ? el.querySelectorAll('a') : [];
    for (var i = 0; i < links.length; i += 1) linkChars += textOf(links[i]).length;

    var paragraphs = el.querySelectorAll ? el.querySelectorAll('p, li, h1, h2, h3, blockquote, pre').length : 0;
    var linkRatio = text.length ? linkChars / text.length : 0;

    return text.length * (1 - linkRatio) + paragraphs * 25;
  }

  /** 用段落重建正文，保留可读结构 */
  function rebuild(el) {
    var nodes = el.querySelectorAll ? el.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,td') : [];
    if (!nodes.length) return textOf(el).trim();

    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (isBoilerplate(node)) continue;
      var t = textOf(node).trim();
      if (!t) continue;
      var tag = node.tagName.toLowerCase();
      if (tag === 'h1') out.push('# ' + t);
      else if (tag === 'h2') out.push('## ' + t);
      else if (tag === 'h3' || tag === 'h4') out.push('### ' + t);
      else if (tag === 'li') out.push('- ' + t);
      else if (tag === 'blockquote') out.push('> ' + t);
      else if (tag === 'pre') out.push('\u0060\u0060\u0060\n' + t + '\n\u0060\u0060\u0060');
      else out.push(t);
    }
    return out.join('\n\n').trim();
  }

  var canvasApp = /^(docs|slides|sheets)\.google\.com$/.test(location.hostname) ||
    Boolean(document.querySelector('canvas') && textOf(document.body).trim().length < 400);

  if (onlySelection) {
    return { title: document.title, url: location.href, content: '', selection: selection, canvasApp: canvasApp };
  }

  var best = null;
  var bestScore = -1;

  var known = document.querySelector('article, main, [role="main"], .markdown-body, .post-content, .article-content, .doc-content, .kix-page');
  if (known) {
    best = known;
    bestScore = scoreOf(known);
  }

  var blocks = document.body ? document.body.querySelectorAll('div,section,article,main') : [];
  for (var j = 0; j < blocks.length; j += 1) {
    var el = blocks[j];
    if (isBoilerplate(el)) continue;
    var s = scoreOf(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }

  var content = best ? rebuild(best) : '';
  if (content.length < 200) {
    content = textOf(document.body).trim();
  }

  return {
    title: document.title,
    url: location.href,
    content: content,
    selection: selection,
    canvasApp: canvasApp,
  };
}

function notify(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: 'LongPost',
    message: message,
  });
}

async function postClip(config, payload) {
  if (config.tags) payload.tags = config.tags;
  try {
    const res = await fetch('http://127.0.0.1:' + config.port + '/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LongPost-Token': config.token },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (error) {
    return false;
  }
}

async function saveToLongPost(tabId, onlySelection, clipboardText) {
  const config = await getConfig();
  if (!config) {
    notify('还没配对：请在扩展选项里粘贴配对码');
    return;
  }

  let payload;

  if (clipboardText) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    payload = {
      title: (tab && tab.title) || '剪贴板内容',
      url: (tab && tab.url && /^https?:/.test(tab.url)) ? tab.url : '',
      content: clipboardText,
      selection: '',
    };
  } else {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageData,
      args: [Boolean(onlySelection)],
    });
    payload = injection && injection.result;
  }

  if (!payload) return;

  const body = String(payload.content || payload.selection || '').trim();

  if (!body && payload.canvasApp) {
    notify('这个页面用 canvas 渲染，取不到文字。请全选复制后，用扩展的「从剪贴板保存」');
    return;
  }

  const ok = await postClip(config, payload);
  if (!ok) {
    notify('连不上 LongPost：请确认桌面端已打开并开启本地桥');
    return;
  }

  const short = body.length < 200;
  notify(short
    ? '已保存，但只取到 ' + body.length + ' 字。这个页面可能要手动全选复制'
    : '已保存（' + body.length + ' 字）到 LongPost');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id === undefined) return;
  if (info.menuItemId === MENU_PAGE) saveToLongPost(tab.id, false);
  if (info.menuItemId === MENU_SELECTION) saveToLongPost(tab.id, true);
});

async function fetchRecent() {
  const config = await getConfig();
  if (!config) return [];
  try {
    const res = await fetch('http://127.0.0.1:' + config.port + '/recent', {
      headers: { 'X-LongPost-Token': config.token },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    return [];
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'get-recent') {
    fetchRecent().then((items) => sendResponse({ ok: true, items: items })).catch(() => sendResponse({ ok: false, items: [] }));
    return true;
  }
  if (message && message.type === 'save-current') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab && tab.id !== undefined) saveToLongPost(tab.id, Boolean(message.onlySelection));
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message && message.type === 'save-clipboard') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs && tabs[0];
      if (tab && tab.id !== undefined) {
        await saveToLongPost(tab.id, false, String(message.text || ''));
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
