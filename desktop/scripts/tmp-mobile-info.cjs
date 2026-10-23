const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { offscreen: true, sandbox: true } });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1200));
  await win.webContents.executeJavaScript("document.getElementById('btnNew').click()").catch(() => {});
  await new Promise((r) => setTimeout(r, 800));

  const info = await win.webContents.executeJavaScript(`(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => el ? (({x, y, width, height}) => ({x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height)}))(el.getBoundingClientRect()) : null;
    const bar = q('.toolbar');
    const tools = q('.tools');
    const fbar = q('.fmtbar') || q('.format-bar');
    return {
      w: window.innerWidth,
      narrow: typeof window.__lpIsNarrow === 'function' ? window.__lpIsNarrow() : 'n/a',
      bodyClass: document.body.className,
      appClass: document.getElementById('app').className,
      toolbar: rect(bar),
      toolbarScroll: bar ? bar.scrollWidth : null,
      tools: rect(tools),
      toolsScroll: tools ? tools.scrollWidth : null,
      folded: Array.from(document.querySelectorAll('.folded')).map((e) => e.id),
      title: rect(document.getElementById('title')),
      editorWrap: rect(document.getElementById('editorWrap')),
      fmt: rect(fbar),
      fmtScroll: fbar ? fbar.scrollWidth : null,
      tabbar: rect(document.getElementById('tabbar')),
      panes: rect(q('.pane-switch') || q('.panes')),
    };
  })()`);
  console.log('INFO', JSON.stringify(info, null, 1));
  app.quit();
});