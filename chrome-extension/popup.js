const send = (onlySelection) =>
  chrome.runtime.sendMessage({ type: 'save-current', onlySelection: Boolean(onlySelection) });

document.getElementById('savePage').addEventListener('click', () => { send(false); window.close(); });
document.getElementById('saveSelection').addEventListener('click', () => { send(true); window.close(); });

chrome.storage.local.get(['pairing']).then((data) => {
  const hint = document.getElementById('hint');
  hint.textContent = data.pairing ? '已配对' : '还没配对：点扩展设置粘贴配对码';
});
