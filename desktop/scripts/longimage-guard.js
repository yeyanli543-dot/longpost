/**
 * 长图导出的静态护栏（D1 回归）。
 *
 * 背景：html-to-image 默认按元素的「可见盒子」出图，而 #preview 是 overflow:auto 的
 * 滚动容器 —— 可见高度只有一屏，长文会被导成一张只有一屏的废图（实测 3009px 的文章
 * 导出 990×1510，去掉 height 传参后实测 970×1510）。修法是显式把 scrollWidth/scrollHeight
 * 传给 toPng，并用 style 把克隆节点的高度解开。
 *
 * 这条护栏只做静态检查（能在纯 Node 的两条流水线里跑，CI 不跑 electron）。
 * 真正「出图后量尺寸 + 找末行墨迹」的运行时那半边在 scripts/ui-scenario.js 里，
 * 由 npm run verify:ui 跑。
 *
 * 用法：
 *   const guard = require('./longimage-guard');
 *   for (const c of guard.checkLongImage(rendererDir)) ...   // c = { label, ok, detail }
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function checkLongImage(rendererDir) {
  const out = [];
  const push = (label, ok, detail) => out.push({ label, ok: !!ok, detail: detail || '' });

  let src = '';
  try {
    src = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  } catch (err) {
    push('能读到 renderer/app.js', false, String(err.message));
    return out;
  }

  const fnStart = src.indexOf('async function exportLongImage');
  const fnEnd = fnStart > 0 ? src.indexOf('\n  async function', fnStart + 10) : -1;
  const fn = fnStart > 0 ? src.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000) : '';
  push('能定位 exportLongImage()', fn.length > 200, '长度 ' + fn.length);
  if (!fn) return out;

  const call = /htmlToImage\.toPng\(\s*([A-Za-z0-9_$.]+)\s*,([\s\S]*?)\}\)/.exec(fn);
  push('exportLongImage 里调用了 htmlToImage.toPng', !!call, '没找到 toPng 调用');
  const opts = call ? call[2] : '';
  // style:{ height: ... } 里也有个 height:，先剥掉再查顶层，否则「顶层没传 height」会被
  // style 里那个 height 顶替成假绿（负向测试抓到过这个假绿）。
  const top = opts.replace(/style\s*:\s*\{[^{}]*\}/g, '');

  push('toPng 显式传了 width', /(^|[\s,{])width\s*:/.test(top), '没传 width，横向内容会被裁');
  push('toPng 显式传了 height', /(^|[\s,{])height\s*:/.test(top), '没传 height —— 这就是「只导一屏」的旧毛病');

  const wVar = /const\s+([A-Za-z0-9_$]+)\s*=\s*[^\n;]*scrollWidth[^\n;]*;/.exec(fn);
  const hVar = /const\s+([A-Za-z0-9_$]+)\s*=\s*[^\n;]*scrollHeight[^\n;]*;/.exec(fn);
  push('宽度变量取自 scrollWidth', !!wVar, '没有由 scrollWidth 算出来的宽度变量');
  push('高度变量取自 scrollHeight（不是 clientHeight）', !!hVar, '没有由 scrollHeight 算出来的高度变量');
  push(
    'toPng 的 width/height 用的就是从 scroll* 算出来的那两个变量',
    !!(wVar && hVar) &&
      new RegExp('width\\s*:\\s*' + wVar[1] + '\\b').test(top) &&
      new RegExp('height\\s*:\\s*' + hVar[1] + '\\b').test(top),
    '传进去的不是 scroll 派生变量' + (wVar ? '（宽=' + wVar[1] + '）' : '') + (hVar ? '（高=' + hVar[1] + '）' : ''),
  );
  push(
    'toPng 用 style 把克隆节点的高度解开（maxHeight + overflow）',
    /maxHeight\s*:\s*'(none|unset)'/.test(opts) && /overflow\s*:\s*'visible'/.test(opts),
    '缺 style:{height, maxHeight, overflow} —— 图会变高，但内容只铺满第一屏，下半张全白',
  );
  push('导出仍是 2 倍图（pixelRatio: 2）', /pixelRatio\s*:\s*2\b/.test(opts), 'pixelRatio 不是 2');

  // 运行时那半边：ui-scenario.js 里必须保留断言，而且必须抛错
  // （main.js 只把「抛错」当失败，返回 FAIL 字符串它只打印不判负）。
  try {
    const sc = fs.readFileSync(path.join(rendererDir, '..', 'scripts', 'ui-scenario.js'), 'utf8');
    push(
      'ui-scenario.js 仍带长图导出的运行时回归断言',
      /导出长图/.test(sc) && /naturalHeight/.test(sc) && /naturalWidth/.test(sc),
      '运行时断言被删了：静态检查只能保证「参数写着」，保证不了「真的出图了」',
    );
    push(
      '运行时断言失败时是抛错',
      /throw new Error\(\s*'D1 长图导出回归/.test(sc),
      '必须是 throw —— 否则自检会「红了但退出码还是 0」',
    );
    push(
      '运行时断言含空带 + 末段墨迹检查',
      /blankBands/.test(sc) && /tailInk/.test(sc),
      '缺空带/末段墨迹检查，抓不到「图高了但下半张全白」和「整张空白」',
    );
  } catch (err) {
    push('能读到 scripts/ui-scenario.js', false, String(err.message));
  }

  return out;
}

module.exports = { checkLongImage };
