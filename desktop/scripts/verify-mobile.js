/**
 * 手机版接线校验。
 *
 * 为什么单独一个脚本：桌面版的 smoke-test.js 只覆盖 Node 侧模块，而这个改动里
 * 最容易出错的恰恰是浏览器侧那一串 —— index.html 的脚本加载顺序、vendor/ 里的
 * 拷贝是否跟 lib/ 一致、Capacitor 的 webDir 指对了没有。这些错了都不会在 Node 里报错，
 * 只会表现为「装到手机上打开是白屏」，排查起来很费劲，所以在这里先卡住。
 *
 * 用法：node scripts/verify-mobile.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rendererDir = path.join(root, 'renderer');
const libDir = path.join(root, 'lib');
const mobileDir = path.join(root, '..', 'mobile');

let pass = 0;
let fail = 0;

function ok(label) {
  pass += 1;
  console.log('  ✓ ' + label);
}
function bad(label, detail) {
  fail += 1;
  console.log('  ✗ ' + label + (detail ? ' —— ' + detail : ''));
}
function check(label, condition, detail) {
  if (condition) ok(label);
  else bad(label, detail);
}

// ---------------------------------------------------------------- 1. index.html 的脚本

console.log('\n[1] index.html 引用的脚本');

const htmlPath = path.join(rendererDir, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.log('  ✗ 找不到 renderer/index.html');
  process.exit(1);
}
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptSrcs = [];
const re = /<script\s+src="([^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) scriptSrcs.push(m[1]);

check('至少引用了 5 个脚本', scriptSrcs.length >= 5, '实际 ' + scriptSrcs.length);
check(
  '没有跳出目录的引用（../）',
  scriptSrcs.every((s) => s.indexOf('..') === -1),
  scriptSrcs.filter((s) => s.indexOf('..') !== -1).join(', '),
);
check(
  '没有外部 CDN 依赖',
  scriptSrcs.every((s) => !/^https?:/.test(s)),
  scriptSrcs.filter((s) => /^https?:/.test(s)).join(', '),
);

const missing = scriptSrcs.filter((s) => !fs.existsSync(path.join(rendererDir, s)));
check('引用的脚本都存在', missing.length === 0, '缺少 ' + missing.join(', '));

console.log('    加载顺序：' + scriptSrcs.join(' → '));

// ---------------------------------------------------------------- 2. 全局变量先后顺序

console.log('\n[2] 全局变量的产生与使用顺序');

// 压缩过的第三方库（echarts 有 1.1MB，且整份挤在一行里）不参与接线检查。
// 原因：在单行超长代码上跑 /[A-Za-z0-9]*\s*=/ 这种"贪婪量词 + 失败回退"的正则，
// 每遇到一个 window. 就要把字母数字段从长到短试一遍，整体退化到 O(n²)，
// 直接把这个进程挂死（实测能卡住整条本地执行通道半小时以上）。
// echarts 也不提供任何 LP 开头的全局量，跳过它不影响检查的完整性。
const WIRING_SCAN_LIMIT = 300 * 1024;

function readWiringSource(abs) {
  try {
    if (fs.statSync(abs).size > WIRING_SCAN_LIMIT) return null;
  } catch (e) {
    return null;
  }
  return fs.readFileSync(abs, 'utf8');
}

const producers = new Map(); // 全局名 -> 第几个脚本开始提供
scriptSrcs.forEach((src, index) => {
  const code = readWiringSource(path.join(rendererDir, src));
  if (code == null) return;
  const assigned = code.match(/window\.([A-Z][A-Za-z0-9]*)\s*=/g) || [];
  for (const a of assigned) {
    const name = /window\.([A-Z][A-Za-z0-9]*)/.exec(a)[1];
    if (!producers.has(name)) producers.set(name, index);
  }
});

let orderProblem = null;
scriptSrcs.forEach((src, index) => {
  const code = readWiringSource(path.join(rendererDir, src));
  if (code == null) return;
  const mentioned = code.match(/window\.([A-Z][A-Za-z0-9]*)/g) || [];
  const own = new Set((code.match(/window\.([A-Z][A-Za-z0-9]*)\s*=/g) || []).map((a) => /window\.([A-Z][A-Za-z0-9]*)/.exec(a)[1]));
  for (const g of mentioned) {
    const name = /window\.([A-Z][A-Za-z0-9]*)/.exec(g)[1];
    if (own.has(name)) continue;
    if (!producers.has(name)) continue; // 由外部环境提供（比如 Capacitor）
    if (producers.get(name) > index) {
      orderProblem = src + ' 用了 window.' + name + '，但它由更靠后的 ' + scriptSrcs[producers.get(name)] + ' 提供';
    }
  }
});
check('没有「先用后赋值」的全局变量', !orderProblem, orderProblem || '');

for (const name of ['LPMarkdown', 'LPChart', 'LPPageStyle', 'LPOutline', 'LPRepo', 'LPIdbBackend', 'LPExportWeb', 'LPPlatform']) {
  check('全局 ' + name + ' 有来源', producers.has(name), '没有任何脚本提供它');
}

// ---------------------------------------------------------------- 3. vendor 拷贝一致性

console.log('\n[3] vendor 拷贝与 lib/ 是否一致');

const SHARED = ['markdown.js', 'chart.js', 'repo.js', 'page-style.js', 'outline.js'];
for (const name of SHARED) {
  const src = path.join(libDir, name);
  const dest = path.join(rendererDir, 'vendor', name);
  if (!fs.existsSync(dest)) {
    bad(name + ' 已同步到 vendor/', '文件不存在，先跑 node scripts/sync-vendor.js');
    continue;
  }
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dest);
  check(name + ' 已同步且字节一致', a.equals(b), '与 lib/ 不一致，重新跑 sync-vendor');
}

const echartsPath = path.join(rendererDir, 'vendor', 'echarts.min.js');
check(
  'echarts.min.js 已就位',
  fs.existsSync(echartsPath) && fs.statSync(echartsPath).size > 500 * 1024,
  '文件缺失或过小',
);

// ---------------------------------------------------------------- 4. CSP

console.log('\n[4] 内容安全策略');

const csp = /content="([^"]*default-src[^"]*)"/.exec(html);
check('页面里有 CSP', !!csp, '没找到 Content-Security-Policy');
if (csp) {
  const value = csp[1];
  // 网页版导出要 fetch('vendor/echarts.min.js')，connect-src 若是 none 会被直接拦掉
  check("connect-src 允许 'self'", /connect-src\s+[^;]*'self'/.test(value), '当前是：' + value);
  check('img-src 允许 blob:', /img-src\s+[^;]*blob:/.test(value), '当前是：' + value);
  check('img-src 允许 lp:', /img-src\s+[^;]*lp:/.test(value), '当前是：' + value);
}
check('有 viewport 声明', /name="viewport"/.test(html), '手机上是按 980px 虚拟宽度渲染的');

// ---------------------------------------------------------------- 5. 共享模块在 Node 里可用

console.log('\n[5] 共享模块的功能');

const OUTLINE = require(path.join(libDir, 'outline.js'));
const REPO = require(path.join(libDir, 'repo.js'));
const STYLE = require(path.join(libDir, 'page-style.js'));

const sample = [
  '# 一级标题',
  '',
  '正文一段。',
  '',
  '```js',
  '# 这行在代码块里，不该被当成标题',
  '```',
  '',
  '## 二级标题',
  '### **加粗的**三级标题',
].join('\n');
const headings = OUTLINE.extractHeadings(sample);
check('目录抓到 3 个标题', headings.length === 3, '抓到 ' + headings.length);
check('跳过代码块里的 #', headings.every((h) => h.text.indexOf('不该被当成标题') === -1));
check('标题里的 Markdown 记号被清掉', headings[2] && headings[2].text === '加粗的三级标题', JSON.stringify(headings[2]));
check('层级正确', headings.map((h) => h.level).join(',') === '1,2,3', headings.map((h) => h.level).join(','));

check('摘要会去掉图表围栏', REPO.makeSummary('```chart\n{}\n```\n真正的正文') === '真正的正文');
check('校验标签去重与去井号', REPO.normalizeTags(['#甲', '甲', ' 乙 ', '']).join(',') === '甲,乙');
check('图片后缀识别', REPO.isImageName('a.PNG') === true && REPO.isImageName('a.pdf') === false);
check('阅读时长至少 1 分钟', REPO.readingMinutes('短') === 1);
check('导出样式含正文样式', STYLE.pageCss().indexOf('.lp-body') !== -1);
check('导出启动脚本可关掉图表', STYLE.bootScript(false).indexOf('return;') !== -1);

// repo 在内存后端上跑一遍，确认手机端那套规则真的成立
(async () => {
  console.log('\n[6] 仓库层在「内存后端」上的行为（等价于手机端的 IndexedDB 后端）');

  const mem = { articles: [], settings: {}, files: new Map() };
  const backend = {
    dataDir: () => '内存',
    filesDir: () => '内存',
    readArticles: async () => mem.articles,
    writeArticles: async (l) => {
      mem.articles = JSON.parse(JSON.stringify(l));
    },
    readSettings: async () => mem.settings,
    writeSettings: async (s) => {
      mem.settings = JSON.parse(JSON.stringify(s));
    },
    importFile: async (f) => ({
      name: f.name,
      stored: 'x1',
      size: f.size,
      isImage: true,
      url: 'lp://files/x1',
    }),
    listFiles: async () => [],
    readFileBlob: async () => null,
    deleteFile: async () => true,
  };
  const repo = REPO.createRepo(backend);

  const a1 = await repo.saveArticle({ title: '甲', content: '# 甲\n正文' });
  check('新建拿到 id', typeof a1.id === 'string' && a1.id.length > 3);
  check('新建后列表有 1 篇', (await repo.listArticles()).length === 1);

  await repo.setTags(a1.id, ['写作', '测试']);
  check('标签写入成功', (await repo.getArticle(a1.id)).tags.join(',') === '写作,测试');

  await repo.togglePin(a1.id);
  check('置顶生效', (await repo.getArticle(a1.id)).pinnedAt > 0);

  const a2 = await repo.saveArticle({ title: '乙', content: '正文' });
  await repo.togglePin(a2.id);
  const listed = await repo.listArticles();
  check('置顶的排在最前', listed[0].id === a2.id, listed.map((x) => x.title).join(','));

  await repo.deleteArticle(a1.id);
  check('删除后不进主列表', (await repo.listArticles()).length === 1);
  check('删除后进回收站', (await repo.listTrash()).length === 1);
  await repo.restoreArticle(a1.id);
  check('从回收站恢复', (await repo.listArticles()).length === 2);

  await repo.purgeArticle(a2.id);
  check('彻底删除生效', (await repo.listArticles()).length === 1);

  // 历史版本：靠改内容触发，且要绕过 5 分钟合并窗口就得直接把 updatedAt 往前挪
  const cur = await repo.getArticle(a1.id);
  mem.articles = mem.articles.map((x) =>
    x.id === a1.id ? { ...x, updatedAt: Date.now() - 10 * 60 * 1000 } : x,
  );
  await repo.saveArticle({ id: a1.id, title: cur.title, content: cur.content + '\n又写了一段' });
  const revs = await repo.listRevisions(a1.id);
  check('产生了历史版本', revs.length >= 1, '实际 ' + revs.length);
  if (revs.length) {
    const before = (await repo.getArticle(a1.id)).content;
    await repo.restoreRevision(a1.id, revs[0].index);
    check('回滚改变了正文', (await repo.getArticle(a1.id)).content !== before);
  }

  const tags = await repo.listTags();
  check('标签统计可用', Array.isArray(tags));

  const s = await repo.setSettings({ theme: 'light' });
  check('设置可写可读', s.theme === 'light' && (await repo.getSettings()).theme === 'light');
  check('设置有默认值兜底', (await repo.getSettings()).fontSize === 16);

  // ------------------------------------------------------------ 7. Capacitor 工程

  console.log('\n[7] Capacitor 工程配置');

  const capPath = path.join(mobileDir, 'capacitor.config.json');
  check('capacitor.config.json 存在', fs.existsSync(capPath));
  if (fs.existsSync(capPath)) {
    const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    check('appId 与桌面版一致', cap.appId === 'com.yeyanli543.longpost', cap.appId);
    const resolved = path.resolve(mobileDir, cap.webDir);
    check(
      'webDir 指到 renderer 目录',
      resolved === rendererDir,
      '解析出来是 ' + resolved,
    );
    check('webDir 下确实有 index.html', fs.existsSync(path.join(resolved, 'index.html')));
  }

  const mobilePkgPath = path.join(mobileDir, 'package.json');
  if (fs.existsSync(mobilePkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(mobilePkgPath, 'utf8'));
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    check('Capacitor 各包版本一致', deps['@capacitor/core'] === deps['@capacitor/cli'] && deps['@capacitor/cli'] === deps['@capacitor/android'], JSON.stringify(deps));
    check('装了 Filesystem（导出要用）', !!deps['@capacitor/filesystem']);
    check('装了 Share（导出要用）', !!deps['@capacitor/share']);
  }

  // ------------------------------------------------------------ 8. 版本号

  console.log('\n[8] 版本号一致性');

  const desktopPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const platformCode = fs.readFileSync(path.join(rendererDir, 'platform.js'), 'utf8');
  const appVersion = (/APP_VERSION\s*=\s*'([^']+)'/.exec(platformCode) || [])[1];
  check(
    'platform.js 的 APP_VERSION 与 package.json 一致',
    appVersion === desktopPkg.version,
    'platform.js 是 ' + appVersion + '，package.json 是 ' + desktopPkg.version,
  );

  // ------------------------------------------------------------ 9. 界面接线
  //
  // 这一组专治「点下去没反应」：界面里 $('xxx') 拿不到元素、
  // 或者界面调了某个 LP.xxx 但底层根本没实现，都是静默失败，
  // 光看代码看不出来，跑起来才知道。

  console.log('\n[9] 界面接线');

  const appSrc = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const platformSrc = fs.readFileSync(path.join(rendererDir, 'platform.js'), 'utf8');
  const repoCode = fs.readFileSync(path.join(rendererDir, 'vendor', 'repo.js'), 'utf8');

  const idList = [];
  for (const found of html.matchAll(/\bid="([^"]+)"/g)) idList.push(found[1]);
  const htmlIds = new Set(idList);

  // 取用点扫描：从只认 $('id') 扩到所有「把元素 id 当字符串传进去」的辅助函数。
  // 只认 $('id') 是历史盲区：主题 / 排序 / 阅读行宽 / 阅读模式 / 正文大纲 / 引擎
  // 这 6 个开关是 buildSegmented('themeSwitch', …) 这样构建的，id 打错一个字母
  // 只会表现为「点了没反应」，老正则却全绿；openSheet / closeSheet（9 个弹窗）同理。
  // 注意 '\\$' 要写成双反斜杠：单个 $ 在正则里是行尾锚点，不是字面量。
  const ID_HELPERS = ['\\$', 'buildSegmented', 'syncSegmentedActive', 'syncSwitch', 'openSheet', 'closeSheet'];
  const usedIds = new Map(); // id -> 第一次见到它的取用点，报错时能指到人
  for (const helper of ID_HELPERS) {
    const reUsed = new RegExp(helper + '\\(\\s*[\'"]([^\'"]+)[\'"]', 'g');
    for (const found of appSrc.matchAll(reUsed)) {
      if (!usedIds.has(found[1])) usedIds.set(found[1], helper);
    }
  }

  const missingIds = [...usedIds.keys()].filter((id) => !htmlIds.has(id));
  check(
    'app.js 取的元素 id 都在 index.html 里（扫 ' + usedIds.size + ' 个取用点）',
    missingIds.length === 0,
    '找不到这些 id：' + missingIds.map((id) => id + '（' + usedIds.get(id) + ' 取的）').join(', '),
  );

  // 把盲区本身钉住：这 6 个 id 只有走字符串传参才拿得到，
  // 谁把扫描正则改回只认 $('id')，这条立刻变红。
  const STRING_PASSED_IDS = [
    'themeSwitch',
    'sortSwitch',
    'lineWidthSwitch',
    'readingModeSwitch',
    'outlineSwitch',
    'engineSwitch',
  ];
  const blindIds = STRING_PASSED_IDS.filter((id) => !usedIds.has(id));
  check(
    '6 个字符串传参的开关 id 已纳入扫描（防盲区回归）',
    blindIds.length === 0,
    '没扫到：' + blindIds.join(', ') + " —— 扫描正则又被写回只认 $('id') 了？",
  );

  const dupIds = [...new Set(idList.filter((id, i) => idList.indexOf(id) !== i))];
  check('index.html 里没有重复 id', dupIds.length === 0, '重复：' + dupIds.join(', '));

  // 界面上用到却没绑事件、也没进逻辑的按钮，属于「摆了但没用」
  const wiredIds = new Set();
  for (const found of appSrc.matchAll(/\$\(\s*'([^']+)'\s*\)\s*\.addEventListener/g)) wiredIds.add(found[1]);
  const buttonIds = [];
  for (const found of html.matchAll(/<button[^>]*\bid="([^"]+)"/g)) buttonIds.push(found[1]);
  const deadButtons = buttonIds.filter((id) => !wiredIds.has(id));
  check(
    '每个按钮都绑了事件（或明确是静态控件）',
    deadButtons.length === 0,
    '没绑事件：' + deadButtons.join(', '),
  );

  const lpUsed = new Set();
  for (const found of appSrc.matchAll(/\bLP\.([A-Za-z0-9_]+)\s*\(/g)) lpUsed.add(found[1]);

  const sources = [preloadSrc, platformSrc, repoCode];
  const hasMember = (name) =>
    sources.some(
      (src) =>
        new RegExp('\\b' + name + '\\s*[:(]').test(src) || new RegExp('\\b' + name + '\\s*,').test(src),
    );
  const lpMissing = [...lpUsed].filter((name) => !hasMember(name));
  check(
    'app.js 调的平台方法都有实现',
    lpMissing.length === 0,
    '没有实现：' + lpMissing.join(', '),
  );

  const invokes = new Set();
  for (const found of preloadSrc.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)) invokes.add(found[1]);
  const handles = new Set();
  for (const found of mainSrc.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)) handles.add(found[1]);

  const noHandler = [...invokes].filter((c) => !handles.has(c));
  check('preload 的通道主进程都处理了', noHandler.length === 0, '没人接：' + noHandler.join(', '));

  const notExposed = [...handles].filter((c) => !invokes.has(c));
  check('主进程的通道 preload 都暴露了', notExposed.length === 0, '没暴露：' + notExposed.join(', '));

  // 仓库层有能力，但界面永远调不到 —— 就是之前「装了跟没装差不多」的根因，钉住它
  const repoCapabilities = [
    'listTrash',
    'restoreArticle',
    'purgeArticle',
    'togglePin',
    'setTags',
    'listTags',
    'listRevisions',
    'restoreRevision',
    'importArticle',
  ];
  const unreachable = repoCapabilities.filter((name) => {
    const onDesktop = new RegExp('\\b' + name + '\\s*:').test(preloadSrc);
    const inUi = new RegExp('\\bLP\\.' + name + '\\s*\\(').test(appSrc);
    return !onDesktop && !inUi;
  });
  check(
    '仓库能力在桌面上都够得着',
    unreachable.length === 0,
    '接不到：' + unreachable.join(', '),
  );

  // 引入了却没人调用的模块，等于没接 —— vendor/outline.js 就这么躺了很久
  check(
    '大纲模块被界面真正调用',
    /OUTLINE\.buildToc\s*\(/.test(appSrc),
    'vendor/outline.js 引了但没有一处调用',
  );

  // 设置里存着、界面却不给改的项，用户永远碰不到它
  const settingsSurfaced = [
    ['编辑区字号', /LP\.setSettings\(\{\s*fontSize:/.test(appSrc)],
    ['列表排序', /LP\.setSettings\(\{\s*sort:/.test(appSrc)],
    ['沉浸阅读', /LP\.setSettings\(\{\s*readingMode:/.test(appSrc)],
    ['正文大纲', /LP\.setSettings\(\{\s*showOutline:/.test(appSrc)],
  ];
  const deadSettings = settingsSurfaced.filter((x) => !x[1]).map((x) => x[0]);
  check(
    '设置里的项在界面上都能改',
    deadSettings.length === 0,
    '只能存不能改：' + deadSettings.join(', '),
  );

  check(
    '阅读时长在界面上露出来了',
    /readingMinutes/.test(appSrc) || /a\.minutes/.test(appSrc),
    '仓库层算了 minutes，界面一处都没用',
  );

  check(
    '导入在桌面和手机两边都实现了',
    /importArticle\s*:/.test(preloadSrc) && /importArticle\s*\(/.test(platformSrc),
    'preload.js 或 renderer/platform.js 里缺 importArticle',
  );

  check(
    '主进程确实处理了导入通道',
    /ipcMain\.handle\(\s*'article:import'/.test(mainSrc),
    'article:import 没有处理函数',
  );

  // ------------------------------------------------------------ 10. 本轮新增能力的接线
  //
  // 这一组专治「声称做了、实际没接上」：
  //   - 新加的 DOM 有没有人取用（摆了但没接线）
  //   - 平台门面在桌面 / 手机两端是否都实现了同一套方法与能力表
  //   - 13 个第三方库是不是真的加载了、真的被调用了
  //   - 手机端交互控件的点击高度够不够
  //   - 设置里存着的项在界面上是不是都能改
  //   - 随包分发的第三方许可证是不是齐全、两份一致

  console.log('\n[10] 本轮新增能力的接线');

  // 10.1 「摆了但没接线」：html 里除图标 sprite 以外的 id 都应该有人取用。
  //      下面这几个是纯样式锚点，自己不接事件，列进豁免名单。
  const STATIC_CONTAINERS = new Set(['sidebar', 'tabbar', 'paneSwitch', 'longImageBox']);
  const htmlIdList = [...htmlIds].filter((id) => id.indexOf('i-') !== 0);
  const orphanIds = htmlIdList.filter((id) => !usedIds.has(id) && !STATIC_CONTAINERS.has(id));
  check(
    '界面元素没有「摆了但没接线」的（' + htmlIdList.length + ' 个 id）',
    orphanIds.length === 0,
    '这些 id 在 index.html 里但 app.js 从没取用过：' + orphanIds.join(', '),
  );

  // 10.2 平台门面：桌面分支与手机分支的能力表 + 方法必须成对存在
  const branchStart = platformSrc.indexOf('if (window.lp');
  const branchSplit = platformSrc.indexOf('Object.assign({}, repo, {');
  const desktopBranch =
    branchStart >= 0 && branchSplit > branchStart ? platformSrc.slice(branchStart, branchSplit) : '';
  const mobileBranch = branchSplit > 0 ? platformSrc.slice(branchSplit) : '';
  const capsKeys = (src) => {
    const m = /capabilities:\s*\{([\s\S]*?)\}/.exec(src);
    if (!m) return null;
    return m[1]
      .replace(/\/\/[^\n]*/g, '')
      .split(',')
      .map((unit) => unit.split(':')[0].trim())
      .filter(Boolean)
      .sort();
  };
  const capsDesktop = capsKeys(desktopBranch);
  const capsMobile = capsKeys(mobileBranch);
  check(
    '两端都声明了 capabilities',
    !!capsDesktop && !!capsMobile,
    '桌面分支' + (capsDesktop ? '有' : '缺') + '，手机分支' + (capsMobile ? '有' : '缺') +
      '（app.js 里 CAPS 的每一项都靠它，缺一边就是那个平台上按钮点了没反应）',
  );
  check(
    'capabilities 两端键集合一致',
    !!capsDesktop && !!capsMobile && capsDesktop.join(',') === capsMobile.join(','),
    '桌面 [' + (capsDesktop || []).join(' ') + '] vs 手机 [' + (capsMobile || []).join(' ') + ']',
  );

  const DUAL_METHODS = [
    'shareText',
    'copyText',
    'copyImage',
    'assetUrl',
    'releaseAsset',
    'appInfo',
    'openDataDir',
    'pickFiles',
    'listFiles',
    'exportHtml',
    'exportMarkdown',
  ];
  const hasMemberIn = (src, name) => new RegExp('\\b' + name + '\\s*[:(]').test(src);
  const oneSided = DUAL_METHODS.filter((name) => {
    const onDesktop = hasMemberIn(preloadSrc, name) || hasMemberIn(desktopBranch, name);
    const onMobile = hasMemberIn(mobileBranch, name);
    return !onDesktop || !onMobile;
  });
  check(
    '门面方法两端都有实现（' + DUAL_METHODS.length + ' 个）',
    oneSided.length === 0,
    '端上缺实现：' + oneSided.join(', '),
  );

  // 10.3 13 个第三方库：文件在、提供了 app.js 探的全局名、被 index.html 加载、且真的被调用。
  //      「库文件换了个构建变体」→ 全局名没了 → app.js 静默降级，这条能钉住。
  const LIB_FILES = [
    ['Prism 语法高亮', 'vendor/prism/prism.js', 'Prism'],
    ['Prism 语言组件', 'vendor/prism/components/prism-typescript.min.js', null],
    ['KaTeX 公式', 'vendor/katex/katex.min.js', 'katex'],
    ['KaTeX auto-render', 'vendor/katex/contrib/auto-render.min.js', 'renderMathInElement'],
    ['markdown-it', 'vendor/markdown-it/markdown-it.umd.min.js', 'markdownit'],
    ['markdown-it 任务清单', 'vendor/markdown-it/markdown-it-task-lists.min.js', 'markdownitTaskLists'],
    ['markdown-it 脚注', 'vendor/markdown-it/markdown-it-footnote.min.js', 'markdownitFootnote'],
    ['markdown-it 定义列表', 'vendor/markdown-it/markdown-it-deflist.min.js', 'markdownitDeflist'],
    ['markdown-it emoji', 'vendor/markdown-it/markdown-it-emoji.min.js', 'markdownitEmoji'],
    ['FlexSearch 中文检索', 'vendor/flexsearch/flexsearch.compact.min.js', 'FlexSearch'],
    ['PapaParse 表格', 'vendor/papaparse/papaparse.min.js', 'Papa'],
    ['html-to-image 长图', 'vendor/html-to-image/html-to-image.js', 'htmlToImage'],
    ['pulltorefreshjs 下拉刷新', 'vendor/pulltorefreshjs/pulltorefresh.umd.min.js', 'PullToRefresh'],
    ['hammerjs 手势', 'vendor/hammerjs/hammer.min.js', 'Hammer'],
    ['swiped-events 手势', 'vendor/swiped-events/swiped-events.min.js', null],
  ];
  const libFileMissing = [];
  const libNotLoaded = [];
  const libNoGlobal = [];
  const libNotUsed = [];
  for (const [label, rel, globalName] of LIB_FILES) {
    const abs = path.join(rendererDir, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
      libFileMissing.push(label);
      continue;
    }
    if (html.indexOf(rel) === -1) libNotLoaded.push(label);
    if (globalName) {
      if (!new RegExp('\\b' + globalName + '\\b').test(fs.readFileSync(abs, 'utf8'))) {
        libNoGlobal.push(label + '→' + globalName);
      }
      if (!new RegExp('\\b' + globalName + '\\b').test(appSrc)) libNotUsed.push(label);
    }
  }
  check(
    '13 个库的 vendor 文件都在（' + LIB_FILES.length + ' 个文件）',
    libFileMissing.length === 0,
    '缺文件：' + libFileMissing.join(', ') + '（先跑 node scripts/sync-vendor.js）',
  );
  check('13 个库都被 index.html 加载', libNotLoaded.length === 0, '没被引入：' + libNotLoaded.join(', '));
  check(
    '库文件都提供了 app.js 探测的全局名',
    libNoGlobal.length === 0,
    '文件里找不到全局名：' + libNoGlobal.join(', '),
  );
  check('app.js 里都有这些库的使用迹象', libNotUsed.length === 0, '只有声明没有调用：' + libNotUsed.join(', '));
  check(
    'swiped-events 的滑动事件被监听',
    /addEventListener\(\s*'swiped-/.test(appSrc),
    'swiped-events 加载了但没有一处监听 swiped-left / swiped-right',
  );

  const LIB_KEYS = ['katex', 'renderMath', 'prism', 'mdIt', 'mdTask', 'mdFoot', 'mdDef', 'mdEmoji', 'flex', 'papa', 'htmlToImage', 'pull', 'hammer'];
  const libBlock = /const LIB = \{([\s\S]*?)\n  \};/.exec(appSrc);
  const libBody = libBlock ? libBlock[1] : '';
  const noHandle = LIB_KEYS.filter((key) => !new RegExp('\\b' + key + ':').test(libBody));
  check('LIB 句柄表 13 个键齐全', noHandle.length === 0, '缺句柄：' + noHandle.join(', '));
  const handleUnused = LIB_KEYS.filter((key) => !new RegExp('LIB\\.' + key + '\\b').test(appSrc));
  check('LIB 句柄都被真正调用过', handleUnused.length === 0, '声明了但一处没用：' + handleUnused.join(', '));

  // 10.4 手机端交互控件的点击高度（这一轮定的下限是 44px）
  const mobileCssPath = path.join(rendererDir, 'style-mobile.css');
  const mobileCss = fs.existsSync(mobileCssPath) ? fs.readFileSync(mobileCssPath, 'utf8') : '';
  const TAP_TARGETS = [
    ['.tab', '底部导航'],
    ['.seg', '分段控件'],
    ['.pswitch', '分栏开关'],
    ['.chip', '标签片'],
    ['.icon-btn', '图标按钮'],
  ];
  const lowTargets = [];
  for (const [sel, label] of TAP_TARGETS) {
    const blocks = [...mobileCss.matchAll(new RegExp(sel.replace('.', '\\.') + '[^{,]*\\{([^}]*)\\}', 'g'))].map((m) => m[1]);
    const heights = [];
    for (const block of blocks) {
      for (const m of block.matchAll(/(min-height|height)\s*:\s*(\d+(?:\.\d+)?)px/g)) heights.push(Number(m[2]));
    }
    if (!heights.length) lowTargets.push(label + '(' + sel + ' 没写高度)');
    else if (Math.max(...heights) < 44) lowTargets.push(label + '(' + sel + ' 只有 ' + Math.max(...heights) + 'px)');
  }
  check('手机端交互控件的点击高度 ≥44px', lowTargets.length === 0, lowTargets.join(', '));
  console.log('    · 备注：设置抽屉里的 4 个开关是 52×32px（低于 44px 下限），见验证报告 D2');

  // 10.5 设置里存着的项，界面上都得有能改它的入口
  const SETTING_ENTRIES = [
    ['主题', 'theme', 'themeSwitch'],
    ['列表排序', 'sort', 'sortSwitch'],
    ['阅读行宽', 'lineWidth', 'lineWidthSwitch'],
    ['沉浸阅读', 'readingMode', 'readingModeSwitch'],
    ['正文大纲', 'showOutline', 'outlineSwitch'],
    ['Markdown 引擎', 'mdEngine', 'engineSwitch'],
    ['代码高亮', 'highlight', 'hlSwitch'],
    ['数学公式', 'math', 'mathSwitch'],
    ['自动保存', 'autoSave', 'autoSaveSwitch'],
    ['减少动效', 'motion', 'motionSwitch'],
    ['编辑区字号', 'fontSize', 'setFontSize'],
  ];
  const deadSettingKeys = SETTING_ENTRIES.filter(([, key, entry]) => {
    const canWrite = new RegExp('setSettings\\(\\{\\s*' + key + ':').test(appSrc);
    return !canWrite || !htmlIds.has(entry);
  }).map(([label]) => label);
  check(
    '设置项在界面上都有可改的入口（' + SETTING_ENTRIES.length + ' 项）',
    deadSettingKeys.length === 0,
    '只能存不能改：' + deadSettingKeys.join(', '),
  );

  // 10.6 随包分发的第三方许可证：覆盖齐全 + 两份字节一致
  const noticesRoot = path.join(root, 'THIRD-PARTY-NOTICES.md');
  const noticesVendor = path.join(rendererDir, 'vendor', 'THIRD-PARTY-NOTICES.md');
  const noticesText = fs.existsSync(noticesRoot) ? fs.readFileSync(noticesRoot, 'utf8') : '';
  const noticesSame =
    !!noticesText &&
    fs.existsSync(noticesVendor) &&
    fs.readFileSync(noticesRoot).equals(fs.readFileSync(noticesVendor));
  check('随包许可证两份字节一致', noticesSame, 'THIRD-PARTY-NOTICES.md 根目录与 renderer/vendor/ 下不一致或缺失');
  const NOTICE_COMPONENTS = [
    'echarts',
    'prismjs',
    'katex',
    'markdown-it',
    'markdown-it-task-lists',
    'markdown-it-footnote',
    'markdown-it-deflist',
    'markdown-it-emoji',
    'html-to-image',
    'swiped-events',
    'hammerjs',
    'pulltorefreshjs',
    'flexsearch',
    'papaparse',
  ];
  // 只查「名字出现过」太弱：正文里提一句也算。这里直接解析版本表的「组件」列，
  // 要求它跟随包组件清单一一对上（多一行少一行都算不完整）。
  const noticeRows = [...noticesText.matchAll(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => m[1].trim());
  const noticeMissing = NOTICE_COMPONENTS.filter((name) => noticeRows.indexOf(name) === -1);
  const noticeExtra = noticeRows.filter((name) => NOTICE_COMPONENTS.indexOf(name) === -1);
  check(
    '许可证版本表与随包组件一一对应（' + NOTICE_COMPONENTS.length + ' 个）',
    noticeMissing.length === 0 && noticeExtra.length === 0,
    '清单里缺：' + (noticeMissing.join(', ') || '无') + '；多了：' + (noticeExtra.join(', ') || '无'),
  );
  check(
    '许可证清单带许可证全文（```text 段）',
    (noticesText.match(/```text/g) || []).length >= NOTICE_COMPONENTS.length,
    '```text 段只有 ' + (noticesText.match(/```text/g) || []).length + ' 个',
  );

  // ------------------------------------------------------------ 11. 长图导出（D1 回归）

  console.log('\n[11] 长图导出必须按正文全高出图（D1 回归）');

  // 实现放在 scripts/longimage-guard.js 里，smoke-test.js 也调用同一份，
  // 免得两条流水线（桌面只跑 npm test，安卓跑 verify-mobile）各写一套慢慢走样。
  for (const c of require('./longimage-guard').checkLongImage(rendererDir)) {
    check(c.label, c.ok, c.detail);
  }

  // ------------------------------------------------------------ 12. 版面（P1 / P2 回归）

  console.log('\n[12] 贴底抽屉不被底栏遮挡 / 标题不被挤扁（P1、P2 回归）');

  // 与 smoke-test.js 共用 scripts/layout-guard.js（一份实现两个调用点）。
  for (const c of require('./layout-guard').checkLayout(rendererDir)) {
    check(c.label, c.ok, c.detail);
  }

  // ------------------------------------------------------------ 结果

  console.log('\n' + '—'.repeat(54));
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail) {
    console.log('有失败项，先修好再推。');
    process.exit(1);
  }
  console.log('全部通过');
})();
