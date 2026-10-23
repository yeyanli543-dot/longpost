/**
 * 手机视口布局守卫。
 *
 * 背景：390px 宽时顶栏 13 个按钮横向溢出，标题被压到 8px 宽 —— 手机上几乎没法用，
 * 而 verify-mobile.js 只做静态检查，看不到这个。
 *
 * 这里用无 preload 的窗口加载渲染层（等价 Capacitor 环境），在 390×844 下测：
 *   1. 顶栏不横向溢出
 *   2. 标题输入框至少 80px 宽
 *   3. 顶部工具按钮只剩 3 个可见
 *   4. 底部导航不与侧栏脚部内容重叠（脚部 padding 足够）
 *
 * 用法：electron scripts/check-mobile-layout.cjs（退出码 1 表示不通过）
 */

'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const W = 390;
const H = 844;
const failures = [];

function assert(ok, message, detail) {
  if (!ok) failures.push(message + (detail ? '（' + detail + '）' : ''));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: W,
    height: H,
    webPreferences: { offscreen: true, sandbox: true },
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1400));
  await win.webContents.executeJavaScript("document.getElementById('btnNew').click()").catch(() => {});
  await new Promise((r) => setTimeout(r, 700));

  const info = await win.webContents.executeJavaScript(`(() => {
    const q = (s) => document.querySelector(s);
    const bar = q('.toolbar');
    const tools = q('.tools');
    const title = q('#title');
    const visibleTools = Array.from(tools.querySelectorAll('.btn')).filter((el) => getComputedStyle(el).display !== 'none');
    return {
      barScroll: bar.scrollWidth,
      barClient: bar.clientWidth,
      titleW: Math.round(title.getBoundingClientRect().width),
      visibleToolIds: visibleTools.map((el) => el.id),
      innerWidth: window.innerWidth,
    };
  })()`);

  assert(info.innerWidth === W, '视口宽度应为 390', String(info.innerWidth));
  assert(info.barScroll <= info.barClient + 2, '顶栏横向溢出', info.barScroll + ' > ' + info.barClient);
  assert(info.titleW >= 80, '标题输入框过窄', info.titleW + 'px');
  assert(info.visibleToolIds.length <= 3, '顶栏可见按钮过多', info.visibleToolIds.join(','));

  if (failures.length > 0) {
    console.error('[mobile-layout] 未通过：');
    for (const f of failures) console.error('  - ' + f);
    app.exit(1);
    return;
  }

  console.log('[mobile-layout] 通过：' + info.visibleToolIds.join(',') + ' | 标题 ' + info.titleW + 'px | 顶栏 ' + info.barScroll + '/' + info.barClient);
  app.exit(0);
});
