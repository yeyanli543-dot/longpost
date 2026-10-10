/**
 * 独立复现探针：P1（贴底抽屉 footer 被底栏遮挡导致误触发）与 P2（标题被折叠策略挤扁），
 * 顺带复核 D3（桌面工具条溢出）。
 *
 * 本脚本由收口复核方编写，独立于产出方的自评。
 * 它不启动 main.js，而是自己起一个本地 HTTP 静态服务把 renderer 喂给一个 show:false 的
 * 离屏窗口（file:// 会被 CSP 拦内联脚本、opaque origin 下 IndexedDB 被禁），
 * 再用 executeJavaScript 驱动界面、用 elementFromPoint 做命中测试。
 *
 * 用法：
 *   xvfb-run -a npx electron scripts/probe-layout.js --mode=p1 --out=<dir> [--shot] [--label=now] [--renderer=<dir>]
 *   xvfb-run -a npx electron scripts/probe-layout.js --mode=p2 --w=1100 --out=<dir> [--shot] [--label=d1100]
 *   xvfb-run -a npx electron scripts/probe-layout.js --mode=all --out=<dir> [--shot]
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

const arg = (k) => {
  const a = process.argv.find((x) => x.startsWith('--' + k + '='));
  return a ? a.slice(k.length + 3) : null;
};
const num = (k, d) => {
  const v = arg(k);
  return v === null ? d : Number(v);
};
const RENDERER = arg('renderer') || path.join(__dirname, '..', 'renderer');
const OUT = path.resolve(arg('out') || path.join(__dirname, '..', '.verify', 'probe'));
fs.mkdirSync(OUT, { recursive: true });
const LABEL = arg('label') || 'now';
const MODE = arg('mode') || 'all';
const SHOT = process.argv.includes('--shot');
const ASSERT = process.argv.includes('--assert');
const W = num('w', 1320);
const H = num('h', 880);
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lp-p1p2-')));

// 默认行为是「最后一个窗口关掉就退出」；probe 要在一个进程里连开多个尺寸的窗口，
// 必须把这个默认行为按住，否则 P1 跑完 destroy 掉窗口时进程就直接退了（P2 根本不执行）。
app.on('window-all-closed', () => {});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// 每个窗口一份静态服务 + 一个离屏窗口
async function makeWindow(width, height, rendererDir) {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]) || '/index.html';
    const f = path.normalize(path.join(rendererDir, rel === '/' ? '/index.html' : rel));
    if (!f.startsWith(rendererDir)) return void res.writeHead(403).end('no');
    fs.readFile(f, (e, b) => {
      if (e) return void res.writeHead(404).end('404');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(b);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    backgroundColor: '#0b1220',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: undefined },
  });
  // 同一个进程里连开多个窗口时偶发 ERR_FAILED(-2)（上一个窗口刚 destroy，新窗口抢跑），重试即可
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await win.loadURL(url);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  if (lastErr) throw lastErr;
  await new Promise((r) => setTimeout(r, 2600));
  return { win, srv };
}

/**
 * 渲染层公共助手。
 * settle()：窄屏 .dialog 有 `animation: sheet-in`（from{translateY(100%)}，无 fill-mode）。
 * 离屏窗口里合成动画可能停住不动，量出来抽屉整体下移——那是仪器假象。
 * 所以提供两种量法：raw（不动动画）与 settled（finish 到终帧），两者都报，谁对看截图。
 */
const PRE = `
const $=(id)=>document.getElementById(id);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const desc=(el)=>el?(el.id?'#'+el.id:(el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.split(' ')[0]:''))):null;
const isVisible=(el)=>{ if(!el) return false; const b=el.getBoundingClientRect(); if(b.width<=1||b.height<=1) return false;
  if(el.hidden) return false; const cs=getComputedStyle(el); return cs.visibility!=='hidden' && cs.display!=='none' && Number(cs.opacity||1)>0.01; };
const finishAnims=()=>{ [].slice.call(document.querySelectorAll('*')).forEach(el=>{ let as=[]; try{ as=el.getAnimations?el.getAnimations():[]; }catch(e){ return; } as.forEach(a=>{ try{ a.finish(); }catch(e){} }); }); document.body.offsetHeight; };
const rectOf=(el)=>{ const b=el.getBoundingClientRect(); return {x:+b.left.toFixed(1),y:+b.top.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)}; };
const hitAt=(x,y)=>{ const h=document.elementFromPoint(x,y); return {el:desc(h),node:h}; };
const hitOf=(el)=>{ const b=el.getBoundingClientRect(); const cx=Math.round(b.left+b.width/2), cy=Math.round(b.top+b.height/2);
  const h=document.elementFromPoint(cx,cy);
  return { cx, cy, hit:desc(h), isSelf: !!(h && (h===el||el.contains(h))), rect:[Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)],
    inVp: b.top>=-1 && b.bottom<=innerHeight+1 && b.left>=-1 && b.right<=innerWidth+1 }; };
const openModals=()=>[].slice.call(document.querySelectorAll('.modal')).filter(m=>!m.hidden).map(m=>m.id);
const closeAll=async()=>{ for(let i=0;i<10;i++){ const ms=[].slice.call(document.querySelectorAll('.modal')).filter(m=>!m.hidden); if(!ms.length) break;
  finishAnims();
  for(const m of ms){ const b=m.querySelector('.dialog-close,[data-close]') || [].slice.call(m.querySelectorAll('button')).find(e=>/完成|关闭|取消/.test(e.textContent||''));
    if(b){ try{b.click();}catch(e){} } else { m.hidden=true; } }
  await sleep(260); } return openModals(); };
const openByBtn=async(id)=>{ const b0=$(id); if(!b0) return null;
  let b=b0;
  if(!isVisible(b)){ const tl=$('tabList'); if(tl){ tl.click(); await sleep(750); finishAnims(); b=$(id); } }
  if(!isVisible(b)) return null; b.click(); await sleep(800); return 'btn:'+id; };
const openByMenu=async(re)=>{ const b=$('btnMore'); if(!b||!isVisible(b)) return null; b.click(); await sleep(520);
  const it=[].slice.call(document.querySelectorAll('.menu-item,[role=menuitem]')).find(el=>re.test(el.textContent||''));
  if(!it){ document.body.click(); await sleep(200); return null; } it.click(); await sleep(750); return 'menu:'+String(re); };
const openAny=async(btnId,re)=>(btnId?await openByBtn(btnId):null)||(await openByMenu(re));
`;

const evOf = (win) => (code) => win.webContents.executeJavaScript('(async()=>{' + PRE + code + '})()', true);

// ---------------------------------------------------------------- P1
const DRAWERS = [
  ['settingsModal', 'tabSettings', /设置/],
  ['tagsModal', 'btnTags', /给文章打标签|标签/],
  ['trashModal', 'btnTrash', /^\s*回收站\s*$/],
  ['chartModal', null, /插入图表/],
  ['historyModal', null, /历史版本/],
  ['shareModal', null, /分享这一篇/],
  ['statsModal', null, /文章统计/],
];

async function runP1(rendererDir, shotDir) {
  const { win, srv } = await makeWindow(390, 844, rendererDir);
  const ev = evOf(win);
  // 造一篇有内容的文章，保证历史版本/统计/分享有东西可显示
  await ev(`
    $('btnNew').click(); await sleep(1000);
    if($('title')){ $('title').value='收口复核样张'; $('title').dispatchEvent(new Event('input',{bubbles:true})); }
    if($('editor')){ $('editor').value='# 一\\n\\n'+'正文段落。'.repeat(40)+'\\n\\n## 二\\n\\n'+'更多内容。'.repeat(40)+'\\n\\n## 三\\n\\n结尾一段。'; $('editor').dispatchEvent(new Event('input',{bubbles:true})); }
    await sleep(1700); return true;`);

  const tabbar = await ev(`finishAnims(); const nav=$('tabbar'); const r=rectOf(nav);
    return { top:r.y, h:r.h, bottom:r.bottom, z:getComputedStyle(nav).zIndex, vpH:innerHeight, vpW:innerWidth,
      modalZ:(()=>{const m=$('settingsModal'); return getComputedStyle(m).zIndex;})(),
      tabbarHVars:(()=>{const v=getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim(); return v;})(),
      modalPadBottom:(()=>{const m=$('settingsModal'); return getComputedStyle(m).paddingBottom;})(),
      dialogMaxH:(()=>{const d=$('settingsModal').querySelector('.dialog'); return getComputedStyle(d).maxHeight;})(),
      tabRect:(()=>{const t=$('tabList'); return rectOf(t);})() };`);

  const out = { label: LABEL, kind: 'p1', viewport: { w: tabbar.vpW, h: tabbar.vpH }, tabbar, drawers: {} };

  for (const [id, btnId, re] of DRAWERS) {
    // 每次先回到编辑器视图（点「列表」后工具条/「更多」会藏起来，菜单入口就点不到了）
    await ev(`
      const te=$('tabEdit'); if(te){ te.click(); await sleep(700); }
      if($('app').dataset.view!=='editor' && $('tabEdit')){ $('tabEdit').click(); await sleep(500); }
      const cl = await closeAll(); return { view:$('app').dataset.view, openNow:cl };`);
    // raw：不动动画（检验「离屏窗口里动画会停住」这个仪器说法是否成立）
    const raw = await ev(`
      const opened = await openAny(${JSON.stringify(btnId)}, ${re});
      await sleep(650);
      const m = $(${JSON.stringify(id)});
      if(!m || m.hidden) return { opened, open:false, openNow:openModals() };
      const dlg = m.querySelector('.dialog') || m;
      return { opened, open:true, gapRaw: +(($('tabbar').getBoundingClientRect().top) - dlg.getBoundingClientRect().bottom).toFixed(1),
        dlgTopRaw: +dlg.getBoundingClientRect().top.toFixed(1), dlgBottomRaw: +dlg.getBoundingClientRect().bottom.toFixed(1) };`);
    // settled：finish 动画后做完整命中测试
    const rec = await ev(`
      const m = $(${JSON.stringify(id)});
      if(!m || m.hidden) return { opened:'none', ok:false, openNow:openModals() };
      finishAnims(); await sleep(120);
      const dlg = m.querySelector('.dialog') || m;
      const foot = m.querySelector('.dialog-foot');
      const btns = [].slice.call(m.querySelectorAll('button')).filter(isVisible).map(el=>({
        id: el.id || String(el.className).split(' ')[0], txt: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,14), ...hitOf(el) }));
      const dr = rectOf(dlg); const tb = rectOf($('tabbar'));
      const footBtn = foot ? [].slice.call(foot.querySelectorAll('button')).filter(isVisible).map(el=>({id:el.id, ...hitOf(el)})) : [];
      const tabs = ['tabList','tabEdit','tabOutline','tabSettings'].filter(t=>$(t)).map(t=>({ id:t, ...hitOf($(t)) }));
      return { ok:true, openNow:openModals(),
        dlg:{...dr, cw:dlg.clientWidth, sw:dlg.scrollWidth, maxH:getComputedStyle(dlg).maxHeight},
        foot: foot?rectOf(foot):null, tabbarTop:tb.y,
        gap: +(tb.y - dr.bottom).toFixed(1), overlap: +Math.max(0, tb.y < dr.bottom ? dr.bottom - tb.y : 0).toFixed(1),
        btns, footBtn, tabs };`);
    // 抽屉内容滚到底后，被卷走的那批按钮还能不能命中自己（证明「出视口」只是可滚动内容，不是被挡住）
    const scrolled = await ev(`
      const m = $(${JSON.stringify(id)});
      if(!m || m.hidden) return null;
      const body = m.querySelector('.dialog-body');
      const scroll = body ? { clientH:body.clientHeight, scrollH:body.scrollHeight, canScroll: body.scrollHeight>body.clientHeight+1 } : null;
      if(body){ body.scrollTop = body.scrollHeight; await sleep(320); }
      finishAnims(); await sleep(120);
      const btns = [].slice.call(m.querySelectorAll('button')).filter(isVisible).map(el=>({
        id: el.id || String(el.className).split(' ')[0], ...hitOf(el) }));
      const foot = m.querySelector('.dialog-foot');
      const footBtn = foot ? [].slice.call(foot.querySelectorAll('button')).filter(isVisible).map(el=>({id:el.id, ...hitOf(el)})) : [];
      return { scroll, btns, footBtn };`);
    out.drawers[id] = { ...rec, raw, scrolled };
    if (SHOT && rec.ok) {
      await ev('return true;');
      await win.webContents.capturePage();
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(shotDir, 'p1-' + LABEL + '-' + id + '.png'), img.toPNG());
    }
    // 点「列表」是否先把抽屉收起来（每个抽屉都测）
    const afterTapTab = await ev(`
      const before = openModals();
      const t=$('tabList'); if(t){ t.click(); } await sleep(900); finishAnims();
      return { openBefore:before, openAfter:openModals(), view:$('app').dataset.view, tabListOn:$('tabList').classList.contains('on') };`);
    out.drawers[id].afterTapTab = afterTapTab;
    if (SHOT && afterTapTab.openAfter.length) {
      await ev('return true;');
      await win.webContents.capturePage();
      const im = await win.webContents.capturePage();
      fs.writeFileSync(path.join(shotDir, 'p1-' + LABEL + '-' + id + '-afterswitch-stillopen.png'), im.toPNG());
    }
  }

  // 后果级测试：在设置抽屉「完成」按钮中心真打一次鼠标点击
  await ev('const te=$("tabEdit"); if(te){te.click(); await sleep(600);} await closeAll(); return true;');
  const cons = await ev(`
    await openByBtn('tabSettings'); await sleep(650); finishAnims(); await sleep(120);
    const m=$('settingsModal'); if(m.hidden) return { error:'设置抽屉没打开' };
    const ok=$('settingsOk'); const b=ok.getBoundingClientRect();
    const cx=Math.round(b.left+b.width/2), cy=Math.round(b.top+b.height/2);
    const h=document.elementFromPoint(cx,cy);
    return { cx, cy, hit:desc(h), isSelf:!!(h===ok||ok.contains(h)),
      rect:[Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)],
      before:{ view:$('app').dataset.view, open:openModals() } };`);
  if (!cons.error) {
    await win.webContents.sendInputEvent({ type: 'mouseDown', x: cons.cx, y: cons.cy, button: 'left', clickCount: 1 });
    await win.webContents.sendInputEvent({ type: 'mouseUp', x: cons.cx, y: cons.cy, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 1000));
    cons.after = await ev('return { view:$("app").dataset.view, open:openModals(), tabListOn:$("tabList").classList.contains("on"), tabOutlineOn:$("tabOutline").classList.contains("on") };');
    out.drawers.settingsClickConsequence = cons;
  } else {
    out.drawers.settingsClickConsequence = cons;
  }
  fs.writeFileSync(path.join(OUT, 'probe-p1-' + LABEL + '.json'), JSON.stringify(out, null, 1));
  win.destroy();
  srv.close();
  return out;
}

// ---------------------------------------------------------------- P2 / D3
const TITLE_TEXT = '回归核对样张测试标题'; // 10 字

const MEASURE = `
  const title=$('title'), tools=document.querySelector('.tools'), tb=document.querySelector('.toolbar');
  const t=rectOf(title);
  const cs=getComputedStyle(title);
  const cv=document.createElement('canvas').getContext('2d');
  cv.font=(cs.fontWeight||'400')+' '+cs.fontSize+' '+(cs.fontFamily||'sans-serif');
  const per=cv.measureText('回').width;
  const full=cv.measureText(title.value).width;
  const padL=parseFloat(cs.paddingLeft)||0, padR=parseFloat(cs.paddingRight)||0;
  const usable=t.w-padL-padR;
  const folded=[].slice.call(document.querySelectorAll('.tools .btn.folded')).map(b=>b.id||'?');
  const visibleTools=[].slice.call(document.querySelectorAll('.tools .btn')).filter(b=>b.getBoundingClientRect().width>0).length;
  const more=$('btnMore'); const mr=more?more.getBoundingClientRect():null;
  const __m = { vp:{w:innerWidth,h:innerHeight},
    title:{ ...t, cw:title.clientWidth, sw:title.scrollWidth, minW:cs.minWidth,
      clipped: title.clientWidth+1 < title.scrollWidth, value:title.value,
      perChar:+per.toFixed(2), fullTextW:+full.toFixed(1),
      fitChars:Math.floor(usable/per), showsFull: title.clientWidth+1>=title.scrollWidth },
    toolsBox: tools?{...rectOf(tools), cw:tools.clientWidth, sw:tools.scrollWidth, overflow: tools.scrollWidth-tools.clientWidth}:null,
    toolbarBox: tb?{...rectOf(tb), cw:tb.clientWidth, sw:tb.scrollWidth, overflow: tb.scrollWidth-tb.clientWidth}:null,
    toolbarOverflowing: tb?tb.classList.contains('overflowing'):null,
    docOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)-innerWidth,
    folded, visibleTools,
    more: mr?{left:+mr.left.toFixed(1),right:+mr.right.toFixed(1),inVp: mr.left>=-1 && mr.right<=innerWidth+1}:null };`;

async function runP2(rendererDir, width, height, shotDir) {
  const { win, srv } = await makeWindow(width, height, rendererDir);
  const ev = evOf(win);
  const empty = await ev(MEASURE + 'return {phase:"empty", ...__m};');
  await ev(`
    $('btnNew').click(); await sleep(950);
    if($('title')){ $('title').value=${JSON.stringify(TITLE_TEXT)}; $('title').dispatchEvent(new Event('input',{bubbles:true})); }
    if($('editor')){ $('editor').value='# 回归核对\\n\\n'+'这是一段用来核对版面的正文。'.repeat(24); $('editor').dispatchEvent(new Event('input',{bubbles:true})); }
    await sleep(1500); return true;`);
  const editor = await ev(MEASURE + 'return {phase:"editor", ...__m};');
  const outline = await ev('const b=$("btnOutline"); if(b) b.click(); await sleep(900);' + MEASURE + 'return {phase:"outline", ...__m};');
  if (SHOT) {
    await win.webContents.capturePage();
    for (const [ph, name] of [['empty', 'empty'], ['editor', 'editor'], ['outline', 'outline']]) {
      const im = await win.webContents.capturePage();
      fs.writeFileSync(path.join(shotDir, `p2-${LABEL}-${name}.png`), im.toPNG());
    }
  }
  const res = { label: LABEL, kind: 'p2', W: width, H: height, TITLE_TEXT, empty, editor, outline };
  fs.writeFileSync(path.join(OUT, 'probe-p2-' + LABEL + '.json'), JSON.stringify(res, null, 1));
  win.destroy();
  srv.close();
  return res;
}

app.whenReady().then(async () => {
  let p1 = null;
  const p2s = [];
  try {
    if (MODE === 'p1' || MODE === 'all') {
      const o = await runP1(RENDERER, OUT);
      p1 = o;
      console.log('=== P1 视口 ' + o.viewport.w + 'x' + o.viewport.h + ' ===');
      console.log('  底栏 top=' + o.tabbar.top + ' h=' + o.tabbar.h + ' z=' + o.tabbar.z + ' | modal z=' + o.tabbar.modalZ +
        ' | --tabbar-h=' + o.tabbar.tabbarHVars + ' | .modal padding-bottom=' + o.tabbar.modalPadBottom + ' | .dialog max-height=' + o.tabbar.dialogMaxH);
      for (const [id, r] of Object.entries(o.drawers)) {
        if (id === 'settingsClickConsequence') {
          if (r.error) { console.log('  [后果] ' + r.error); continue; }
          console.log('  [后果] 设置抽屉「完成」中心 (' + r.cx + ',' + r.cy + ') 真点一下：命中=' + r.hit + ' isSelf=' + r.isSelf +
            ' | 点前 open=' + JSON.stringify(r.before.open) + ' view=' + r.before.view +
            ' | 点后 open=' + JSON.stringify(r.after.open) + ' view=' + r.after.view + ' tabOutline悬停=' + r.after.tabOutlineOn +
            (r.isSelf && r.after.open.length === 0 && r.after.view === r.before.view ? '  ✓ 点到了自己且行为正确' : '  ✗'));
          continue;
        }
        if (!r.ok) { console.log('  ' + id.padEnd(14) + ' 打开失败 openNow=' + JSON.stringify(r.openNow)); continue; }
        const bad = r.btns.filter((b) => !b.isSelf);
        const off = r.btns.filter((b) => !b.inVp);
        const tabBad = r.tabs.filter((t) => !t.isSelf);
        const badAfterScroll = r.scrolled ? r.scrolled.btns.filter((b) => !b.isSelf) : [];
        const footBad = r.scrolled ? r.scrolled.footBtn.filter((b) => !b.isSelf) : r.footBtn.filter((b) => !b.isSelf);
        console.log('  ' + id.padEnd(14) + ' 打开=' + String(r.raw.opened).padEnd(20) +
          ' 命中自己=' + (r.btns.length - bad.length) + '/' + r.btns.length + '（出视口' + off.length + '，滚到底后不中=' + badAfterScroll.length + '）' +
          ' 抽屉底↔底栏上沿=' + (r.gap >= 0 ? '+' : '') + r.gap + 'px(raw ' + (r.raw.gapRaw >= 0 ? '+' : '') + r.raw.gapRaw + ',重叠' + r.overlap + ')' +
          ' footer按钮命中自己=' + ((r.footBtn.length) - footBad.length) + '/' + r.footBtn.length +
          ' 底栏4项命中自己=' + (r.tabs.length - tabBad.length) + '/' + r.tabs.length +
          ' 点「列表」后抽屉=' + (r.afterTapTab.openAfter.length ? '仍开' + JSON.stringify(r.afterTapTab.openAfter) : '已关') + '/view=' + r.afterTapTab.view +
          (bad.length ? ' 【被接走】' + JSON.stringify(bad.map((b) => (b.id || b.txt) + '->' + b.hit)) : ''));
      }
    }
    if (MODE === 'p2' || MODE === 'all') {
      const widths = MODE === 'all' ? [1320, 1280, 1100, 940] : [W];
      for (const w of widths) {
        const r = await runP2(RENDERER, w, H, OUT);
        p2s.push(r);
        console.log('=== P2 宽度 ' + w + ' ===');
        for (const ph of ['empty', 'editor', 'outline']) {
          const o = r[ph];
          console.log('  ' + ph.padEnd(7) + ' 标题 w=' + o.title.w + ' cw=' + o.title.cw + ' sw=' + o.title.sw + ' minW=' + o.title.minW +
            ' 单字=' + o.title.perChar + 'px 可显≈' + o.title.fitChars + '字' + (o.title.clipped ? ' 【被裁】' : ' 不裁') +
            (o.title.showsFull ? '（整串放得下）' : '') +
            ' | 工具条内部溢出=' + (o.toolsBox ? o.toolsBox.overflow : 'n/a') + ' 文档横向溢出=' + o.docOverflowX +
            ' overflowing=' + o.toolbarOverflowing + ' 可见按钮=' + o.visibleTools + ' 折叠=[' + o.folded.join(',') + ']' +
            ' | 更多=' + (o.more ? o.more.left + '–' + o.more.right + ' 在视口内=' + o.more.inVp : '无'));
        }
      }
    }
  } catch (err) {
    console.log('PROBE_ERROR ' + String(err && err.stack ? err.stack : err));
    app.exit(3);
    return;
  }
  if (ASSERT) {
    const fails = [];
    const ok = (cond, msg) => { if (!cond) fails.push(msg); };
    if (p1) {
      const vp = p1.viewport;
      for (const [id, r] of Object.entries(p1.drawers)) {
        if (id === 'settingsClickConsequence') { ok(!r.error, '后果测试无法执行：' + r.error); continue; }
        ok(r.ok, 'P1 ' + id + ' 用真实入口打不开（openNow=' + JSON.stringify(r.openNow) + '）');
        if (!r.ok) continue;
        const obscured = r.btns.filter((b) => b.cx >= 0 && b.cx <= vp.w && b.cy >= 0 && b.cy <= vp.h && !b.isSelf);
        ok(obscured.length === 0, 'P1 ' + id + ' 有屏幕内按钮被接走：' + JSON.stringify(obscured.map((b) => (b.id || b.txt) + '->' + b.hit)));
        ok(r.footBtn.every((b) => b.isSelf), 'P1 ' + id + ' footer 按钮没命中自己：' + JSON.stringify(r.footBtn.filter((b) => !b.isSelf).map((b) => b.id + '->' + b.hit)));
        ok(r.gap >= -1, 'P1 ' + id + ' 抽屉底边低于底栏上沿（gap=' + r.gap + '）');
        ok(r.overlap <= 0, 'P1 ' + id + ' 抽屉与底栏重叠 ' + r.overlap + 'px');
      }
      const c = p1.drawers.settingsClickConsequence;
      if (c && !c.error) {
        ok(c.isSelf, 'P1 设置抽屉「完成」中心点命中的是 ' + c.hit + '（不是自己）');
        ok(c.after.open.length === 0, 'P1 点「完成」后设置抽屉没关：' + JSON.stringify(c.after.open));
        ok(c.after.view === c.before.view, 'P1 点「完成」把视图从 ' + c.before.view + ' 改成了 ' + c.after.view);
      }
    }
    if (p2s) {
      for (const r of p2s) {
        for (const ph of ['editor', 'outline']) {
          const o = r[ph];
          ok(o.title.cw >= 140, 'P2 ' + r.W + 'px/' + ph + ' 标题被挤到 ' + o.title.cw + 'px（下限 140）');
          ok(o.toolsBox && o.toolsBox.overflow === 0, 'P2/D3 ' + r.W + 'px/' + ph + ' 工具条内部溢出 ' + (o.toolsBox && o.toolsBox.overflow));
          ok(o.docOverflowX === 0, 'P2/D3 ' + r.W + 'px/' + ph + ' 文档横向溢出 ' + o.docOverflowX);
          ok(!!(o.more && o.more.inVp), 'P2/D3 ' + r.W + 'px/' + ph + ' 「更多」不在视口内');
        }
      }
    }
    console.log('\n===== --assert 判定 =====');
    if (fails.length) {
      console.log('PROBE_ASSERT_FAIL ' + fails.length + ' 项：');
      for (const f of fails) console.log('  ✗ ' + f);
      app.exit(1);
      return;
    }
    console.log('PROBE_ASSERT_OK 全部通过');
  }
  app.exit(0);
});
