/**
 * P1 / P2 静态回归护栏 —— 一份实现，被两处调用：
 *   · scripts/smoke-test.js  → `npm test` → .github/workflows/desktop-release.yml
 *   · scripts/verify-mobile.js → .github/workflows/android-release.yml
 *
 * 这两条流水线都只跑 node 脚本（不起界面），所以护栏只能静态读 CSS。
 * 它守的是「让修复成立的那几条不变量」，不是像素本身：
 *   P1  贴底抽屉必须整体让出底部导航的高度（否则 footer 被 #tabSettings/#tabList/#tabOutline 接走）
 *   P2  标题输入框必须有最小宽度下限，且工具条不得再用百分比上限去挤它
 * 像素级结论由 scripts/probe-layout.js（需 xvfb）负责，两者互为补充。
 *
 * 用法（Node）：const { checkLayout } = require('./layout-guard');
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** 抽出某个 @media 块的正文（按花括号配对；不做完整 CSS 解析，够用且好懂）。 */
function mediaBlock(css, header) {
  const at = css.indexOf(header);
  if (at === -1) return null;
  const open = css.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/** 抽出选择器对应的**所有**规则正文（按出现顺序；先剥注释）。 */
function ruleBodies(css, selector) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp('(^|[},])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(?:,[^{}]*)?\\{', 'gm');
  const out = [];
  let m;
  while ((m = re.exec(clean))) {
    const open = clean.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    for (let i = open; i < clean.length; i += 1) {
      if (clean[i] === '{') depth += 1;
      else if (clean[i] === '}') {
        depth -= 1;
        if (depth === 0) { out.push(clean.slice(open + 1, i)); break; }
      }
    }
    re.lastIndex = open + 1;
  }
  return out;
}

/** 抽出选择器对应的规则正文（取第一次出现）。 */
function ruleBody(css, selector) {
  const all = ruleBodies(css, selector);
  return all.length ? all[0] : null;
}

/** 取一条声明的值，例如 decl('min-width: 168px', 'min-width') → '168px'。 */
function decl(body, prop) {
  if (!body) return null;
  const re = new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;}]*)', 'm');
  const m = re.exec(body);
  return m ? m[1].trim() : null;
}

function px(v) {
  if (!v) return NaN;
  const m = /(-?\d+(?:\.\d+)?)px/.exec(v);
  return m ? Number(m[1]) : NaN;
}

/** 取一条声明的所有取值（同一属性可能写了两遍，后者覆盖前者）。 */
function declAll(body, prop) {
  if (!body) return [];
  const re = new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;}]*)', 'gm');
  const out = [];
  let m;
  while ((m = re.exec(body))) out.push(m[1].trim());
  return out;
}

/** 纯数字（z-index 这类无单位的值）。 */
function num(v) {
  if (v === null || v === undefined) return NaN;
  const m = /(-?\d+(?:\.\d+)?)/.exec(String(v));
  return m ? Number(m[1]) : NaN;
}

function checkLayout(rendererDir) {
  const out = [];
  const push = (label, ok, detail) => out.push({ label, ok: Boolean(ok), detail: detail || '' });
  const read = (f) => {
    const p = path.join(rendererDir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };
  const mobile = read('style-mobile.css');
  const main = read('style.css');

  // ---------------------------------------------------------------- P1
  const narrow = mediaBlock(mobile, '@media (max-width: 820px)');
  push('P1 style-mobile.css 存在窄屏 @media (max-width: 820px) 块', !!narrow, '找不到窄屏媒体查询，下面的断言无从谈起');

  const tabH = narrow ? decl(ruleBody(narrow, ':root'), '--tabbar-h') : null;
  const tabHPx = px(tabH);
  push('P1 窄屏定义了 --tabbar-h 且为正数', Number.isFinite(tabHPx) && tabHPx > 0, '--tabbar-h=' + String(tabH));

  // --tabbar-h 必须等于底栏真实高度（.tab 的 min-height + .tabbar 的上边框）
  const tabMin = px(decl(ruleBody(narrow || '', '.tab'), 'min-height'));
  const borderTop = decl(ruleBody(narrow || '', '.tabbar'), 'border-top');
  const borderPx = borderTop && borderTop.trim().startsWith('1px') ? 1 : NaN;
  push(
    'P1 --tabbar-h 等于 .tab(min-height) + .tabbar(上边框)',
    Number.isFinite(tabHPx) && Number.isFinite(tabMin) && Number.isFinite(borderPx) && tabHPx === tabMin + borderPx,
    '--tabbar-h=' + tabHPx + ' vs .tab min-height=' + tabMin + ' + 边框=' + borderPx,
  );

  // 底栏必须压在弹窗之上（这正是"必须让位"的原因）
  const zSheet = num(decl(ruleBody(main, ':root'), '--z-sheet'));
  const zModal = num(decl(ruleBody(main, ':root'), '--z-modal'));
  const tabbarZ = decl(ruleBody(narrow || '', '.tabbar'), 'z-index');
  const tabbarPos = decl(ruleBody(narrow || '', '.tabbar'), 'position');
  const tabbarBottom = decl(ruleBody(narrow || '', '.tabbar'), 'bottom');
  push(
    'P1 底栏 position:fixed / bottom:0 / z-index:var(--z-sheet)',
    tabbarPos === 'fixed' && tabbarBottom === '0' && /var\(--z-sheet\)/.test(tabbarZ || ''),
    'position=' + tabbarPos + ' bottom=' + tabbarBottom + ' z-index=' + tabbarZ,
  );
  push(
    'P1 --z-sheet 高于 --z-modal（底栏压在弹窗上，所以抽屉必须上移）',
    Number.isFinite(zSheet) && Number.isFinite(zModal) && zSheet > zModal,
    '--z-sheet=' + zSheet + ' --z-modal=' + zModal,
  );

  // .modal 可能被写多条规则；按层叠取「最后一条 padding / padding-bottom」判定才准
  const modalPads = [];
  for (const b of (narrow ? ruleBodies(narrow, '.modal') : [])) {
    modalPads.push(...declAll(b, 'padding-bottom'), ...declAll(b, 'padding'));
  }
  const modalPad = modalPads.length ? modalPads[modalPads.length - 1] : null;
  push(
    'P1 窄屏 .modal 的 padding-bottom 让出 var(--tabbar-h) + 安全区',
    /var\(--tabbar-h/.test(modalPad || '') && /env\(safe-area-inset-bottom\)/.test(modalPad || ''),
    '最后一条 padding 声明=' + modalPad + '（共 ' + modalPads.length + ' 条）',
  );

  // .dialog 的 max-height 写了两遍（88vh 打底 + min(88dvh, calc(...)) 覆盖）：只要有一条算了 --tabbar-h 就成立
  const dlgMaxAll = (narrow ? ruleBodies(narrow, '.dialog') : []).flatMap((b) => declAll(b, 'max-height'));
  push(
    'P1 窄屏 .dialog 的 max-height 扣掉 var(--tabbar-h)（抽屉不高于可用区）',
    dlgMaxAll.some((v) => /var\(--tabbar-h/.test(v)),
    'max-height 声明=' + JSON.stringify(dlgMaxAll),
  );

  // ---------------------------------------------------------------- P2
  const titleMin = px(decl(ruleBody(main, '.title-input'), 'min-width'));
  push(
    'P2 桌面 .title-input 有 min-width 下限（≥140px），不再被工具条压扁',
    Number.isFinite(titleMin) && titleMin >= 140,
    '.title-input min-width=' + String(decl(ruleBody(main, '.title-input'), 'min-width')),
  );

  // 扫**所有** .tools 规则，任何一条写死 max-width 都会把标题挤扁（P2 的病灶就是这个上限）
  const toolsMaxes = ruleBodies(main, '.tools').flatMap((b) => declAll(b, 'max-width'));
  push(
    'P2 桌面 .tools 不再设 max-width 上限（任何一条 .tools 规则都不许有）',
    toolsMaxes.length === 0,
    '.tools max-width=' + JSON.stringify(toolsMaxes),
  );

  push(
    'P2 renderer/*.css 里不再有 @media (max-width: 1240px) 的标题折叠断点',
    !/@media[^{]*1240\s*px/.test(mobile) && !/@media[^{]*1240\s*px/.test(main),
    'style-mobile.css 命中=' + /@media[^{]*1240\s*px/.test(mobile) + ' style.css 命中=' + /@media[^{]*1240\s*px/.test(main),
  );

  const mobileTitleMin = decl(ruleBody(narrow || '', '.title-input'), 'min-width');
  push(
    'P2 窄屏 .title-input 仍是 min-width:0（手机端保持可压缩）',
    mobileTitleMin === '0' || mobileTitleMin === '0px',
    '窄屏 .title-input min-width=' + String(mobileTitleMin),
  );

  return out;
}

module.exports = { checkLayout, mediaBlock, ruleBody, ruleBodies, decl, declAll };
