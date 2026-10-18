/**
 * LongPost 剪藏扩展（MV3 service worker）
 *
 * 三条入口：
 *   1. 右键菜单「保存到 LongPost」；
 *   2. 工具栏按钮的弹窗；
 *   3. 只保存选区（右键子菜单）。
 *
 * 正文提取在页面里执行，不用第三方库：优先 article/main，
 * 没有就取文字量最大的容器，避免把导航栏当成正文。
 */

const MENU_PAGE = 'lp-save-page';
const MENU_SELECTION = 'lp-save-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_PAGE, title: '保存到 LongPost', contexts: ['page', 'action'] });
  chrome.contextMenus.create({ id: MENU_SELECTION, title: '保存选区到 LongPost', contexts: ['selection'] });
});

async function getConfig() {
  const data = await chrome.storage.local.get(['pairing']);
  if (!data.pairing) return null;
  const parts = String(data.pairing).split(':');
  if (parts.length !== 3 || Number.isNaN(Number(parts[1]))) return null;
  return { port: Number(parts[1]), token: parts[2] };
}

/** 在页面里跑：抽出标题、正文、选中文字 */
function extractPageData(onlySelection) {
  const selection = String(window.getSelection ? window.getSelection() : '').trim();

  function textOf(el) {
    return el ? String(el.innerText || '').trim() : '';
  }

  if (onlySelection) {
    return { title: document.title, url: location.href, content: '', selection: selection };
  }

  const candidates = [
    document.querySelector('article'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.querySelector('.post-content, .article-content, .markdown-body'),
  ].filter(Boolean);

  let best = '';
  for (const el of candidates) {
    const text = textOf(el);
    if (text.length > best.length) best = text;
  }

  if (best.length < 200) {
    // 兜底：找文字最多的那个块
    let max = 0;
    for (const el of document.body ? document.body.querySelectorAll('div,section') : []) {
      const len = textOf(el).length;
      if (len > max) {
        max = len;
        best = textOf(el);
      }
    }
  }

  return {
    title: document.title,
    url: location.href,
    content: best || textOf(document.body),
    selection: selection,
  };
}

async function saveToLongPost(tabId, onlySelection) {
  const config = await getConfig();
  if (!config) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'LongPost',
      message: '还没配对：请在扩展选项里粘贴配对码',
    });
    return;
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageData,
    args: [Boolean(onlySelection)],
  });

  const payload = injection && injection.result;
  if (!payload) return;

  try {
    const res = await fetch('http://127.0.0.1:' + config.port + '/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LongPost-Token': config.token },
      body: JSON.stringify(payload),
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'LongPost',
      message: res.ok ? '已保存到 LongPost' : '保存失败（HTTP ' + res.status + '）',
    });
  } catch (error) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'LongPost',
      message: '连不上 LongPost：请确认桌面端已打开并开启本地桥',
    });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id === undefined) return;
  if (info.menuItemId === MENU_PAGE) saveToLongPost(tab.id, false);
  if (info.menuItemId === MENU_SELECTION) saveToLongPost(tab.id, true);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'save-current') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab && tab.id !== undefined) saveToLongPost(tab.id, Boolean(message.onlySelection));
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
