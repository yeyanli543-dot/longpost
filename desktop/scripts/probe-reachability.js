/**
 * 「折叠后还够得着吗」审计（复核用）。
 *
 * 背景：D3 的修法是——工具条放不下时按 TOOLBAR_FOLD_ORDER 给按钮加 .folded
 * （CSS = display:none），并在注释里承诺「被折叠的按钮在「更多」菜单里都有等价入口」。
 * 本探针把这个承诺变成机器可验的断言：**每一个被折叠的按钮，必须能在用户能打开的
 * 某个菜单里找到等价入口**，否则该功能在用户侧就消失了。
 *
 *   xvfb-run -a -s "-screen 0 1920x1200x24" npx electron scripts/probe-reachability.js \
 *     --w=940 --h=880 --label=d940 --out=<dir> [--assert]
 *
 * 判定模式下只要出现「被折叠且无等价入口」的功能就 app.exit(1)。
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
const flag = (k) => process.argv.includes('--' + k);
const RENDERER = arg('renderer') || path.join(__dirname, '..', 'renderer');
const OUT = path.resolve(arg('out') || path.join(__dirname, '..', '.verify'));
fs.mkdirSync(OUT, { recursive: true });
const LABEL = arg('label') || 'reach';
const W = Number(arg('w') || 1320);
const H = Number(arg('h') || 880);
const ASSERT = flag('assert');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lp-reach-')));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// 可折叠按钮 → 该功能的等价菜单文案（用户能打开的两个菜单：工具条「更多」、列表卡「…」）
const FEATURES = [
  { id: 'btnTagsEdit', name: '打标签', re: '标签' },
  { id: 'btnPin', name: '置顶', re: '置顶' },
  { id: 'btnShare', name: '分享', re: '分享' },
  { id: 'btnPreview', name: '显示/隐藏预览', re: '预览' },
  { id: 'btnReading', name: '沉浸阅读', re: '沉浸' },
  { id: 'btnOutline', name: '正文大纲', re: '大纲' },
  { id: 'btnFind', name: '查找与替换', re: '查找' },
  { id: 'btnChart', name: '插入图表', re: '图表' },
  { id: 'btnImage', name: '插入图片', re: '图片' },
  { id: 'btnFile', name: '插入附件', re: '附件' },
];

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
  for (let i = 0; i < 4; i += 1) { try { await win.loadURL(url); break; } catch (e) { if (i === 3) throw e; await new Promise((r) => setTimeout(r, 600 * (i + 1))); } }
  await new Promise((r) => setTimeout(r, 2800));

  const PRE = `
    const $=(id)=>document.getElementById(id); const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const finishAnims=()=>{ [].slice.call(document.querySelectorAll('*')).forEach(el=>{ let as=[]; try{as=el.getAnimations?el.getAnimations():[];}catch(e){return;} as.forEach(a=>{try{a.finish();}catch(e){}}); }); document.body.offsetHeight; };
    const vis=(el)=>{ if(!el) return false; const cs=getComputedStyle(el); const b=el.getBoundingClientRect();
      return cs.display!=='none' && cs.visibility!=='hidden' && b.width>1 && b.height>1; };
    const menuLabels=()=>[].slice.call(document.querySelectorAll('#ctxMenu .menu-item')).map(el=>(el.textContent||'').trim());
    const closeMenu=()=>{ const m=$('ctxMenu'); if(m && !m.hidden){ const s=document.querySelector('.scrim'); if(s) s.click();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } };`;
  const ev = (c) => win.webContents.executeJavaScript('(async()=>{' + PRE + c + '})()', true);

  // 造一篇文章，让编辑器态的工具条处于「有内容可折叠」的状态
  await ev(`$('btnNew').click(); await sleep(1100);
    if($('title')){ $('title').value='折叠可达性核对'; $('title').dispatchEvent(new Event('input',{bubbles:true})); }
    if($('editor')){ $('editor').value='# 折叠可达性\\n\\n'+'正文段落。'.repeat(40); $('editor').dispatchEvent(new Event('input',{bubbles:true})); }
    await sleep(1800); finishAnims(); return true;`);

  const features = FEATURES.map((f) => f.id);
  const res = await ev(`
    const ids=${JSON.stringify(features)};
    const out={ buttons:{}, menus:{}, };
    ids.forEach(id=>{ const el=$(id); if(!el){ out.buttons[id]={ missing:true }; return; }
      const cs=getComputedStyle(el); const b=el.getBoundingClientRect();
      out.buttons[id]={ folded: el.classList.contains('folded'), display: cs.display, visible: vis(el), w:+b.width.toFixed(1) }; });
    // 菜单①：工具条「更多」（真实入口）
    $('btnMore').click(); await sleep(700); finishAnims();
    out.menus.toolbarMore = menuLabels();
    closeMenu(); await sleep(500);
    // 菜单②：列表卡「…」（真实入口，桌面侧栏常驻 / 手机切到列表）
    if(!$('#list') || getComputedStyle($('list')).display==='none'){ const tl=$('tabList'); if(tl && vis(tl)){ tl.click(); await sleep(900); finishAnims(); } }
    const more=document.querySelector('.item-more'); let listMenu=[];
    if(more){ more.click(); await sleep(700); finishAnims(); listMenu=menuLabels(); closeMenu(); await sleep(400); }
    out.menus.listCard = listMenu;
    return out;`);

  const allLabels = [].concat(res.menus.toolbarMore || [], res.menus.listCard || []);
  const rows = FEATURES.map((f) => {
    const b = res.buttons[f.id] || {};
    const visible = Boolean(b.visible);
    const hit = allLabels.filter((l) => l.indexOf(f.re) >= 0);
    const reachable = visible || hit.length > 0;
    return { id: f.id, name: f.name, visible, folded: Boolean(b.folded), display: b.display, w: b.w, via: hit, reachable };
  });

  console.log('=== 折叠可达性 ' + LABEL + ' (' + W + 'x' + H + ') ===');
  console.log('  工具条「更多」菜单：' + JSON.stringify(res.menus.toolbarMore));
  console.log('  列表卡「…」菜单：' + JSON.stringify(res.menus.listCard));
  for (const r of rows) {
    console.log('  ' + (r.reachable ? '✓' : '✗') + ' ' + r.name.padEnd(12) + ' 按钮可见=' + r.visible + ' 折叠=' + r.folded +
      ' display=' + r.display + ' 等价入口=' + JSON.stringify(r.via) + (r.reachable ? '' : '   ← 用户侧够不着'));
  }
  const folded = rows.filter((r) => r.folded);
  const dead = rows.filter((r) => !r.reachable);
  console.log('  小结：折叠 ' + folded.length + ' 个（' + folded.map((r) => r.id).join(',') + '）；够不着的功能 ' + dead.length + ' 个（' + dead.map((r) => r.name).join(',') + '）');

  fs.writeFileSync(path.join(OUT, LABEL + '-reach.json'), JSON.stringify({ label: LABEL, w: W, h: H, menus: res.menus, rows, dead: dead.map((d) => d.name) }, null, 1));

  win.destroy();
  srv.close();
  if (ASSERT && dead.length) {
    console.log('\nPROBE_ASSERT_FAIL ' + dead.length + ' 项：');
    for (const d of dead) console.log('  ✗ 被折叠且无等价入口：' + d.name + '（#' + d.id + '）—— 该功能在当前宽度下用户点不到');
    app.exit(1);
    return;
  }
  if (ASSERT) console.log('\nPROBE_ASSERT_OK 所有功能都可到达');
  app.exit(0);
}

app.whenReady().then(() => main().catch((err) => {
  console.log('PROBE_ERROR ' + String(err && err.stack ? err.stack : err));
  app.exit(3);
}));
