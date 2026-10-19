function valid(code) {
  const parts = String(code || '').trim().split(':');
  return parts.length === 3 && parts[0] === 'lp1' && /^\d+$/.test(parts[1]) && parts[2].length >= 16;
}

chrome.storage.local.get(['pairing', 'defaultTags']).then((data) => {
  if (data.pairing) document.getElementById('pairing').value = data.pairing;
  if (data.defaultTags) document.getElementById('defaultTags').value = data.defaultTags;
});

document.getElementById('save').addEventListener('click', async () => {
  const code = document.getElementById('pairing').value.trim();
  const status = document.getElementById('status');
  if (!valid(code)) {
    status.textContent = '配对码格式不对，应以 lp1: 开头';
    return;
  }
  await chrome.storage.local.set({ pairing: code, defaultTags: document.getElementById('defaultTags').value.trim() });
  status.textContent = '已保存';
});
