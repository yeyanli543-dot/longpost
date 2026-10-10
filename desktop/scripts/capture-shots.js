/**
 * 截图驱动（复核用）：把一个尺寸下的多个界面状态各截一张，交给复核人逐张看。
 * 与 probe-layout.js 同一套离屏窗口手法（本地 HTTP 静态服务 + show:false + capturePage）。
 *
 *   xvfb-run -a -s "-screen 0 1920x1200x24" npx electron scripts/capture-shots.js \
 *     --w=1320 --h=880 --kind=desktop --label=d1320 --out=<dir>
 *   xvfb-run -a -s "-screen 0 1920x1200x24" npx electron scripts/capture-shots.js \
 *     --w=390 --h=844 --kind=mobile --label=m390 --out=<dir>
 *
 * 截图前先 discard 一帧（capturePage() 在离屏窗口里会拿上一帧）。
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const num = (k, d) => { const v = arg(k); return v === null ? d : Number(v); };
const RENDERER = arg('renderer') || path.join(__dirname, '..', 'renderer');
const OUT = path.resolve(arg('out') || path.join(__dirname, '..', '.verify', 'shots'));
fs.mkdirSync(OUT, { recursive: true });
const LABEL = arg('label') || 'shot';
const KIND = arg('kind') || 'desktop';
const W = num('w', 1320);
const H = num('h', 880);
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lp-shot-')));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// 一篇把渲染增强全用上的正文：Prism 代码块 / KaTeX 行内+块级 / 表格 / 任务清单 / 脚注
const RICH = [
  '# 渲染增强核对',
  '',
  '普通段落，行内公式 $E = mc^2$，还有**加粗**与 `行内代码`。',
  '',
  '$$',
  '\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
  '$$',
  '',
  '```js',
  'const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));',
  'console.log(fib(10)); // 55',
  '```',
  '',
  '| 指标 | 数值 |',
  '| --- | ---: |',
  '| 字数 | 1234 |',
  '| 图表 | 2 |',
  '',
  '- [x] 已完成的任务',
  '- [ ] 未完成的任务',
  '',
  '脚注引用[^1]。',
  '',
  '[^1]: 这是脚注正文。',
  '',
  '## 第二节',
  '',
  '结尾一段，用来核对长图。',
].join('\n');

async function main() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]) || '/index.html';
    const f = path.normalize(path.join(RENDERER, rel === '/' ? '/index.html' : rel));
    if (!f.startsWith(RENDERER)) return void res.writeHead(403).end('no');
    fs.readFile(f, (e, b) => {
      if (e) return void res.writeHead(404).end('404');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(b);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: false, backgroundColor: '#0b1220',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  for (let i = 0, e = null; i < 4; i += 1) { try { await win.loadURL(url); e = null; break; } catch (err) { e = err; await new Promise((r) => setTimeout(r, 600 * (i + 1))); } if (i === 3 && e) throw e; }
  await new Promise((r) => setTimeout(r, 2600));

  const PRE = `const $=(id)=>document.getElementById(id);const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const finishAnims=()=>{ [].slice.call(document.querySelectorAll('*')).forEach(el=>{ let as=[]; try{as=el.getAnimations?el.getAnimations():[];}catch(e){return;} as.forEach(a=>{try{a.finish();}catch(e){}}); }); document.body.offsetHeight; };
    const vis=(el)=>{ if(!el) return false; const b=el.getBoundingClientRect(); return b.width>1&&b.height>1&&!el.hidden; };
    const isNarrowNow=()=>{ try{ return document.getElementById('app').dataset.view!==undefined && window.matchMedia('(max-width: 760px)').matches; }catch(e){ return window.matchMedia('(max-width: 760px)').matches; } };
    const closeAnyModal=()=>{ ['settingsModal','chartModal','longImageModal','tagsModal','trashModal','historyModal','shareModal','statsModal'].forEach(id=>{ const m=document.getElementById(id); if(m&&!m.hidden){ const b=m.querySelector('.icon-btn[aria-label=\"关闭\"]'); if(b) b.click(); } }); };
    const clickIf=(id)=>{ const b=$(id); if(b&&vis(b)){ b.click(); return true; } return false; };`;
  const ev = (c) => win.webContents.executeJavaScript('(async()=>{' + PRE + c + '})()', true);

  const shots = [];
  const shot = async (name) => {
    await ev('await sleep(120); return true;');
    await win.webContents.capturePage(); // discard：离屏窗口里第一帧可能是上一帧
    const img = await win.webContents.capturePage();
    const p = path.join(OUT, `${LABEL}-${name}.png`);
    fs.writeFileSync(p, img.toPNG());
    const size = img.getSize();
    shots.push({ name, file: p, w: size.width, h: size.height });
    console.log('    · ' + name.padEnd(22) + size.width + 'x' + size.height + '  ' + p);
  };

  // 1) 空态 / 初始列表
  await shot('list-empty');

  // 2) 造一篇富内容文章
  await ev(`
    $('btnNew').click(); await sleep(1100);
    if($('title')){ $('title').value='渲染增强核对样张'; $('title').dispatchEvent(new Event('input',{bubbles:true})); }
    if($('editor')){ $('editor').value=${JSON.stringify(RICH)}; $('editor').dispatchEvent(new Event('input',{bubbles:true})); }
    await sleep(2000); finishAnims(); return true;`);
  await shot('editor');

  // 3) 增强渲染：切到预览（手机是 panePreview，桌面直接看右侧预览）
  if (KIND === 'mobile') {
    await ev('clickIf("panePreview"); await sleep(1600); finishAnims(); return true;');
    await shot('preview-enhanced');
    await ev('clickIf("paneWrite"); await sleep(900); finishAnims(); return true;');
  } else {
    await ev('await sleep(400); return true;');
    await shot('editor-preview-side');
  }

  // 4) 大纲（手机走底栏 tabOutline；桌面优先工具条 btnOutline，被折叠时走「更多 → 正文大纲」）
  const OPEN_OUTLINE = `
    const btn=(isNarrowNow()?$('tabOutline'):$('btnOutline'));
    if(btn && vis(btn)){ btn.click(); }
    else { clickIf('btnMore'); await sleep(700);
      const it=[].slice.call(document.querySelectorAll('.menu-item,[role=menuitem]')).find(el=>/正文大纲/.test(el.textContent||''));
      if(it) it.click(); }
    await sleep(1400); finishAnims(); return true;`;
  const CLOSE_OUTLINE = `
    const panel=$('outlinePanel');
    if(panel && !panel.hidden){ const btn=(isNarrowNow()?$('tabOutline'):$('btnOutline'));
      if(btn && vis(btn)){ btn.click(); } else { const x=panel.querySelector('.icon-btn'); if(x) x.click(); } }
    await sleep(900); finishAnims(); return true;`;
  await ev(OPEN_OUTLINE);
  await shot('outline');
  await ev(CLOSE_OUTLINE);

  if (KIND === 'mobile') {
    // 5) 「更多」菜单抽屉
    await ev('clickIf("btnMore"); await sleep(900); finishAnims(); return true;');
    await shot('drawer-more');
    await ev('document.body.click(); await sleep(600); closeAnyModal(); await sleep(400); finishAnims(); return true;');

    // 6) 插入图表抽屉（贴底抽屉的典型样本）
    await ev(`
      clickIf('btnMore'); await sleep(700);
      const it=[].slice.call(document.querySelectorAll('.menu-item,[role=menuitem]')).find(el=>/插入图表/.test(el.textContent||''));
      if(it){ it.click(); await sleep(1100); } finishAnims(); return true;`);
    await shot('drawer-chart');
    await ev(`
      closeAnyModal(); await sleep(800); finishAnims(); return true;`);

    // 7) 设置抽屉（P1 的主角）
    await ev('clickIf("tabSettings"); await sleep(1200); finishAnims(); return true;');
    await shot('drawer-settings');
    await ev(`
      const body=$('settingsModal').querySelector('.dialog-body'); if(body){ body.scrollTop=body.scrollHeight; await sleep(500); }
      finishAnims(); return true;`);
    await shot('drawer-settings-bottom');
    await ev('clickIf("settingsOk"); await sleep(700); closeAnyModal(); await sleep(500); finishAnims(); return true;');

    // 8) 长图导出（真实入口：更多 → 导出长图）
    await ev(`
      clickIf('btnMore'); await sleep(700);
      const it=[].slice.call(document.querySelectorAll('.menu-item,[role=menuitem]')).find(el=>/导出长图/.test(el.textContent||''));
      if(it){ it.click(); await sleep(6000); } finishAnims(); return true;`);
    await shot('longimage-export');
    await ev('closeAnyModal(); await sleep(800); finishAnims(); return true;');

    // 9) 回到列表（多篇）
    await ev('clickIf("tabList"); await sleep(1200); finishAnims(); return true;');
    await shot('list');
  } else {
    // 桌面：对照 / 预览三态靠 btnPreview 切，不再另截
    await ev('await sleep(300); return true;');
  }

  fs.writeFileSync(path.join(OUT, `${LABEL}-shots.json`), JSON.stringify({ label: LABEL, kind: KIND, w: W, h: H, shots }, null, 1));
  console.log('  共 ' + shots.length + ' 张 → ' + OUT);
  win.destroy();
  srv.close();
  app.exit(0);
}

app.whenReady().then(() => main().catch((err) => {
  console.log('CAPTURE_ERROR ' + String(err && err.stack ? err.stack : err));
  app.exit(3);
}));
