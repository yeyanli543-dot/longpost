# renderer/vendor/ 里都是什么，怎么接线

> **这是开发/交接文档，只留在 `desktop/`，不随包分发。**
>
> 它本来有想过复制一份进 `renderer/vendor/` 让人就近看，但 `renderer/vendor/` 整个目录会被
> 打进 `app.asar`，手机版 Capacitor 又只打包 `renderer/` 一个目录 —— 复制进去就等于把
> 内部的选型过程、清单映射、砍库顺序发给最终用户了。所以现在**只放在这里**，
> 而且 `sync-vendor.js` 会主动检查：一旦 `renderer/vendor/` 下出现 `VENDOR.md` 或
> `VENDOR-LICENSES.md`，同步直接报错让你删掉。
>
> 随包分发的是**面向接收方的合规声明** `desktop/THIRD-PARTY-NOTICES.md`
> （组件 + 版本 + 许可证全文 + 版权行，Apache-2.0 的 NOTICE 也在里面）。
> 三者分工：
>
> | 文件 | 给谁看 | 随包分发 |
> | --- | --- | --- |
> | `desktop/VENDOR.md`（本文件） | 维护者 / 接线的人 | 否 |
> | `desktop/VENDOR-LICENSES.md` | 维护者（许可证审计明细，含兼容性论证） | 否 |
> | `desktop/THIRD-PARTY-NOTICES.md` | 最终用户 / 接收方 | **是**（asar 根目录 + `renderer/vendor/`） |
>
> `THIRD-PARTY-NOTICES.md` 是生成物，别手改：跑 `node scripts/sync-vendor.js --write-notices`
> 重新生成（改了库版本也要重跑，否则常规同步会因为版本对不上而报错）。

这个目录**全部是生成物，不要手改**。里面每一个文件都由 `desktop/scripts/sync-vendor.js`
按清单从 `node_modules` 挑出来复制，改完清单跑一次：

```bash
cd desktop
npm install        # 会自动跑 prepare → sync-vendor
# 或者单独重跑
node scripts/sync-vendor.js
```

为什么要复制而不是直接引 `node_modules`：手机版（Capacitor）只打包 `renderer/` 这一个目录，
`index.html` 里出现跳出目录的引用在手机上拿不到，所以渲染层必须自给自足。
复制完脚本会逐字节比对，不一致直接报错退出。

---

## 一、往 index.html 加什么

**这份清单交给 index.html 的负责人执行**；本文只列原文，不代替你改文件。
加完之后 `node scripts/verify-mobile.js` 仍然应当 68/68 全过（已实测，见交付报告）。

### 1. 样式（加在现有两个 `<link rel="stylesheet">` 后面）

```html
<link rel="stylesheet" href="vendor/katex/katex.min.css" />
<link rel="stylesheet" href="vendor/prism/themes/prism.min.css" />
<link rel="stylesheet" href="vendor/prism/themes/prism-tomorrow.min.css" />
```

`prism.min.css` 是浅色主题、`prism-tomorrow.min.css` 是深色主题。两套都加载，靠
`<html data-theme>` / `.token` 的选择器覆盖来切换（`katex.min.css` 与主题无关，一直要）。

### 2. 脚本（加在现有 `vendor/echarts.min.js` 那一批的**后面**、`backend-idb.js` 的**前面**）

顺序不能乱，两条硬约束：`katex.min.js` 必须在 `auto-render.min.js` 之前（后者在加载时就把
全局 `katex` 抓走了）；`prism.js` 必须在所有 `prism-components` 之前；`prism-c.min.js`
必须在 `prism-cpp.min.js` 之前。

```html
<link rel="stylesheet" href="vendor/katex/katex.min.css">
<!-- 数学公式：KaTeX（先把 katex 本体加载了，再加载自动渲染扩展） -->
<script src="vendor/katex/katex.min.js"></script>
<script src="vendor/katex/contrib/auto-render.min.js"></script>

<!-- 代码高亮：Prism 本体 + 20 个语言组件（按依赖顺序，c 在 cpp 前） -->
<script src="vendor/prism/prism.js"></script>
<script src="vendor/prism/components/prism-bash.min.js"></script>
<script src="vendor/prism/components/prism-c.min.js"></script>
<script src="vendor/prism/components/prism-cpp.min.js"></script>
<script src="vendor/prism/components/prism-csharp.min.js"></script>
<script src="vendor/prism/components/prism-diff.min.js"></script>
<script src="vendor/prism/components/prism-docker.min.js"></script>
<script src="vendor/prism/components/prism-go.min.js"></script>
<script src="vendor/prism/components/prism-ini.min.js"></script>
<script src="vendor/prism/components/prism-java.min.js"></script>
<script src="vendor/prism/components/prism-json.min.js"></script>
<script src="vendor/prism/components/prism-latex.min.js"></script>
<script src="vendor/prism/components/prism-markdown.min.js"></script>
<script src="vendor/prism/components/prism-nginx.min.js"></script>
<script src="vendor/prism/components/prism-properties.min.js"></script>
<script src="vendor/prism/components/prism-python.min.js"></script>
<script src="vendor/prism/components/prism-rust.min.js"></script>
<script src="vendor/prism/components/prism-sql.min.js"></script>
<script src="vendor/prism/components/prism-toml.min.js"></script>
<script src="vendor/prism/components/prism-typescript.min.js"></script>
<script src="vendor/prism/components/prism-yaml.min.js"></script>

<!-- 增强 Markdown：markdown-it 本体 + 4 个插件（本体在插件前） -->
<script src="vendor/markdown-it/markdown-it.umd.min.js"></script>
<script src="vendor/markdown-it/markdown-it-task-lists.min.js"></script>
<script src="vendor/markdown-it/markdown-it-footnote.min.js"></script>
<script src="vendor/markdown-it/markdown-it-deflist.min.js"></script>
<script src="vendor/markdown-it/markdown-it-emoji.min.js"></script>

<!-- 本地全文搜索（中文）、CSV/表格、长图导出、手机手势 -->
<script src="vendor/flexsearch/flexsearch.compact.min.js"></script>
<script src="vendor/papaparse/papaparse.min.js"></script>
<script src="vendor/html-to-image/html-to-image.js"></script>
<script src="vendor/swiped-events/swiped-events.min.js"></script>
<script src="vendor/hammerjs/hammer.min.js"></script>
<script src="vendor/pulltorefreshjs/pulltorefresh.umd.min.js"></script>
```

> 一行都不想加的话：每个库都是**独立可选**的，只加你要用的那几个即可。
> 但 `katex.min.js` + `auto-render.min.js` 是一对，`prism.js` + 语言组件是一组，别拆一半。

---

## 二、逐库说明

体积是**未压缩的字节数**（就是拷进 `renderer/vendor/` 的大小）。所有库的许可证都是
MIT / ISC / Apache-2.0，与仓库自身的 MIT 兼容。许可证记录分两份，别混：
`desktop/VENDOR-LICENSES.md` 是**给维护者看的审计明细**（含兼容性论证，不随包）；
`desktop/THIRD-PARTY-NOTICES.md` 是**随包发给接收方**的合规声明（许可证全文 + 版权行 + echarts 的 NOTICE），
由 `node scripts/sync-vendor.js --write-notices` 生成，不要手改。

### 1. KaTeX 0.19.0 — LaTeX 数学公式

- 仓库：https://github.com/KaTeX/KaTeX ｜ License：MIT ｜ 体积：**560,939 字节**（547.8 KB）
- 解决什么：把 `$E=mc^2$` / `$$\int_0^\infty e^{-x^2}dx$$` 渲染成印刷级公式，离线可用、无网络请求
- 对标谁：Obsidian / Notion / 语雀 的公式块（它们内部也是 KaTeX）
- 全局名：`katex`（小写）、`renderMathInElement`（contrib/auto-render）
- 最小调用：

```js
// 单条，返回 HTML 字符串（同步、不需要等）
const html = katex.renderToString('\\int_0\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}', {
  displayMode: false,
  throwOnError: false,   // 写错了显示红色原文，而不是抛异常打断渲染
});

// 或者扫一个容器，把 $...$ / $$...$$ 全部替换掉
renderMathInElement(previewEl, {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
  ],
  throwOnError: false,
});
```

- 接线注意：
  - 公式**必须**先经过 HTML 转义再交给 KaTeX，别把用户原文直接拼进 `renderToString`；
    `throwOnError: false` 时 KaTeX 会把出错的那段原样输出（已转义），不会再 `eval`。
  - 预览里每次重渲染后都要重新调 `renderMathInElement`，因为 `preview.innerHTML` 被整段换掉了。
  - 导出 HTML 时（`export-web.js` / `lib/export-html.js`）如果也想带公式，
    最省事的做法是把 `renderToString` 的**结果**（已经是纯 HTML + class）写进正文，
    导出页只要带上 `katex.min.css` 和字体即可，不需要带 JS。
- 风险：LaTeX 命令覆盖约 300 个（MathJax 约 800 个），`\begin{tikzcd}` 这类宏包不支持 ——
  写论文级公式的人会碰到边界，但写作场景足够。字体只搬了 `.woff2`（254 KB，三种格式全搬是 1.03 MB），
  老到不支持 woff2 的浏览器不会命中，Electron 44 与 Android WebView 都支持。

### 2. Prism.js 1.30.0 — 代码块语法高亮

- 仓库：https://github.com/PrismJS/prism ｜ License：MIT ｜ 体积：**104,342 字节**（101.9 KB，含 20 种语言 + 2 套主题）
- 解决什么：` ```js ` 代码块染上色，对标 Typora / Obsidian / GitHub 的代码渲染
- 全局名：`Prism`
- 最小调用（**注意：现有渲染层产出的不是 `language-xxx`，而是 `data-lang`**，
  所以不能只调 `Prism.highlightAll()`，得按下面这个小适配函数走）：

```js
// 每次预览渲染完调一次。lib/markdown.js 现在产出的是
//   <pre class="code-block"><code data-lang="js">…</code></pre>
function highlightCodeBlocks(root) {
  root.querySelectorAll('pre.code-block > code[data-lang]').forEach(function (el) {
    const lang = el.getAttribute('data-lang');
    const grammar = Prism.languages[lang];
    if (!grammar) return;                    // 没装这门语言就保持原样，不要报错
    el.className = 'language-' + lang;       // 让主题的底色规则生效
    el.innerHTML = Prism.highlight(el.textContent, grammar, lang);
  });
}
```

- 别名是一套的：`js`/`ts`/`py`/`sh`/`shell`/`yml`/`md`/`c++`/`cs`/`tex`/`dockerfile` 都认得，
  所以作者写 ` ```py ` 不用改。完整 alias 表见 `node_modules/prismjs/components.json`。
- 接线注意：prism.js 的 npm 构建里 `manual` 默认是假，**页面加载完它会自己扫一遍
  `language-xxx`**。适配函数自己会幂等（第二次跑时 `data-lang` 还在，重算结果一样），
  不冲突；不想要自动那一下，就在引 `prism.js` 之前先写 `window.Prism = { manual: true }`，
  但内联脚本被 CSP 挡着，得单独放文件。
- 标谁：Prism 与 highlight.js 的差别在**体积构成**：Prism 核心只带
  markup/css/clike/javascript，其余按语言单独引；highlight.js 的 npm 包里
  **根本没有浏览器单文件构建**（顶层只有 `es/`、`lib/`、`styles/`，没有 `dist/`、
  没有 `unpkg`/`jsdelivr` 字段），无打包器环境下引它的 CJS 会当场
  `ReferenceError: exports is not defined`。所以这里选 Prism。
- 风险：Prism 的 v1 分支近年迭代慢（社区有「停滞」的抱怨）；但它只是「正则 + class」，
  没有运行时依赖，停滞带来的风险主要是新语言支持滞后 —— 需要新语言就
  `node_modules/prismjs/components/prism-<lang>.min.js` 加一条清单即可。

### 3. markdown-it 15.0.2 + 4 个插件 — 增强 Markdown 渲染

- 仓库：https://github.com/markdown-it/markdown-it ｜ License：MIT ｜ 体积：**132,176 字节**（129.1 KB）
- 解决什么：补齐现在手写渲染器缺的那几样 —— **任务清单**（`- [x]`）、**脚注**（`[^1]`）、
  **定义列表**、**emoji 简写**（`:smile:`）、**表格对齐**、删除线、嵌套列表等 CommonMark/GFM 细节
- 对标谁：GitHub Flavored Markdown / Typora / Obsidian 的 Markdown 子集
- 全局名：`markdownit`、`markdownitTaskLists`、`markdownitFootnote`、`markdownitDeflist`、`markdownitEmoji`
- 最小调用：

```js
const md = markdownit({ html: false, linkify: true, breaks: false })
  .use(markdownitTaskLists, { enabled: true, label: true })   // <input type="checkbox" disabled>
  .use(markdownitFootnote)
  .use(markdownitDeflist)
  .use(markdownitEmoji);

const html = md.render('# 标题\n\n- [x] 已完成\n- [ ] 待办\n\n这里有个脚注[^1]\n\n[^1]: 脚注正文\n\n:smile:');
```

- 接线注意：
  - **`html: false` 必须保持**。现有 `lib/markdown.js` 有一整套「`<script>` / `<img onerror>`
    / `javascript:` / `data:` 一律拦下」的安全策略，`smoke-test.js` 第 [2] 组钉着它。
    markdown-it 开 `html: true` 等于绕过这套策略 —— 要替换渲染器时先把安全组测试
    逐条对着 markdown-it 复核一遍，别直接切。
  - markdown-it 的输出 class 是 `language-js`（`<pre><code class="language-js">`），
    和现在 `lib/markdown.js` 的 `data-lang` 不同 —— 换成 markdown-it 之后，
    上面 Prism 的适配函数里那句「加 class」就可以去掉了。
  - emoji 只搬了 **light** 包（6,394 字节，常用几百个）。要全量（约 60 KB）把
    `sync-vendor.js` 里的 `markdown-it-emoji-light.min.js` 换成 `markdown-it-emoji.min.js`。
  - markdown-it 有 6 个传递依赖（argparse / entities / linkify-it / mdurl / punycode.js / uc.micro），
    浏览器构建已经把源码打进去了，运行时不需要它们。
- 风险：markdown-it 出来的 HTML 与你现有渲染器的结构不完全一样（代码块、表格的 class 都变了），
  所以「替换 `lib/markdown.js`」是一次**接口变更**，得连 `smoke-test.js` 第 [1][2] 组一起改，
  并且导出/预览/手机三处都验证。**保守用法是先不替换**，只在需要脚注/任务清单的场景接进来。

### 4. html-to-image 1.11.13 — 文章长图 / 分享卡片

- 仓库：https://github.com/bubkoo/html-to-image ｜ License：MIT ｜ 体积：**20,562 字节**（20.1 KB）
- 解决什么：把正文 DOM 导成 PNG，做「一篇文章一张长图」，对标微信公众号长图 / X 的分享卡片
- 全局名：`htmlToImage`
- 最小调用：

```js
const dataUrl = await htmlToImage.toPng(document.getElementById('preview'), {
  backgroundColor: '#ffffff',
  pixelRatio: 2,            // 2 倍图，发出去不糊
  cacheBust: false,         // 离线环境，别在 URL 上加时间戳
});
// dataUrl 形如 "data:image/png;base64,…"，可直接塞进 <a download> 或交给系统分享
```

- 接线注意：
  - 用的是 SVG `<foreignObject>` 路线：把节点连同计算样式克隆进一个 `<svg>`，再光栅化。
    好处是 CSS3（圆角、阴影、渐变、flex/grid）还原度比 canvas 手绘路线高；
    代价是**图片必须是 data: / blob: 或同源**。本项目正文里的图是 `lp://files/xxx`，
    而 CSP 的 `img-src` 已经放了 `lp:` 和 `data:`，桌面端可以直接抓；
    如果碰到抓不到的情况，先走一遍 `export-web.js` 里那套「附件转 data: URL」的逻辑再导图。
  - 字体：它会把页面里用到的 web font 内联进 SVG。离线 file:// 下读
    `document.styleSheets` 的 cssRules 可能被安全策略挡，挡了就回退系统字体 ——
    表现为长图里的字不是页面里那个字体，不影响可读性。
- 风险：**不同实现路线差异很大**，同一张卡片上 html2canvas 会「悄悄丢图」而
  html-to-image 会直接 reject。所以接长图导出时务必加 try/catch + 失败提示，
  别让用户点了没反应。这里选它还有一个理由：20 KB vs html2canvas 的 198 KB，
  手机 APK 只有 7.6 MB，体积这一档差别不小。

### 5. FlexSearch 0.8.212 — 本地全文搜索（中文）

- 仓库：https://github.com/nextapps-de/flexsearch ｜ License：Apache-2.0 ｜ 体积：**28,370 字节**（27.7 KB）
- 解决什么：给文章列表做离线全文检索，**中文不需要词典**：它自带的 `Charset.CJK`
  编码器按 CJK 字符组合建索引（等价于 bigram 切分），比「按字切 + 单字匹配」召回准得多
- 对标谁：Obsidian 的本地搜索（Obsidian 用的是自己那套 CJK 处理）
- 全局名：`FlexSearch`（`FlexSearch.Index` / `FlexSearch.Document` / `FlexSearch.Charset`）
- 最小调用：

```js
const Charset = FlexSearch.Charset;
const articles = new FlexSearch.Index({              // 搜文章
  encoder: Charset.CJK,                              // ← 中文靠这一行
  tokenize: 'forward',
  resolution: 9,
});
articles.add(0, '一篇讲 Electron 源码保护的文章');

articles.search('源码保护');        // → [0]
articles.search('Electron');        // → [0]

// 要「标题 + 正文 + 标签」分开加权，用 Document：
const doc = new FlexSearch.Document({
  encoder: Charset.CJK,
  document: { id: 'id', index: ['title', 'content', 'tags'] },
});
doc.add({ id: 'a1', title: '标题', content: '正文正文', tags: ['技术'] });
doc.search('正文', { index: 'content' });
```

- 接线注意：索引是内存对象，进程重启就没了 —— 每次打开应用、以及文章增删改之后重建一遍
  （当前这个数据量是毫秒级）。要跨会话保留得自己写进 IndexedDB（`FlexSearch.IndexedDB`
  在 `bundle` 构建里，`compact` 构建没有，需要的话换 `flexsearch.bundle.min.js`，51 KB）。
- 风险：0.8 相对 0.7 是重写，**API 不兼容**（0.7 是 `charset: 'cjk'`，0.8 是
  `encoder: Charset.CJK`），网上大量教程还是 0.7 的写法，抄之前先看版本。已钉死 0.8.212。
- 另一个零成本选项：V8 自带 `Intl.Segmenter`（Electron 44 与 Android WebView 都有），
  `new Intl.Segmenter('zh', {granularity: 'word'})` 能直接做中文分词，
  **0 字节**。它适合「分词后自己维护倒排表」的写法；要现成的索引/打分/前缀检索就用 FlexSearch。

### 6. PapaParse 5.7.0 — 表格数据层

- 仓库：https://github.com/mholt/PapaParse ｜ License：MIT ｜ 体积：**18,874 字节**（18.4 KB）
- 解决什么：给「表格可视化编辑」提供数据层 —— 从 Excel/CSV 复制粘贴进来的内容解析成二维数组，
  再把编辑结果写回 CSV/TSV 或 Markdown 表格。Excel 粘贴出来的其实是 **TSV**，
  用 `delimiter: '\t'` 或 `Papa.parse(text, {delimiter: ''})` 自动猜
- 全局名：`Papa`
- 最小调用：

```js
// 粘贴板文本 → 二维数组（Excel 粘贴默认是制表符分隔）
const { data } = Papa.parse(pastedText, { delimiter: '', skipEmptyLines: true });

// 二维数组 → Markdown 表格
const md = [
  '| ' + data[0].join(' | ') + ' |',
  '| ' + data[0].map(() => '---').join(' | ') + ' |',
  ...data.slice(1).map((row) => '| ' + row.join(' | ') + ' |'),
].join('\n');

// 二维数组 → CSV（要写回文件时）
Papa.unparse(data);
```

- 接线注意：`Papa.parse` 对**不认识的输入不会抛错**，它把问题塞进 `result.errors` ——
  接线时要判 `errors.length`，否则用户会看到「粘贴了没反应」。
- 风险：它只管数据格式，不管 UI。真要「可视化表格编辑」还得写一层表格组件
  （可编辑单元格 + 增删行列）；这个库保证的是「不用自己手写 CSV 状态机」。

### 7. 手机手势三件套

| 库 | 版本 | License | 体积 | 全局名 | 解决什么 |
| --- | --- | --- | --- | --- | --- |
| swiped-events | 1.2.0 | MIT | 1,997 字节 | 无（自己挂 document 监听） | 零 JS 的声明式滑动：给元素加 `swiped-left` / `swiped-right` 属性就行 |
| Hammer.js | 2.0.8 | MIT | 20,765 字节 | `Hammer` | 手势原语：`press`（长按菜单）、`pinch`（双指缩放预览）、`pan` |
| pulltorefresh.js | 0.1.22 | MIT | 7,433 字节 | `PullToRefresh` | 下拉刷新列表 |

```js
// swiped-events：HTML 上直接写属性，JS 侧只听事件
document.addEventListener('swiped-left', (e) => { /* e.target 是被滑的元素 */ });

// Hammer：长按出菜单 + 双指捏合
const mc = new Hammer(document.getElementById('preview'));
mc.on('press', (e) => openContextMenu(e.center));
mc.get('pinch').set({ enable: true });

// 下拉刷新（只在手机上 init，桌面端不要）
if (matchMedia('(max-width: 720px)').matches) {
  PullToRefresh.init({ mainElement: '#list', onRefresh: async () => { await reload(); } });
}
```

- 接线注意：
  - swiped-events 依赖 `touchstart/touchend`，桌面鼠标环境不触发 —— 想在桌面调试，
    去 DevTools 开设备模拟（触摸模式）。
  - Hammer 默认会往元素上写 `touch-action` 样式并 `preventDefault`，在**可滚动容器**上
    大面积用会让页面滚不动。只把 recognizer 装在具体的小元素（卡片、预览区）上，
    别装在 `document` 上。
  - 三个库各管一段、互不重叠，可以只留你要的那个。
- 风险：Hammer.js 上游 2018 年后基本停更（仓库已归档），2.0.8 只是元数据发布，
  文件里的 `VERSION` 仍是 `2.0.7`。它的行为很稳定，但不会有安全更新；
  对「手势」这种小面积极低的攻击面，接受。另一个风险是它给手势 `preventDefault`，
  与 Chrome 的 `passive` 事件优化有冲突，必要时用 `Hammer.defaults.touchAction = 'auto'`。

---

## 三、体积预算

| 分组 | 字节 | 说明 |
| --- | ---: | --- |
| 新增第三方库合计 | **895,458**（874.5 KB） | 本次新装的 13 个库 |
| echarts.min.js（存量） | 1,121,883 | 本来就有，未变 |
| lib/ 共享模块拷贝（存量） | 41,538 | markdown/chart/repo/page-style/outline，未变 |
| 随包合规声明 | 44,344 | `THIRD-PARTY-NOTICES.md`，面向接收方，**必须**随包 |
| **`renderer/vendor/` 总计** | **2,103,223**（64 个文件） | 手机 APK 里 web 资源的体积 |

新增部分占手机 APK（现在 7.6 MB）的约 **11%**。`sync-vendor.js` 里有一条
`VENDOR_BUDGET = 1.5 MB` 的红线，只对**新增库**生效，超了会在安装/构建时打印告警，
不静默通过。

合规声明那 44,344 字节不计入红线：它是 Apache-2.0 第 4(a) 条与 MIT/ISC 的署名义务，
不是功能体积，砍库也砍不掉它（只随组件增减而变，约 APK 的 0.6%）。

嫌大就按这个顺序砍（都在 `sync-vendor.js` 的清单里删条目即可）：
KaTeX 547.8 KB（其中字体 254 KB）＞ markdown-it 全家 129.1 KB ＞ Prism 101.9 KB ＞
FlexSearch 27.7 KB ＞ html-to-image 20.1 KB ＞ Hammer 20.3 KB ＞ Papa 18.4 KB ＞
下拉刷新 7.3 KB ＞ swiped-events 2.0 KB。

---

## 四、加 / 删库的正确流程

1. `npm install <pkg>@<精确版本>`（**必须精确版本**，仓库里所有依赖都是钉死的），
   并确认它被写进 `desktop/package.json` 的 **`dependencies`** 而不是 `devDependencies`
   —— Android 流水线用的是 `npm install --omit=dev`，装成 dev 等于没装。
2. 确认它有**浏览器能直接 `<script>` 引入**的产物：UMD/IIFE 单文件，或者至少 `dist/` 下有
   `.min.js`。只有 CJS/ESM 的库（如 highlight.js）不能用。
3. 在 `scripts/sync-vendor.js` 的 `VENDOR` 数组里加一条：`pkg` / `version` / `license` /
   `home` / `why` / `files`（只挑运行时真正要的那几个文件）。
4. `node scripts/sync-vendor.js --write-notices` 重新生成随包声明（新库要进声明文件，
   否则常规同步会因为声明里缺这个组件而报错），再 `node scripts/sync-vendor.js`
   跑一遍完整校验，清单会检查：
   在 `dependencies` 里、实装版本与清单一致、文件存在且复制后逐字节一致、
   主进程侧没有 `require` 第三方包（因为打包时 `node_modules` 整个不进 app.asar）、
   `build.files` 收录了 `THIRD-PARTY-NOTICES.md` 且没有收录开发文档、
   `renderer/vendor/` 下没有混进开发文档、声明里的组件版本与实装一致。
5. 在 `index.html` 里加 `<script>`/`<link>` 原文（记到本文），再跑
   `node scripts/smoke-test.js` 与 `node scripts/verify-mobile.js`。
6. 更新本节与 `desktop/VENDOR-LICENSES.md` 的体积、许可证记录。

删库：从 `VENDOR` 数组里删掉该条 → 重跑 sync-vendor（会提示 `renderer/vendor/` 下的残留
文件）→ 手工删掉残留 → 从 `index.html` 去掉标签 → 从 `dependencies` 卸载。

---

## 五、和 CSP / 手机的关系

`index.html` 的 CSP 是
`default-src 'none'; script-src 'self' file:; style-src 'self' 'unsafe-inline' file:; img-src 'self' file: lp: data: blob: https: http:; font-src 'self' file: data:; connect-src 'self';`

- **没有任何 CDN、没有任何内联脚本**：上面所有库都是本地文件，靠 `file:` 放行。
- 这 13 个库里**没有一处 `eval(` / `new Function(`**（已逐个 grep 过），所以不需要
  `'unsafe-eval'`；真需要 `'unsafe-eval'` 的库（例如某些模板引擎）不要引。
- KaTeX 字体走 `font-src 'self' file:`，是本地 `.woff2`，不联网。
- 长图导出把节点光栅化成 `data:image/png`，走 `img-src 'self' file: lp: data: blob: https: http:`，不联网。
- 手机版：`renderer/vendor/**` 会被 Capacitor 原样打进 APK，所以这里每加一个库，
  APK 就大一点 —— 这就是上面那条 1.5 MB 红线的由来。
- 手机侧**没有 `build.files` 可以拦**，`renderer/vendor/` 下的东西一律进 APK。
  所以随包合规声明放这里（`renderer/vendor/THIRD-PARTY-NOTICES.md`），
  而开发文档（`VENDOR.md` / `VENDOR-LICENSES.md`）放进来就等于直接发给最终用户，
  `sync-vendor.js` 会把这种情况判为失败。

---

## 六、实测里踩到的接线坑

下面每一条都是**真的跑过**才发现的（在 Electron 44 + 与 index.html 逐字相同的 CSP 下，
离线 file://，无打包器）。照着一、二节接线时，这几处最容易「装了跟没装一样」。

**1. 高亮：不能只调 `Prism.highlightAll()`。** 现有 `lib/markdown.js` 产出的是
`<code data-lang="js">`，没有 `language-js` 类，Prism 自带的自动扫描认不出它。
必须用二.2 那个按 `data-lang` 取 grammar 的适配函数。实测：3 个代码块（js/ts/go）
过一遍适配函数出 **25 个 `token`**，且 `1 < 2` 这种小于号被正确转义成 `&lt;`。

**2. 公式：`renderMathInElement` 每次重渲染后都要重跑。** 预览是整段换 innerHTML 的，
换完公式就没了。实测一次容器里 `$E=mc^2$` 与 `$$\sum...$$` 各渲染出 1 个 `.katex`（共 2 个）。

**3. 公式字体：20 个 `@font-face` 登记后大多停在 `unloaded`，这是正常的。**
KaTeX 按需取字体（首屏不用公式就不下字体）。别看到 `document.fonts.check()` 返回
`false` 就以为字体没搬进来 —— 实测显式 `new FontFace(...KaTeX_Main-Regular.woff2).load()`
在离线 file:// 下**成功解码**，说明只搬 woff2 是够的。

**4. Hammer：在 Electron/Chromium 里喂 `mousedown` 它一个事件都收不到。**
`'PointerEvent' in window` 为真时 Hammer 选的是 `PointerEventInput`，只认
`pointerdown / pointermove / pointerup`。写自动化测试或做桌面端手势兼容时要按 pointer 系列喂
（实测：pointerdown + 330ms → `press`；pointer 横滑 → `swipeleft`）。
另外 `Hammer.VERSION` 会报 `2.0.7`，那是因为 2.0.8 只动了发布元数据，**不是装错了**。

**5. 下拉刷新默认只听 touch，桌面端必须手动开 pointer 模式。**
`PullToRefresh.setPointerEventsMode(true)`（默认是 `false`）；手势落在哪个元素上由
**`triggerElement`** 决定，不是 `mainElement`；而且它是**懒建 DOM** —— `init()` 之后
不会立刻出现元素，要真的开始一次下拉才插入。实测（开 pointer 模式后）：
`init` 后 `.ptr--ptr` 数量 0 → 下拉 80px 后 1 个，类名为
`ptr--ptr ptr--pull ptr--release`，并且它自己注入的样式表 725 字节（靠 CSP 里的
`style-src 'unsafe-inline'` 才上色）。

**6. 长图：同一张卡片，两条路线产出不一样。** 实测同一个 DOM（圆角 + 渐变 + 中文加粗）：
`htmlToImage.toPng` → `data:image/png;base64,iVBORw0K…`，**105,474 B / 126 ms**；
对照 `html2canvas` → **41,892 B / 97 ms**。体积差 2.5 倍，说明两者对渐变/字体的处理不同，
**换库会改变成图效果**，接线时别把两者当等价替换。另外 `htmlToImage` 失败时会
reject（不会悄悄给你一张缺图的图），所以务必 try/catch。

**7. 双向检查过的 CSP 事实（不是猜的）。** 同一个页面里主动试过：
`eval('1+1')` 当场抛 `EvalError: … 'unsafe-eval' is not an allowed source`；
插入带正文的 `<script>` 不执行；插入 `https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js` 的 `<script>` 被拦
并记进 `securitypolicyviolation`。**而这 22 项功能全部通过** —— 说明这批库一个都不依赖
它们。页面里 39 个外链资源（37 脚本 + 3 样式表）**全部是 `file://`**，
唯一一条远程请求就是上面那个探针。

**8. 安全策略别丢。** `markdown-it` 用 `html: false` 时 `<script>`、`<img onerror>`
会被转义（实测如此），但它**不会**拦 `[点我](javascript:alert(1))` 这种链接
（实测原样输出）。替换渲染器时要沿用现有 `lib/markdown.js` 里那套 URL 白名单，
`smoke-test.js` 第 [2] 组正是钉这个的。

