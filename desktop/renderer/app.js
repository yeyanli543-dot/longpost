/**
 * LongPost 渲染层主逻辑（无框架、无打包器的原生 JS）。
 *
 * 这个文件是桌面版（Electron）和手机版（Capacitor WebView）共用的，所以：
 *   - 数据一律走 window.LPPlatform，不直接碰文件系统 / IndexedDB；
 *   - 平台差异只通过 LP.capabilities 判断，不写 if (是不是安卓)；
 *   - 一行 ES2020 的语法都没有（可选链、空值合并），因为自检会用 new Function 编译它。
 *
 * 结构（从上往下读即可）：
 *   1. 引用与状态         2. 小工具       3. 提示 / 状态 / 忙碌条
 *   4. 历史栈与「返回」   5. 浮层 / 菜单   6. 列表与搜索
 *   7. 文章的读写        8. 预览渲染      9. 大纲
 *  10. 格式工具栏       11. 查找替换     12. 分享与统计
 *  13. 各个对话框       14. 视图 / 窄屏   15. 事件绑定与启动
 */
(function () {
  'use strict';

  const MD = window.LPMarkdown;
  const CH = window.LPChart;
  const OUTLINE = window.LPOutline;
  const PS = window.LPPageStyle;
  const WEBEXPORT = window.LPExportWeb;
  const LP = window.LPPlatform;
  const CAPS = (LP && LP.capabilities) || {};

  const $ = (id) => document.getElementById(id);
  /** 窄屏断点，跟 style-mobile.css 的 @media 保持一致。 */
  const NARROW = 820;
  const AUTOSAVE_DELAY = 900;
  const PREVIEW_DELAY = 180;
  const OUTLINE_DELAY = 420;
  /** 附件 / 图片在正文里的引用格式，跟 lib/repo.js 的 lp:// 约定一致。 */
  const ASSET_RE = /lp:\/\/files\/([A-Za-z0-9._-]+)/g;

  // 手机上把文件收进 IndexedDB 的能力；桌面上没有（要走主进程，不在本轮范围）。
  const importDropped =
    LP && typeof LP.importDropped === 'function' ? LP.importDropped.bind(LP) : null;

  // ==========================================================================
  // 0. 第三方库句柄
  // --------------------------------------------------------------------------
  // 全部来自 renderer/vendor/ 下的本地文件（无 CDN、无内联脚本），清单与许可证见
  // 随包分发的许可证全文在 desktop/THIRD-PARTY-NOTICES.md（开发用明细在 VENDOR.md）。
  // 每个都用 typeof 探一下：任何一个库没加载进来，对应的增强就安静降级，
  // 不能让「少了个增强」变成「整个预览打不开」。
  // ==========================================================================

  const LIB = {
    katex: typeof katex !== 'undefined' ? katex : null,
    renderMath: typeof renderMathInElement === 'function' ? renderMathInElement : null,
    prism: typeof Prism !== 'undefined' ? Prism : null,
    mdIt: typeof markdownit === 'function' ? markdownit : null,
    mdTask: typeof markdownitTaskLists === 'function' ? markdownitTaskLists : null,
    mdFoot: typeof markdownitFootnote === 'function' ? markdownitFootnote : null,
    mdDef: typeof markdownitDeflist === 'function' ? markdownitDeflist : null,
    mdEmoji: typeof markdownitEmoji === 'function' ? markdownitEmoji : null,
    flex: typeof FlexSearch !== 'undefined' ? FlexSearch : null,
    papa: typeof Papa !== 'undefined' ? Papa : null,
    htmlToImage: typeof htmlToImage !== 'undefined' ? htmlToImage : null,
    pull: typeof PullToRefresh !== 'undefined' ? PullToRefresh : null,
    hammer: typeof Hammer !== 'undefined' ? Hammer : null,
  };