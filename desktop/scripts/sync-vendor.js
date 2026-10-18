/**
 * 把不进仓库的产物同步到 renderer/vendor/。
 *
 * 同步两类东西：
 *   1. 第三方库 —— 按下面的 VENDOR 清单，从 node_modules 挑出「能在无打包器环境下
 *      直接 <script> 引入」的那几个文件复制过去。挑而不是整包拷，是因为这些包里
 *      大量的 types/、esm/、src/、map、以及 woff/ttf 字体在运行时一个都用不到。
 *   2. lib/ 里的共享模块 —— 渲染层直接引用它们，复制一份让 renderer/ 自成一体。
 *
 * 第 2 点是为了手机版：Capacitor 打包时只认一个 web 目录，index.html 里
 * 出现 "../lib/xxx.js" 这种跳出目录的引用是拿不到的。所以统一用 vendor/ 下的拷贝。
 *
 * 代价是同一份代码存在两个位置，所以复制完会逐个比对字节，不一致直接报错退出 ——
 * 免得改了 lib/ 忘了同步，桌面能跑手机跑不了。
 *
 * 顺带守四条线（都踩过）：
 *   A. 清单里的包必须在 dependencies 里。Android 流水线装依赖用的是
 *      `npm install --omit=dev --ignore-scripts`，装成 devDependency 就等于没装。
 *   B. 打包时 build.files 里有 `!node_modules/**`（见 package.json 与 VENDOR.md），
 *      所以主进程侧不许 require 第三方包 —— 这里直接静态扫一遍 require 拦下来。
 *   C. 新增的 vendor 体积对手机 APK 是硬成本（APK 本来就 7.6 MB），超线要出声。
 *   D. 该随包的是 THIRD-PARTY-NOTICES.md（合规声明），不是 VENDOR.md /
 *      VENDOR-LICENSES.md（内部交接文档）：前者必须出现在 build.files 里，
 *      后两者一旦出现在 renderer/vendor/ 就直接报错 —— 手机侧没有 build.files 可拦。
 *
 * npm install / npm ci 之后自动执行（见 package.json 的 prepare）。
 * 单独重跑：npm run vendor
 * 升级或换了库之后，重新生成随包声明：node scripts/sync-vendor.js --write-notices
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const root = path.join(__dirname, '..');
const libDir = path.join(root, 'lib');
const destDir = path.join(root, 'renderer', 'vendor');
const pkgJsonPath = path.join(root, 'package.json');

/** 必须一起搬进 renderer/vendor/ 的共享模块（renderer 与 lib 逐字节一致）。 */
const SHARED = ['markdown.js', 'chart.js', 'repo.js', 'page-style.js', 'outline.js', 'social-slice.js', 'markdown-import.js', 'static-site.js', 'bookmarklet.js'];

/**
 * 随包分发的第三方声明文件（面向接收方，合规用）。
 *
 * 与 VENDOR.md / VENDOR-LICENSES.md 的分工要分清，这两类东西**不能混**：
 *   - VENDOR.md、VENDOR-LICENSES.md 是开发/交接文档：含内部选型过程、砍库顺序、
 *     清单映射、体积预算，是给维护者看的，**不该发给最终用户**，所以不进 build.files。
 *   - THIRD-PARTY-NOTICES.md 是面向接收方的合规声明：组件 + 版本 + 许可证全文 + 版权行。
 *     Apache-2.0 第 4(a) 条要求向接收方提供许可证副本、第 4(d) 条要求随附上游 NOTICE；
 *     MIT / ISC 要求在软件副本中保留版权与许可声明。所以它**必须**随包走。
 *
 * 源文件放 desktop/ 根下（renderer/vendor/ 整个被 .gitignore 忽略，文档丢在里面不会
 * 被提交，换台机器 clone 下来就没了），同步时复制一份到 renderer/vendor/ ——
 * 手机版 Capacitor 只打 renderer/ 一个目录，放那里才会进 APK；桌面版 build.files 里
 * renderer/**\/* 会把它一起收进 app.asar，另有根目录一份（见 package.json）。
 *
 * 改动库版本后要重跑 `node scripts/sync-vendor.js --write-notices` 重新生成全文，
 * 否则下面的版本一致性校验会直接报错。
 */
const NOTICES = ['THIRD-PARTY-NOTICES.md'];

/** 开发/交接文档：只留在 desktop/ 给人看，**不进 build.files、不进 renderer/vendor/**。 */
const DEV_DOCS = ['VENDOR.md', 'VENDOR-LICENSES.md'];

/**
 * 新增 vendor 的体积红线（字节）。手机 APK 现在 7.6 MB，往渲染层塞东西是直接成本，
 * 所以这里定一条线：只有「新增库」算在里面，echarts 与 lib/ 的拷贝是历史存量，不算。
 */
const VENDOR_BUDGET = 1.5 * 1024 * 1024;

/**
 * 第三方库清单。
 *
 * 每一项：
 *   pkg       npm 包名（必须出现在 package.json 的 dependencies 里）
 *   version   package.json 里钉的版本，安装后核对，防止挑了 A 版本的路径却装了 B 版本
 *   license   许可证；仓库是 MIT，只放 MIT / ISC / BSD / Apache-2.0
 *   home      上游仓库地址（VENDOR.md 与 VENDOR-LICENSES.md 引用）
 *   why       解决什么问题、对标谁
 *   files     从包目录里挑哪些文件搬到 destDir 下；from 支持结尾通配（*.woff2）
 *   budgeted  是否计入 VENDOR_BUDGET（历史存量填 false）
 *
 * 只挑「浏览器能直接 <script> 加载」的产物：
 *   - UMD/IIFE 单文件（自带全局名）可以；只提供 CJS/ESM 的不行 —— 例如
 *     highlight.js 的 npm 包根本没有浏览器单文件产物（没有 dist/、没有 unpkg 字段），
 *     直接 <script> 引 src 里的 CJS 会当场 "exports is not defined"，所以没选它。
 */
const VENDOR = [
  {
    pkg: 'echarts',
    version: '6.1.0',
    license: 'Apache-2.0',
    home: 'https://github.com/apache/echarts',
    why: '图表运行库；导出 HTML 时整份内联进去，离线也能画图',
    budgeted: false,
    files: [{ from: 'dist/echarts.min.js', to: 'echarts.min.js' }],
    // echarts 是历史存量：以前就只认这两个位置，保留 fallback 免得别的分支上跑不起来
    fallbackFrom: [
      path.join(root, 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
      path.join(root, '..', 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
    ],
    minBytes: 500 * 1024,
  },
  {
    pkg: 'prismjs',
    version: '1.30.0',
    license: 'MIT',
    home: 'https://github.com/PrismJS/prism',
    why: '代码块语法高亮，对标 Typora / Obsidian / GitHub 的代码渲染',
    files: [
      { from: 'prism.js', to: 'prism/prism.js' },
      { from: 'themes/prism.min.css', to: 'prism/themes/prism.min.css' },
      { from: 'themes/prism-tomorrow.min.css', to: 'prism/themes/prism-tomorrow.min.css' },
      // core（prism.js）自带 markup / css / clike / javascript，下面这些按依赖顺序排，
      // c 必须在 cpp 前、javascript 必须在 typescript 前（由 components.json 的 require 推出）
      { from: 'components/prism-bash.min.js', to: 'prism/components/prism-bash.min.js' },
      { from: 'components/prism-c.min.js', to: 'prism/components/prism-c.min.js' },
      { from: 'components/prism-cpp.min.js', to: 'prism/components/prism-cpp.min.js' },
      { from: 'components/prism-csharp.min.js', to: 'prism/components/prism-csharp.min.js' },
      { from: 'components/prism-diff.min.js', to: 'prism/components/prism-diff.min.js' },
      { from: 'components/prism-docker.min.js', to: 'prism/components/prism-docker.min.js' },
      { from: 'components/prism-go.min.js', to: 'prism/components/prism-go.min.js' },
      { from: 'components/prism-ini.min.js', to: 'prism/components/prism-ini.min.js' },
      { from: 'components/prism-java.min.js', to: 'prism/components/prism-java.min.js' },
      { from: 'components/prism-json.min.js', to: 'prism/components/prism-json.min.js' },
      { from: 'components/prism-latex.min.js', to: 'prism/components/prism-latex.min.js' },
      { from: 'components/prism-markdown.min.js', to: 'prism/components/prism-markdown.min.js' },
      { from: 'components/prism-nginx.min.js', to: 'prism/components/prism-nginx.min.js' },
      { from: 'components/prism-properties.min.js', to: 'prism/components/prism-properties.min.js' },
      { from: 'components/prism-python.min.js', to: 'prism/components/prism-python.min.js' },
      { from: 'components/prism-rust.min.js', to: 'prism/components/prism-rust.min.js' },
      { from: 'components/prism-sql.min.js', to: 'prism/components/prism-sql.min.js' },
      { from: 'components/prism-toml.min.js', to: 'prism/components/prism-toml.min.js' },
      { from: 'components/prism-typescript.min.js', to: 'prism/components/prism-typescript.min.js' },
      { from: 'components/prism-yaml.min.js', to: 'prism/components/prism-yaml.min.js' },
    ],
  },
  {
    pkg: 'katex',
    version: '0.19.0',
    license: 'MIT',
    home: 'https://github.com/KaTeX/KaTeX',
    why: 'LaTeX 数学公式渲染，对标 Obsidian / Notion 的公式',
    files: [
      { from: 'dist/katex.min.js', to: 'katex/katex.min.js' },
      { from: 'dist/katex.min.css', to: 'katex/katex.min.css' },
      { from: 'dist/contrib/auto-render.min.js', to: 'katex/contrib/auto-render.min.js' },
      // 只搬 woff2：katex.min.css 每个 @font-face 都把 woff2 排在第一个 src，
      // 浏览器命中 woff2 就不会再去要 woff/ttf。electron 44 与 Android WebView 都支持 woff2。
      // 三个格式全搬是 1.06 MB，只搬 woff2 是 254 KB。
      { from: 'dist/fonts/*.woff2', to: 'katex/fonts/' },
    ],
  },
  {
    pkg: 'markdown-it',
    version: '15.0.2',
    license: 'MIT',
    home: 'https://github.com/markdown-it/markdown-it',
    why: '完整 CommonMark + GFM 渲染（表格对齐、脚注、任务清单、定义列表、emoji），对标 Typora 的 Markdown 子集',
    files: [{ from: 'dist/browser/markdown-it.umd.min.js', to: 'markdown-it/markdown-it.umd.min.js' }],
  },
  {
    pkg: 'markdown-it-task-lists',
    version: '2.1.1',
    license: 'ISC',
    home: 'https://github.com/revin/markdown-it-task-lists',
    why: 'Markdown 任务清单 [- [x] / - [ ]] 渲染成可点复选框，对标 GitHub / Obsidian',
    files: [
      { from: 'dist/markdown-it-task-lists.min.js', to: 'markdown-it/markdown-it-task-lists.min.js' },
    ],
  },
  {
    pkg: 'markdown-it-footnote',
    version: '4.0.0',
    license: 'MIT',
    home: 'https://github.com/markdown-it/markdown-it-footnote',
    why: '脚注 [^1]，对标 Obsidian / Notion 的脚注',
    files: [{ from: 'dist/markdown-it-footnote.min.js', to: 'markdown-it/markdown-it-footnote.min.js' }],
  },
  {
    pkg: 'markdown-it-deflist',
    version: '4.0.0',
    license: 'MIT',
    home: 'https://github.com/markdown-it/markdown-it-deflist',
    why: '定义列表，对标 Pandoc / Obsidian 的 Deflist',
    files: [{ from: 'dist/markdown-it-deflist.min.js', to: 'markdown-it/markdown-it-deflist.min.js' }],
  },
  {
    pkg: 'markdown-it-emoji',
    version: '3.1.0',
    license: 'MIT',
    home: 'https://github.com/markdown-it/markdown-it-emoji',
    why: ':smile: 之类的 emoji 简写，对标 GitHub / Slack 的 emoji',
    // 只搬 light（常用几百个，6 KB）；full 是 60 KB，要全量的话把下面这行换成
    // markdown-it-emoji.min.js 即可，别忘了一起重跑体积统计
    files: [
      { from: 'dist/markdown-it-emoji-light.min.js', to: 'markdown-it/markdown-it-emoji.min.js' },
    ],
  },
  {
    pkg: 'html-to-image',
    version: '1.11.13',
    license: 'MIT',
    home: 'https://github.com/bubkoo/html-to-image',
    why: '把正文节点导成 PNG，做「文章长图 / 分享卡片」，对标微信公众号长图与 X 的分享卡片',
    files: [{ from: 'dist/html-to-image.js', to: 'html-to-image/html-to-image.js' }],
  },
  {
    pkg: 'swiped-events',
    version: '1.2.0',
    license: 'MIT',
    home: 'https://github.com/john-doherty/swiped-events',
    why: '零 JS 的声明式滑动事件（swiped-left / swiped-right），对标原生 App 的左右滑',
    files: [{ from: 'dist/swiped-events.min.js', to: 'swiped-events/swiped-events.min.js' }],
  },
  {
    pkg: 'hammerjs',
    version: '2.0.8',
    license: 'MIT',
    home: 'https://github.com/hammerjs/hammer.js',
    why: '手势原语：press（长按菜单）、pinch（捏合缩放预览）、pan，对标 App 的长按/双指手势',
    files: [{ from: 'hammer.min.js', to: 'hammerjs/hammer.min.js' }],
  },
  {
    pkg: 'pulltorefreshjs',
    version: '0.1.22',
    license: 'MIT',
    home: 'https://github.com/BoxFactura/pulltorefresh.js',
    why: '下拉刷新，对标手机 App 列表下拉刷新',
    files: [{ from: 'dist/index.umd.min.js', to: 'pulltorefreshjs/pulltorefresh.umd.min.js' }],
  },
  {
    pkg: 'flexsearch',
    version: '0.8.212',
    license: 'Apache-2.0',
    home: 'https://github.com/nextapps-de/flexsearch',
    why: '本地全文搜索索引，Charset.CJK 做中文检索（不用 3 MB 的分词词典），对标 Obsidian 的本地搜索',
    files: [{ from: 'dist/flexsearch.compact.min.js', to: 'flexsearch/flexsearch.compact.min.js' }],
  },
  {
    pkg: 'papaparse',
    version: '5.7.0',
    license: 'MIT',
    home: 'https://github.com/mholt/PapaParse',
    why: 'CSV / TSV 解析与回写，给「表格可视化编辑」提供数据层（粘贴 Excel 就能变 Markdown 表格）',
    files: [{ from: 'papaparse.min.js', to: 'papaparse/papaparse.min.js' }],
  },
];

/**
 * 生成 THIRD-PARTY-NOTICES.md 时，每个包的许可证文件在 node_modules 里叫什么。
 * 不要靠「大概都叫 LICENSE」猜：hammerjs 是 LICENSE.md、pulltorefreshjs 是 LICENSE.txt。
 */
const LICENSE_FILES = {
  echarts: 'LICENSE',
  prismjs: 'LICENSE',
  katex: 'LICENSE',
  'markdown-it': 'LICENSE',
  'markdown-it-task-lists': 'LICENSE',
  'markdown-it-footnote': 'LICENSE',
  'markdown-it-deflist': 'LICENSE',
  'markdown-it-emoji': 'LICENSE',
  'html-to-image': 'LICENSE',
  'swiped-events': 'LICENSE',
  hammerjs: 'LICENSE.md',
  pulltorefreshjs: 'LICENSE.txt',
  flexsearch: 'LICENSE',
  papaparse: 'LICENSE',
};

/** Apache-2.0 的包另有 NOTICE 文件，第 4(d) 条要求随附，得一起收录。 */
const NOTICE_FILES = { echarts: 'NOTICE' };

/**
 * 正文里找不到可用版权行时的兜底署名。
 *
 * flexsearch：上游 LICENSE 的附录署名处仍是占位符 `Copyright [yyyy] [name of copyright owner]`，
 * 包内没有填写。这里按该包 package.json 的 author 字段署名，并在正文里写明出处，
 * 不凭印象编。
 */
const COPYRIGHT_FALLBACK = {
  flexsearch: {
    text: 'Thomas Wilkerling',
    note: '上游 LICENSE 的附录署名处仍是占位符 `Copyright [yyyy] [name of copyright owner]`，包内未填写；此处署名取自该包 package.json 的 author 字段。',
  },
};

// ---------------------------------------------------------------- 工具

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error('[sync-vendor] ✗ ' + msg);
}
function ok(msg) {
  console.log('[sync-vendor] ✓ ' + msg);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 展开 `dist/fonts/*.woff2` 这类结尾通配，返回相对包目录的路径数组（排序后，结果稳定）。 */
function expandFrom(pkgDir, from) {
  if (!from.includes('*')) return [from];
  const dir = path.dirname(from);
  const pattern = new RegExp(
    '^' + path.basename(from).split('*').map(escapeRe).join('.*') + '$',
  );
  const abs = path.join(pkgDir, dir);
  if (!fs.existsSync(abs)) throw new Error('目录不存在：' + dir);
  return fs
    .readdirSync(abs)
    .filter((f) => pattern.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

function pkgDirOf(name) {
  const direct = path.join(root, 'node_modules', name);
  if (fs.existsSync(direct)) return direct;
  // monorepo 里可能被提升到仓库根
  const hoisted = path.join(root, '..', 'node_modules', name);
  if (fs.existsSync(hoisted)) return hoisted;
  return direct;
}

// ---------------------------------------------------------------- 第三方声明

/** 是否处于「重新生成第三方声明」模式：node scripts/sync-vendor.js --write-notices */
const WRITE_NOTICES = process.argv.includes('--write-notices');

/**
 * 读 node_modules 里某个包的文本文件，返回正文与两套字节数。
 * 两种规范化，都不改内容、只动行尾：
 *   1. CRLF → LF（flexsearch 上游用的是 CRLF，11558 → 11357 字节）；
 *   2. 补一个结尾换行（swiped-events 的 LICENSE 与 echarts 的 NOTICE 本身不以换行结束，
 *      而 Markdown 代码块的结束标记必须在行首）。
 * 所以「收录字节数」要如实报出来，且和源文件字节数不同时必须说明差在哪 ——
 * 回读比对就是为了把这些差异逼出来，漏掉任何一种都会当场报错。
 */
function pkgTextInfo(pkgDir, pkg, file) {
  const abs = path.join(pkgDir, file);
  if (!fs.existsSync(abs)) {
    throw new Error('node_modules/' + pkg + '/' + file + ' 不存在，没法生成第三方声明');
  }
  const rawBytes = fs.statSync(abs).size;
  let text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  if (!text.endsWith('\n')) text += '\n';
  return { text, rawBytes, bytes: Buffer.byteLength(text, 'utf8') };
}

/**
 * 取许可证正文里的版权行。
 * Apache-2.0 的正文全是条款定义、没有署名行（附录还是 `Copyright [yyyy]` 占位），取不到就返回空串，
 * 由 COPYRIGHT_FALLBACK 兜底 —— 宁可显式兜底，也不要让声明里的版权行空着。
 */
function firstCopyrightLine(text) {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!/^copyright\b/i.test(line)) continue;
    if (!/\(c\)|\(C\)|(19|20)\d{2}/.test(line)) continue;
    if (/\byyyy\b/i.test(line)) continue;
    return line;
  }
  return '';
}

/** 收集每个包的许可证 / NOTICE 正文，顺序跟着 VENDOR 清单走（结果稳定、可重复）。 */
function collectNotices() {
  return VENDOR.map((item) => {
    const pkgDir = pkgDirOf(item.pkg);
    const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    if (installed.license && installed.license !== item.license) {
      throw new Error(
        item.pkg +
          ' 的 package.json 写的是 ' +
          installed.license +
          '，清单写的是 ' +
          item.license +
          '。许可证类型对不上，先查清楚再生成声明。',
      );
    }
    const licFile = LICENSE_FILES[item.pkg];
    if (!licFile) throw new Error('LICENSE_FILES 里没有 ' + item.pkg + '，生成不了声明');
    const lic = pkgTextInfo(pkgDir, item.pkg, licFile);
    const noticeFile = NOTICE_FILES[item.pkg] || null;
    const notice = noticeFile ? pkgTextInfo(pkgDir, item.pkg, noticeFile) : null;

    let copyright = firstCopyrightLine(notice ? notice.text : lic.text);
    let copyrightNote = '';
    if (!copyright && COPYRIGHT_FALLBACK[item.pkg]) {
      copyright = COPYRIGHT_FALLBACK[item.pkg].text;
      copyrightNote = COPYRIGHT_FALLBACK[item.pkg].note;
    }
    if (!copyright) {
      throw new Error(item.pkg + ' 的版权行没取到、也没配兜底署名 —— 不能让它空着进声明文件。');
    }
    return { item, version: installed.version, licFile, lic, noticeFile, notice, copyright, copyrightNote };
  });
}

/** 生成「来源：…（字节数）」那一行：收录字节数与源文件不同时，把差在哪写清楚。 */
function sourceLine(pkg, file, info) {
  let tail;
  if (info.bytes === info.rawBytes) {
    tail = info.bytes + ' 字节，逐字节收录';
  } else if (info.bytes < info.rawBytes) {
    tail =
      '源文件 ' + info.rawBytes + ' 字节，收录 ' + info.bytes + ' 字节 —— 少 ' +
      (info.rawBytes - info.bytes) + ' 字节，是 CRLF→LF 的行尾规范化；正文未改';
  } else {
    tail =
      '源文件 ' + info.rawBytes + ' 字节，收录 ' + info.bytes + ' 字节 —— 多 ' +
      (info.bytes - info.rawBytes) + ' 字节，是末尾补的一个换行（Markdown 代码块要求）；正文未改';
  }
  return '来源：`node_modules/' + pkg + '/' + file + '`（' + tail + '）';
}

/** 拼出 THIRD-PARTY-NOTICES.md 全文；同时把每段正文按出现顺序记进 blocks，供回读比对。 */
function buildNotices(entries) {
  const blocks = [];
  const L = [];
  const byLicense = {};
  for (const e of entries) byLicense[e.item.license] = (byLicense[e.item.license] || 0) + 1;
  const tally = Object.keys(byLicense)
    .sort()
    .map((k) => k + ' × ' + byLicense[k])
    .join('、');
  let normalized = 0;
  for (const e of entries) {
    if (e.lic.bytes !== e.lic.rawBytes) normalized++;
    if (e.notice && e.notice.bytes !== e.notice.rawBytes) normalized++;
  }
  const totalBlocks = entries.length + entries.filter((e) => e.notice).length;

  L.push('# LongPost 第三方软件声明');
  L.push('');
  L.push('本文件随 LongPost 分发，出现在两个位置：');
  L.push('');
  L.push('- 桌面版安装包内 `app.asar` 的根目录：`/THIRD-PARTY-NOTICES.md`（由 `desktop/package.json` 的 `build.files` 收入）；');
  L.push('- 手机版 web 资源：`renderer/vendor/THIRD-PARTY-NOTICES.md`（Capacitor 只打包 `renderer/` 一个目录，放这里才会进 APK）。');
  L.push('');
  L.push('LongPost 自身以 MIT 许可证发布（见仓库根目录 `LICENSE`）。下面这些第三方组件由各自的作者按各自的许可证授权，版权归各作者所有。');
  L.push('这些许可证都要求在分发时保留版权声明与许可条款：');
  L.push('');
  L.push('- **Apache-2.0**：第 4(a) 条要求向接收方提供许可证副本，第 4(d) 条要求随附上游 `NOTICE` 文件；');
  L.push('- **MIT / ISC**：要求在软件的所有副本中保留版权声明与本许可声明。');
  L.push('');
  L.push('因此本文件收录每个组件的**许可证全文**，而不是外链 —— 这个应用是离线的，链接对接收方没有意义。');
  L.push('');
  L.push(
    '生成方式：`node scripts/sync-vendor.js --write-notices`（即 `desktop/scripts/sync-vendor.js`）从 `node_modules/<包>/LICENSE*` 读取正文写入本文件，' +
      '不改写、不翻译、不做摘要；只把行尾统一为 LF（`flexsearch` 上游用 CRLF）并保证文件以换行结束。' +
      '写完后脚本会重新读回本文件，把每段正文与包内源文件逐段比对，不一致即报错；常规同步（`node scripts/sync-vendor.js`）也会校验本文件里的组件与版本是否和已安装的一致。',
  );
  L.push('');
  L.push(
    '共 ' +
      totalBlocks +
      ' 段正文，其中 ' +
      normalized +
      ' 段的收录字节数与源文件不同 —— 差异**只有行尾**这一种（CRLF→LF、或在结尾补一个换行），' +
      '每段都在下面的「来源」一行里写明了差多少、差在哪；除此之外逐段与源文件一致。',
  );
  L.push('');
  L.push('组件数量：' + entries.length + ' 个（' + tally + '）。全部为 MIT / ISC / Apache-2.0，与 LongPost 自身的 MIT 兼容。');
  L.push('');
  L.push('## 1. 组件清单');
  L.push('');
  L.push('| # | 组件 | 版本 | 许可证 | 版权声明 | 上游仓库 | 用途 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  entries.forEach((e, i) => {
    L.push(
      '| ' +
        (i + 1) +
        ' | ' +
        e.item.pkg +
        ' | ' +
        e.version +
        ' | ' +
        e.item.license +
        ' | ' +
        e.copyright +
        (e.copyrightNote ? '（' + e.copyrightNote + '）' : '') +
        ' | ' +
        e.item.home +
        ' | ' +
        e.item.why +
        ' |',
    );
  });
  L.push('');
  L.push(
    '> `echarts` 与 `flexsearch` 同为 Apache-2.0。两份 LICENSE 文件内容实质相同、仅行尾不同（后者上游用的是 CRLF），' +
      '为保持「本文件里的正文等于包内原始文件」这一点可被逐段校验，两份都原样收录，不做合并。',
  );
  L.push('');
  L.push('## 2. 许可证全文');
  L.push('');
  entries.forEach((e, i) => {
    const n = i + 1;
    L.push('### 2.' + n + ' ' + e.item.pkg + ' ' + e.version + ' — ' + e.item.license);
    L.push('');
    L.push(sourceLine(e.item.pkg, e.licFile, e.lic));
    L.push('');
    L.push('```text');
    L.push(e.lic.text.replace(/\n$/, ''));
    L.push('```');
    L.push('');
    blocks.push(e.lic.text);
    if (e.notice) {
      L.push('### 2.' + n + '.1 ' + e.item.pkg + ' — NOTICE（Apache-2.0 第 4(d) 条要求随附）');
      L.push('');
      L.push(sourceLine(e.item.pkg, e.noticeFile, e.notice));
      L.push('');
      L.push('```text');
      L.push(e.notice.text.replace(/\n$/, ''));
      L.push('```');
      L.push('');
      blocks.push(e.notice.text);
    }
  });
  L.push('---');
  L.push('');
  L.push('## 3. LongPost 自身的许可');
  L.push('');
  L.push('LongPost 以 **MIT** 许可证发布，版权归其作者。完整许可证见仓库根目录的 `LICENSE` 文件，或 <https://github.com/yeyanli543-dot/longpost>。');
  L.push('');
  L.push('本文件由 `desktop/scripts/sync-vendor.js --write-notices` 生成，请勿手工编辑；升级或更换上面任一组件后重新生成。');
  L.push('');
  return { text: L.join('\n'), blocks };
}

/** 重新生成 desktop/THIRD-PARTY-NOTICES.md，并回读校验每段正文与包内源文件一致。 */
function writeNotices() {
  const entries = collectNotices();
  const { text, blocks } = buildNotices(entries);
  const abs = path.join(root, NOTICES[0]);
  fs.writeFileSync(abs, text);

  // 回读：把文件里的 ```text 块按顺序抽出来，和写进去的源正文逐段比对
  const back = fs.readFileSync(abs, 'utf8');
  const got = [...back.matchAll(/^```text\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
  if (got.length !== blocks.length) {
    fail('回读校验：声明文件里抽到 ' + got.length + ' 段许可证正文，期望 ' + blocks.length + ' 段。');
    return;
  }
  const bad = got.filter((t, i) => t !== blocks[i]).length;
  if (bad) {
    fail('回读校验：' + bad + ' 段正文与包内源文件不一致。');
    return;
  }
  ok(
    '第三方声明已生成：' +
      NOTICES[0] +
      '（' +
      fs.statSync(abs).size +
      ' 字节，' +
      blocks.length +
      ' 段正文回读比对一致）',
  );
}

// ---------------------------------------------------------------- 前置校验

const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const prodDeps = pkgJson.dependencies || {};
const buildFiles = ((pkgJson.build || {}).files || []).map(String);

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

// 要重新生成第三方声明就先把文件写出来，后面的校验才有东西可查
if (WRITE_NOTICES) {
  writeNotices();
  if (failures.length) {
    console.error('[sync-vendor] 生成第三方声明失败，中止。');
    process.exit(1);
  }
}

// A. 清单里的包必须都是运行时依赖
for (const item of VENDOR) {
  if (!prodDeps[item.pkg]) {
    fail(
      item.pkg +
        ' 不在 package.json 的 dependencies 里。' +
        'Android 流水线用 `npm install --omit=dev`，装在 devDependencies 等于装不上，vendor 会缺文件。',
    );
  }
}

// B. 打包不含 node_modules，所以主进程侧不许 require 第三方包
const scanTargets = ['main.js', 'preload.js'];
const libFiles = fs.existsSync(libDir)
  ? fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).map((f) => path.join('lib', f))
  : [];
const builtins = new Set(builtinModules.flatMap((m) => [m, m.replace(/^node:/, ''), 'node:' + m]));
for (const rel of [...scanTargets, ...libFiles]) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const code = fs.readFileSync(abs, 'utf8');
  for (const m of code.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1];
    if (spec.startsWith('.')) continue;
    if (builtins.has(spec) || spec === 'electron') continue;
    fail(
      rel +
        ' 里 require(' +
        spec +
        ')，但打包时 build.files 有 `!node_modules/**`，装出来的 app.asar 里没有这个包，运行时会崩。' +
        '要么别在 Node 侧用它，要么把它从 build.files 的排除里放出来。',
    );
  }
}
if (buildFiles.includes('!node_modules/**')) {
  ok('build.files 排除了 node_modules，主进程侧也没有 require 第三方包');
} else {
  fail(
    'build.files 里没有 `!node_modules/**`：echarts / zrender / markdown-it 的传递依赖会被整包塞进 app.asar（实测 59.6 MiB）。' +
      '渲染层用的是 renderer/vendor/ 下的拷贝，node_modules 不需要进包。',
  );
}

// C. 该随包的随包、不该随包的别随包 —— 两边都容易漏
if (buildFiles.includes(NOTICES[0])) {
  ok('build.files 收录了 ' + NOTICES[0] + '，第三方声明会进安装包');
} else {
  fail(
    'build.files 里没有 `' +
      NOTICES[0] +
      '`：第三方声明不会进 app.asar。Apache-2.0 第 4(a) 条要求向接收方提供许可证副本，' +
      'MIT / ISC 要求在软件副本中保留版权与许可声明，这一条不能省。',
  );
}
for (const doc of DEV_DOCS) {
  if (buildFiles.includes(doc)) {
    fail(
      'build.files 里列了 `' +
        doc +
        '`：它是开发/交接文档（含内部选型过程、清单映射、体积预算），不该发给最终用户；' +
        '要随包分发的是 ' +
        NOTICES[0] +
        '。',
    );
  }
}
if (buildFiles.some((f) => /^!/.test(f) && DEV_DOCS.includes(f.slice(1)))) {
  ok('build.files 显式排除了开发文档：' + DEV_DOCS.join('、'));
}

// 声明文件要和已安装的组件版本对得上：升级了库却忘了重新生成，会在这里被打住
const noticesPath = path.join(root, NOTICES[0]);
if (!fs.existsSync(noticesPath)) {
  fail('desktop/' + NOTICES[0] + ' 不存在。执行 `node scripts/sync-vendor.js --write-notices` 生成。');
} else {
  const noticesText = fs.readFileSync(noticesPath, 'utf8');
  const stale = VENDOR.filter((item) => {
    let v = item.version;
    try {
      v = JSON.parse(fs.readFileSync(path.join(pkgDirOf(item.pkg), 'package.json'), 'utf8')).version;
    } catch (e) {
      /* 装了没装下面还有别的校验管，这里先按清单里的版本查 */
    }
    return !noticesText.includes('| ' + item.pkg + ' | ' + v + ' |');
  });
  if (stale.length) {
    fail(
      'desktop/' +
        NOTICES[0] +
        ' 与已安装的组件对不上：' +
        stale.map((i) => i.pkg).join('、') +
        '。跑 `node scripts/sync-vendor.js --write-notices` 重新生成，别让声明里的版本和实际发的包不一致。',
    );
  } else {
    ok(NOTICES[0] + ' 里的组件与版本和已安装的一致（' + VENDOR.length + ' 个）');
  }
}

// ---------------------------------------------------------------- 复制

const copyLog = [];
const expectedDest = new Set();
let budgetedBytes = 0;

for (const item of VENDOR) {
  const pkgDir = pkgDirOf(item.pkg);
  if (!fs.existsSync(pkgDir)) {
    fail('没找到 node_modules/' + item.pkg + '，先执行 npm install。');
    continue;
  }
  // 版本核对：清单里写的是 A 版本路径，装成 B 版本可能路径就变了
  const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  if (installed.version !== item.version) {
    fail(
      item.pkg + ' 装的是 ' + installed.version + '，清单写的是 ' + item.version + '。' +
        '升级要同时改 package.json 和 sync-vendor.js 的版本号，并重跑 VENDOR.md 里的体积统计。',
    );
    continue;
  }

  let itemBytes = 0;
  for (const spec of item.files) {
    for (const from of expandFrom(pkgDir, spec.from)) {
      const src = path.join(pkgDir, from);
      if (!fs.existsSync(src)) {
        fail(item.pkg + ' 里没有 ' + from + '（装的版本可能和清单对不上）');
        continue;
      }
      const destName = spec.to.endsWith('/')
        ? spec.to + path.basename(from)
        : spec.to;
      const dest = path.join(destDir, destName);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);

      const a = fs.readFileSync(src);
      const b = fs.readFileSync(dest);
      if (!a.equals(b)) {
        fail(destName + ' 复制后内容对不上，中止。');
        continue;
      }
      expectedDest.add(destName.split(path.sep).join('/'));
      itemBytes += a.length;
      copyLog.push({ pkg: item.pkg, dest: destName, bytes: a.length });
      if (item.budgeted !== false) budgetedBytes += a.length;
    }
  }
  item.bytes = itemBytes;
}

// echarts 的历史 fallback：包内路径没有时按老位置找
const echartsItem = VENDOR[0];
if (echartsItem && (echartsItem.bytes || 0) === 0) {
  const alt = echartsItem.fallbackFrom.find((p) => fs.existsSync(p));
  if (alt) {
    const dest = path.join(destDir, 'echarts.min.js');
    fs.copyFileSync(alt, dest);
    echartsItem.bytes = fs.statSync(dest).size;
    expectedDest.add('echarts.min.js');
    copyLog.push({ pkg: 'echarts', dest: 'echarts.min.js', bytes: echartsItem.bytes });
    console.log('[sync-vendor] echarts 走 fallback：' + alt);
  }
}
const echartsDest = path.join(destDir, 'echarts.min.js');
if (!fs.existsSync(echartsDest)) {
  fail('renderer/vendor/echarts.min.js 没生成出来 —— 先执行 npm install（echarts 在 dependencies 里）。');
} else {
  const size = fs.statSync(echartsDest).size;
  if (size < (echartsItem.minBytes || 0)) {
    fail('echarts 只有 ' + size + ' 字节，明显不对（正常约 1.1 MB）。');
  }
}

// ---------------------------------------------------------------- 共享模块

const missing = SHARED.filter((f) => !fs.existsSync(path.join(libDir, f)));
if (missing.length) fail('lib/ 里缺这些文件：' + missing.join(', '));

for (const name of SHARED) {
  const src = path.join(libDir, name);
  const dest = path.join(destDir, name);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dest);
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dest);
  if (!a.equals(b)) {
    fail(name + ' 复制后内容对不上，中止。');
    continue;
  }
  expectedDest.add(name);
}

if (failures.length) {
  console.error('[sync-vendor] 有 ' + failures.length + ' 项不通过，没有完成同步。');
  process.exit(1);
}

// ---------------------------------------------------------------- 随包声明 / 开发文档

for (const doc of NOTICES) {
  const src = path.join(root, doc);
  if (!fs.existsSync(src)) {
    fail(
      'desktop/' + doc + ' 不见了 —— 它是随包分发的第三方声明，别删；需要重做就跑 `node scripts/sync-vendor.js --write-notices`。',
    );
    continue;
  }
  const dest = path.join(destDir, doc);
  fs.copyFileSync(src, dest);
  expectedDest.add(doc);
}

// renderer/vendor/ 里的文件会进 APK 与 app.asar（手机侧没有 build.files 可拦），
// 所以开发/交接文档出现在这里等于直接发给最终用户 —— 拦住，别只靠 build.files 的排除规则。
for (const doc of DEV_DOCS) {
  if (fs.existsSync(path.join(destDir, doc))) {
    fail(
      'renderer/vendor/' +
        doc +
        ' 是开发/交接文档，但它在 renderer/vendor/ 下，会随 APK 与 app.asar 一起发给最终用户。' +
        '删掉它：`rm renderer/vendor/' +
        doc +
        '`（源文件在 desktop/' +
        doc +
        '，留给维护者看）。',
    );
  }
}

if (failures.length) {
  console.error('[sync-vendor] 有 ' + failures.length + ' 项不通过，没有完成同步。');
  process.exit(1);
}

// ---------------------------------------------------------------- 报告

console.log('[sync-vendor] 第三方库（' + VENDOR.length + ' 个包）：');
for (const item of VENDOR) {
  const meta = [
    item.pkg + '@' + item.version,
    item.license,
    (item.bytes || 0) + ' 字节',
  ].join('  ');
  console.log('  · ' + meta.padEnd(52) + '  ' + item.files.length + ' 项');
}
console.log('[sync-vendor] 共享模块：' + SHARED.join(', '));
console.log('[sync-vendor] 随包声明：' + NOTICES.join(', ') + '（开发文档 ' + DEV_DOCS.join('、') + ' 不进包）');
console.log(
  '[sync-vendor] 完成，共 ' +
    (copyLog.length + NOTICES.length) +
    ' 个文件写到 renderer/vendor/；' +
    '新增库合计 ' +
    budgetedBytes +
    ' 字节（' +
    (budgetedBytes / 1024).toFixed(1) +
    ' KB）',
);

if (budgetedBytes > VENDOR_BUDGET) {
  console.warn(
    '\n[sync-vendor] ⚠ 新增 vendor 体积 ' +
      budgetedBytes +
      ' 字节，超过红线 ' +
      VENDOR_BUDGET +
      ' 字节（手机 APK 现在只有 7.6 MB）。' +
      '\n             要塞进去就先在 VENDOR.md 里写清「值不值得」，别默默塞。\n',
  );
}

// 值班提示：vendor/ 下有不是本次同步产生的文件（改过清单、换过库时会出现残留）
const extras = [];
const walkDir = (dir, prefix) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = (prefix ? prefix + '/' : '') + e.name;
    if (e.isDirectory()) walkDir(path.join(dir, e.name), rel);
    else if (!expectedDest.has(rel)) extras.push(rel);
  }
};
walkDir(destDir, '');
if (extras.length) {
  console.warn(
    '[sync-vendor] ⚠ renderer/vendor/ 下有 ' +
      extras.length +
      ' 个文件不是本次同步产生的，可能是改清单后的残留：' +
      extras.slice(0, 8).join(', ') +
      (extras.length > 8 ? ' …' : ''),
  );
}
