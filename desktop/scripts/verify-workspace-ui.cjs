/**
 * Real renderer checks at narrow widths, with isolated IndexedDB partitions.
 * Run with: cd desktop && npx electron scripts/verify-workspace-ui.cjs
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../renderer');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-workspace-ui-')));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function serve(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filename = path.resolve(root, '.' + relative);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(filename)] || 'application/octet-stream' });
    res.end(content);
  });
}

async function waitFor(win, expression, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error('Timed out: ' + label);
}

async function checkWidth(url, width) {
  const win = new BrowserWindow({ width, height: 844, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, partition: 'ui-' + width } });
  await win.loadURL(url);
  await waitFor(win, "document.querySelector('#list [data-act=\"new-article\"]')", 'workspace initialization');
  await win.webContents.executeJavaScript("document.getElementById('btnNew').click()");
  await waitFor(win, "!document.getElementById('editorWrap').hidden", 'new article');
  await sleep(500);

  const geometry = await win.webContents.executeJavaScript(`(() => {
    const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { width:r.width, height:r.height, left:r.left, right:r.right }; };
    const bar = document.querySelector('.toolbar');
    return { viewport:innerWidth, overflow:document.documentElement.scrollWidth-innerWidth, barOverflow:bar.scrollWidth-bar.clientWidth,
      title:rect('title'), more:rect('btnMore'), mode:rect('btnModeSwitchMobile'),
      tabs:['tabList','tabEdit','tabOutline','tabSettings'].map(rect),
      visibleTools:[...document.querySelectorAll('.tools .btn')].filter(el=>el.getBoundingClientRect().width>0).map(el=>el.id) };
  })()`);
  assert.ok(geometry.overflow <= 1, `${width}px document overflows horizontally`);
  assert.ok(geometry.barOverflow <= 2, `${width}px toolbar overflows`);
  assert.ok(geometry.title.width >= 80, `${width}px title is too narrow: ${geometry.title.width}`);
  assert.ok(geometry.more.width >= 43 && geometry.more.right <= geometry.viewport + 1, `${width}px more button is inaccessible`);
  assert.ok(geometry.tabs.every((item) => item.width >= 43 && item.height >= 43), `${width}px navigation target is too small`);
  assert.ok(geometry.visibleTools.length <= 3, `${width}px has too many top actions`);
  if (geometry.mode.width > 0) assert.ok(geometry.mode.width >= 43 && geometry.mode.height >= 43, `${width}px mode target is too small`);

  await win.webContents.executeJavaScript("document.getElementById('tabOutline').click()");
  await waitFor(win, "!document.getElementById('outlinePanel').hidden", 'outline');
  await win.webContents.executeJavaScript("document.getElementById('tabSettings').click()");
  await waitFor(win, "!document.getElementById('settingsModal').hidden && document.getElementById('outlinePanel').hidden", 'settings replaces outline');
  const hit = await win.webContents.executeJavaScript(`(() => {
    const el=document.getElementById('settingsOk'); const r=el.getBoundingClientRect();
    const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return !!target && (target===el || el.contains(target));
  })()`);
  assert.ok(hit, `${width}px settings action is obscured`);

  await win.webContents.executeJavaScript("document.querySelector('#themeSwitch [data-key=\"light\"]').click()");
  await waitFor(win, "document.documentElement.dataset.theme === 'light'", 'light theme');
  await win.webContents.executeJavaScript("document.querySelector('#skinSwitch [data-key=\"argon\"]').click()");
  await waitFor(win, "document.body.classList.contains('skin-argon')", 'skin selection');
  await win.webContents.executeJavaScript("document.querySelector('#skinSwitch [data-key=\"classic\"]').click()");
  await waitFor(win, "!document.body.classList.contains('skin-argon')", 'classic skin');
  await win.webContents.executeJavaScript("const el=document.getElementById('setFontSize'); el.value='20'; el.dispatchEvent(new Event('input',{bubbles:true}));");
  await waitFor(win, "getComputedStyle(document.getElementById('editor')).fontSize === '20px'", 'editor font size');
  await win.webContents.executeJavaScript("document.querySelector('#modeSwitch [data-key=\"pro\"]').click()");
  await waitFor(win, "document.documentElement.dataset.workspaceMode === 'pro'", 'professional mode');
  await win.webContents.executeJavaScript("document.getElementById('settingsOk').click()");
  await waitFor(win, "document.getElementById('settingsModal').hidden", 'close settings');
  await sleep(500);
  const pro = await win.webContents.executeJavaScript(`(() => ({
    font:getComputedStyle(document.getElementById('editor')).fontSize,
    status:getComputedStyle(document.querySelector('.statusbar')).display,
    tools:[...document.querySelectorAll('.tools .btn')].filter(el=>el.getBoundingClientRect().width>0).map(el=>el.id)
  }))()`);
  assert.equal(pro.font, '20px', 'Font preference must work in professional mode');
  assert.notEqual(pro.status, 'none', 'Save status must be visible');
  assert.ok(pro.tools.length <= 3 && pro.tools.includes('btnMore'), `${width}px professional toolbar is crowded`);
  const codeSample = '```js\nconst count = 1 + 2;\n```';
  await win.webContents.executeJavaScript(`(() => { const editor = document.getElementById('editor'); editor.value = ${JSON.stringify(codeSample)}; editor.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await waitFor(win, "document.querySelector('.preview pre.code-block .token.operator')", 'highlighted code');
  const operatorBg = await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.preview pre.code-block .token.operator')).backgroundColor");
  assert.equal(operatorBg, 'rgba(0, 0, 0, 0)', 'Code operators must not have an opaque light-theme background');
  win.destroy();
  console.log(`[workspace-ui] ${width}px: layout, controls, theme, font and mode passed.`);
}

app.whenReady().then(async () => {
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const width of [320, 360, 390, 768]) await checkWidth(url, width);
    server.close(); app.exit(0);
  } catch (error) {
    console.error('[workspace-ui] FAIL:', error && error.stack ? error.stack : error);
    server.close(); app.exit(1);
  }
});
