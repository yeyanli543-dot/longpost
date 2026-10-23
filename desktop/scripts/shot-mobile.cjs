/**
 * 手机视口截图 + 遮挡检测。
 * 用无 preload 的窗口加载 renderer，等价于 Capacitor 环境（走 web fallback）。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, '..', '.verify');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 390,
    height: 844,
    webPreferences: { offscreen: true, sandbox: true, zoomFactor: 1 },
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  const shots = [
    ['m1-list', "document.getElementById('app').dataset.view = 'list'", 600],
    ['m2-editor', "document.getElementById('btnNew').click()", 900],
    ['m3-settings', "document.getElementById('btnSettings').click()", 700],
  ];

  for (const [name, code, wait] of shots) {
    await win.webContents.executeJavaScript(code).catch(() => {});
    await new Promise((r) => setTimeout(r, wait));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 390, height: 844 });
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  }

  // 遮挡检测：找出可视区域内互相重叠的「固定层」
  const report = await win.webContents.executeJavaScript(`(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sels = ['#tabBar', '.dock', '.side-foot', '#statusbar', '#ambientBar', '#toolsBar', '#formatBar', '.dialog-foot', '#toast'];
    const rects = [];
    document.querySelectorAll('body *').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'sticky') return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (s.visibility === 'hidden' || s.display === 'none') return;
      rects.push({
        sel: (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.'),
        top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
        z: s.zIndex,
      });
    });
    return { vw, vh, rects };
  })()`);

  console.log('VIEWPORT', JSON.stringify({ w: report.vw, h: report.vh }));
  for (const r of report.rects) console.log('FIXED', JSON.stringify(r));

  app.quit();
});
