const send = (onlySelection) =>
  chrome.runtime.sendMessage({ type: 'save-current', onlySelection: Boolean(onlySelection) });

document.getElementById('savePage').addEventListener('click', () => { send(false); window.close(); });
document.getElementById('saveSelection').addEventListener('click', () => { send(true); window.close(); });

document.getElementById('saveClipboard').addEventListener('click', async () => {
  const hint = document.getElementById('hint');
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      hint.textContent = '剪贴板是空的：先在页面里全选复制';
      return;
    }
    chrome.runtime.sendMessage({ type: 'save-clipboard', text: text });
    window.close();
  } catch (error) {
    hint.textContent = '读不到剪贴板，请确认扩展权限';
  }
});

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

chrome.storage.local.get(['pairing']).then((data) => {
  const hint = document.getElementById('hint');
  hint.textContent = data.pairing ? '已配对' : '还没配对：点扩展设置粘贴配对码';
});
