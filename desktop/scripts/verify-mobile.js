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

  // ------------------------------------------------------------ 结果

  console.log('\n' + '—'.repeat(54));
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail) {
    console.log('有失败项，先修好再推。');
    process.exit(1);
  }
  console.log('全部通过');
})();
