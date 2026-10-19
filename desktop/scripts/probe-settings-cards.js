(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  if ($('editorWrap').hidden) { $('btnNew').click(); await wait(900); }
  $('btnSettings').click();
  await wait(600);
  const cards = Array.from(document.querySelectorAll('#settingsModal .settings-card'));
  const titles = cards.map((c) => (c.querySelector('.sc-title') || {}).textContent || '');
  const sw = $('clipBridgeSwitch');
  const swVisible = sw ? sw.getBoundingClientRect().width > 0 : false;
  return '卡片数=' + cards.length + ' | 标题=' + titles.join('/') + ' | 桥开关可见=' + swVisible;
})();
