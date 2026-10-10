/**
 * 导出成 HTML 时用的那份页面样式与图表启动脚本。
 *
 * 抽出来是因为现在有两条导出路径：桌面版（主进程写文件 + 同目录 .files 附件夹）
 * 和手机/网页版（浏览器里把附件转成 data: URL 打包成单文件）。
 * 两边必须长得一模一样，所以样式只有这一份。
 *
 * 双模加载：Node require 得到对象，浏览器里挂到 window.LPPageStyle。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LPPageStyle = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pageCss() {
    return [
      ':root{color-scheme:light}',
      '*{box-sizing:border-box}',
      'body{margin:0;background:#f6f7f9;color:#16181d;',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;",
      'line-height:1.78;font-size:16.5px}',
      '.lp-page{max-width:760px;margin:0 auto;padding:56px 22px 96px;background:#fff;min-height:100vh}',
      '@media(max-width:820px){.lp-page{padding:32px 18px 64px}}',
      '.lp-title{font-size:32px;line-height:1.3;margin:0 0 10px;letter-spacing:-.01em}',
      '.lp-meta{color:#8a9099;font-size:13.5px;margin-bottom:34px}',
      '.lp-body h1,.lp-body h2,.lp-body h3,.lp-body h4{line-height:1.35;margin:2em 0 .6em;font-weight:700}',
      '.lp-body h1{font-size:26px}.lp-body h2{font-size:23px}.lp-body h3{font-size:19px}.lp-body h4{font-size:17px}',
      '.lp-body p{margin:1em 0}',
      '.lp-body a{color:#2563eb;text-decoration:none}',
      '.lp-body a:hover{text-decoration:underline}',
      '.lp-body img{max-width:100%;height:auto;border-radius:8px;display:block;margin:1.2em auto}',
      '.lp-body ul,.lp-body ol{padding-left:1.5em;margin:1em 0}',
      '.lp-body li{margin:.3em 0}',
      '.lp-body blockquote{margin:1.2em 0;padding:.6em 1.1em;border-left:3px solid #d7dbe0;background:#fafbfc;color:#4a5158;border-radius:0 6px 6px 0}',
      '.lp-body hr{border:0;border-top:1px solid #e6e9ed;margin:2.2em 0}',
      '.lp-body code{background:#f1f3f6;padding:.15em .4em;border-radius:4px;font-size:.9em;',
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
      '.lp-body pre.code-block{background:#1b1f27;color:#e6e9ef;padding:16px 18px;border-radius:10px;overflow:auto;margin:1.4em 0}',
      '.lp-body pre.code-block code{background:none;color:inherit;padding:0;font-size:13.5px;line-height:1.6}',
      '.lp-body table{border-collapse:collapse;width:100%;margin:1.4em 0;font-size:15px;display:block;overflow-x:auto}',
      '.lp-body th,.lp-body td{border:1px solid #e3e7ec;padding:8px 12px;text-align:left}',
      '.lp-body th{background:#f7f8fa;font-weight:600}',
      '.lp-chart{margin:1.8em 0;width:100%}',
      '.lp-body del{color:#8a9099}',
      '.lp-attach{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #dfe3e8;',
      'border-radius:8px;background:#fafbfc;margin:.4em 0;font-size:14.5px}',
    ].join('');
  }

  function bootScript(hasEcharts) {
    return [
      '(function(){',
      '  var nodes = document.querySelectorAll(".lp-chart");',
      '  if (!nodes.length) return;',
      hasEcharts ? '' : '  return;',
      '  for (var i = 0; i < nodes.length; i++) {',
      '    var el = nodes[i];',
      '    try {',
      '      var option = JSON.parse(el.getAttribute("data-option") || "{}");',
      '      var chart = window.echarts.init(el, null, { renderer: "canvas" });',
      '      chart.setOption(option);',
      '      window.addEventListener("resize", (function (c) {',
      '        return function () { c.resize(); };',
      '      })(chart));',
      '    } catch (e) {',
      '      el.textContent = "图表渲染失败";',
      '    }',
      '  }',
      '})();',
    ]
      .filter(function (l) {
        return l !== '';
      })
      .join('\n');
  }

  return { pageCss, bootScript };
});
