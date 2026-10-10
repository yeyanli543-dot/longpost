# 第三方库许可证清单（desktop/renderer/vendor/）

仓库本体是 **MIT**（见仓库根目录 `LICENSE`）。下表所有库的许可证都与 MIT 兼容，
且**全部允许再分发与商业使用**：没有 GPL / AGPL / SSPL，没有「非商用」条款，
没有无许可证（UNLICENSED）的包。

判定口径：MIT / ISC / BSD-2 / BSD-3 / Apache-2.0 视为兼容（Apache-2.0 允许被 MIT 项目
包含，需保留其版权与许可声明）。Apache-2.0 的库在本地改写/再分发时另需注意其专利授权
与 NOTICE 约定 —— `echarts` 确实带 `NOTICE`，按第 4(d) 条要随分发一起给出去。

**这份文件是给维护者看的审计明细，不随包分发。** 随包发给接收方的是
`desktop/THIRD-PARTY-NOTICES.md`（含许可证全文、版权行与 echarts 的 NOTICE，
由 `node scripts/sync-vendor.js --write-notices` 生成）。两者都不要手改版本号。

版权行取自各包 `node_modules/<pkg>/LICENSE*` 原文，不是抄网上的。

| # | 库 | 版本 | 许可证 | 版权方 | 上游仓库 | 用途 | 拷贝进来的文件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | echarts | 6.1.0 | Apache-2.0 | Apache Software Foundation | https://github.com/apache/echarts | 图表运行库（存量） | `echarts.min.js` |
| 2 | prismjs | 1.30.0 | MIT | © 2012 Lea Verou | https://github.com/PrismJS/prism | 代码块语法高亮 | `prism/prism.js`、`prism/components/prism-*.min.js` ×20、`prism/themes/*.min.css` ×2 |
| 3 | katex | 0.19.0 | MIT | © 2013-2020 Khan Academy and other contributors | https://github.com/KaTeX/KaTeX | LaTeX 公式渲染 | `katex/katex.min.js`、`katex/katex.min.css`、`katex/contrib/auto-render.min.js`、`katex/fonts/*.woff2` ×20 |
| 4 | markdown-it | 15.0.2 | MIT | © 2014 Vitaly Puzrin, Alex Kocharin | https://github.com/markdown-it/markdown-it | 增强 Markdown 渲染 | `markdown-it/markdown-it.umd.min.js` |
| 5 | markdown-it-task-lists | 2.1.1 | ISC | © 2016 Revin Guillen | https://github.com/revin/markdown-it-task-lists | 任务清单 | `markdown-it/markdown-it-task-lists.min.js` |
| 6 | markdown-it-footnote | 4.0.0 | MIT | © 2014-2015 Vitaly Puzrin, Alex Kocharin | https://github.com/markdown-it/markdown-it-footnote | 脚注 | `markdown-it/markdown-it-footnote.min.js` |
| 7 | markdown-it-deflist | 4.0.0 | MIT | © 2014-2015 Vitaly Puzrin, Alex Kocharin | https://github.com/markdown-it/markdown-it-deflist | 定义列表 | `markdown-it/markdown-it-deflist.min.js` |
| 8 | markdown-it-emoji | 3.1.0 | MIT | © 2014 Vitaly Puzrin | https://github.com/markdown-it/markdown-it-emoji | emoji 简写（light 集） | `markdown-it/markdown-it-emoji.min.js` |
| 9 | html-to-image | 1.11.13 | MIT | © 2017-2025 W.Y. | https://github.com/bubkoo/html-to-image | 文章长图 / 分享卡片导出 | `html-to-image/html-to-image.js` |
| 10 | swiped-events | 1.2.0 | MIT | © 2017 John Doherty | https://github.com/john-doherty/swiped-events | 声明式滑动事件 | `swiped-events/swiped-events.min.js` |
| 11 | hammerjs | 2.0.8 | MIT | © 2011-2014 Jorik Tangelder (Eight Media) | https://github.com/hammerjs/hammer.js | 手势原语（长按/捏合） | `hammerjs/hammer.min.js` |
| 12 | pulltorefreshjs | 0.1.22 | MIT | © 2016 Box Factura | https://github.com/BoxFactura/pulltorefresh.js | 下拉刷新 | `pulltorefreshjs/pulltorefresh.umd.min.js` |
| 13 | flexsearch | 0.8.212 | Apache-2.0 | © Thomas Wilkerling / Nextapps GmbH | https://github.com/nextapps-de/flexsearch | 本地全文搜索（中文） | `flexsearch/flexsearch.compact.min.js` |
| 14 | papaparse | 5.7.0 | MIT | © 2015 Matthew Holt | https://github.com/mholt/PapaParse | CSV / TSV 解析（表格数据层） | `papaparse/papaparse.min.js` |

（表中 1 是仓库原有的依赖，本次未改动；2–14 是本次新增。行号与
`desktop/renderer/vendor/VENDOR.md` 的分节顺序一致。）

## 许可证全文在哪

npm 包里的许可证全文都还在 `desktop/node_modules/<pkg>/LICENSE*` 里（`npm install` 之后就在），
不需要另存副本。发布安装包时这些文件不会被打进 `app.asar`（见 `desktop/package.json`
的 `build.files` 里 `!node_modules/**`），所以**如果将来要随安装包附带第三方声明**，
用的就是本文件 —— 本文件列明了库名、版本、许可证、版权方与来源地址，
满足 MIT / ISC / Apache-2.0 的署名要求。

## 与 MIT 的兼容性逐条确认

- **MIT / ISC**（共 12 个）：宽松许可，唯一义务是保留版权声明与许可文本；可以闭源、可以商用、
  可与 MIT 代码混合。ISC 与 MIT 是等价的宽松许可。
- **Apache-2.0**（echarts、flexsearch）：同样宽松、可商用，额外要求保留声明、
  传递 NOTICE 文件（若上游提供）、并在修改过的文件里标注改动。
  **注意**：本次对这两个库都是**原样复制、未做任何修改**，所以不触发「标注改动」义务。
  项目自身仍以 MIT 发布，这与「包含 Apache-2.0 组件」不冲突。
- 没有任何 **GPL / AGPL / LGPL / SSPL / Commons Clause / 非商用 / 无许可证** 的库。

## 不是「拖着没记」的验证方式

`desktop/scripts/smoke-test.js` / `verify-mobile.js` 不检查许可证（它们管的是内容渲染与接线），
许可证的核对靠这份文件和 `sync-vendor.js` 的 `VENDOR` 清单：清单里每个库都带
`license`、`version`、`home` 三个字段，加库时如果不填就一直摆在那儿 —— 刷新依赖或换库时
对着这张表过一遍即可。
