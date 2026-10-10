/**
 * 导出链路端到端验证。
 *
 * 做三件事：
 *   1. 造一篇文章（含 Markdown、两个图表、一张图片附件），走真实的 buildHtml 导出到临时目录
 *   2. 用 Electron 把这个导出的 HTML 打开
 *   3. 检查 DOM（标题、表格、图片是否真的加载出来、图表 canvas 数量），并截图存证
 *
 *   xvfb-run -a electron scripts/verify-export.js --out=/tmp/export-shot.png
 */

'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const buildHtml = require('../lib/export-html');
const CH = require('../lib/chart');

const OUT_SHOT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--out='));
  return arg ? arg.slice('--out='.length) : path.join(os.tmpdir(), 'longpost-export.png');
})();

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-export-'));
const filesDir = path.join(workDir, 'data');
fs.mkdirSync(filesDir, { recursive: true });

// 造一张真实图片附件（直接拿应用图标当素材）
const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
fs.copyFileSync(iconPath, path.join(filesDir, 'demo-icon.png'));

const article = {
  id: 'demo',
  title: '一张图看懂这次导出',
  updatedAt: Date.now(),
  content: [
    '# 一张图看懂这次导出',
    '',
    '导出的 HTML 是**自包含**的：图表运行库、图片路径、样式全都处理好了，双击就能看。',
    '',
    '![应用图标](lp://files/demo-icon.png)',
    '',
    '## 柱状图',
    '',
    CH.encodeChartCard({
      type: 'bar',
      title: '每月发布篇数',
      xAxis: ['3月', '4月', '5月', '6月'],
      series: [{ name: '发布', data: [4, 7, 5, 9] }],
      height: 300,
    }),
    '',
    '## 饼图',
    '',
    CH.encodeChartCard({
      type: 'pie',
      title: '内容构成',
      data: [
        { name: '技术', value: 42 },
        { name: '随笔', value: 28 },
        { name: '其他', value: 30 },
      ],
      height: 280,
    }),
    '',
    '| 检查项 | 期望 |',
    '| --- | --- |',
    '| 图表 | 2 个 canvas |',
    '| 图片 | 正常加载 |',
  ].join('\n'),
};

const { html, files } = buildHtml(article, filesDir, 'demo.files');
const htmlPath = path.join(workDir, 'demo.html');
const assetDir = path.join(workDir, 'demo.files');

if (files.length) {
  fs.mkdirSync(assetDir, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(filesDir, f.stored), path.join(assetDir, f.stored));
  }
}
fs.writeFileSync(htmlPath, html, 'utf8');

console.log('导出文件：' + htmlPath);
console.log('附件目录：' + (files.length ? assetDir + '（' + files.length + ' 个）' : '（无）'));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 940, height: 1000, show: false });
  const problems = [];

  const errors = [];
  win.webContents.on('console-message', (...args) => {
    const d = args[1];
    const msg = d && typeof d === 'object' ? d.message : args[2];
    if (String(msg || '').toLowerCase().includes('error')) errors.push(msg);
  });

  try {
    await win.loadFile(htmlPath);
    await new Promise((r) => setTimeout(r, 2200));

    const probe = await win.webContents.executeJavaScript(`
      (function () {
        var img = document.querySelector('.lp-body img');
        return {
          title: document.title,
          h1: (document.querySelector('.lp-body h1') || {}).textContent || '',
          tableRows: document.querySelectorAll('.lp-body table tr').length,
          canvases: document.querySelectorAll('.lp-chart canvas').length,
          chartFigures: document.querySelectorAll('.lp-chart').length,
          imgComplete: img ? img.complete : false,
          imgNaturalWidth: img ? img.naturalWidth : 0,
          imgSrc: img ? img.getAttribute('src') : '',
          hasEchartsGlobal: typeof window.echarts !== 'undefined',
          bodyText: document.body.innerText.slice(0, 60)
        };
      })();
    `);

    console.log('页面探针：' + JSON.stringify(probe, null, 2));

    if (probe.title !== article.title) problems.push('文档标题不对：' + probe.title);
    if (!probe.h1.includes('一张图看懂这次导出')) problems.push('正文 h1 缺失');
    if (probe.chartFigures !== 2) problems.push('图表容器数应为 2，实际 ' + probe.chartFigures);
    if (probe.canvases !== 2) problems.push('canvas 数应为 2，实际 ' + probe.canvases);
    if (!probe.hasEchartsGlobal) problems.push('ECharts 没被内联进去');
    if (probe.tableRows !== 3) problems.push('表格行数应为 3（表头+2 行），实际 ' + probe.tableRows);
    if (!probe.imgComplete || probe.imgNaturalWidth === 0) {
      problems.push('图片没加载出来：complete=' + probe.imgComplete + ' 宽=' + probe.imgNaturalWidth + ' src=' + probe.imgSrc);
    }
    if (!probe.imgSrc || !probe.imgSrc.startsWith('./demo.files/')) {
      problems.push('图片路径没改写成相对路径：' + probe.imgSrc);
    }
    if (errors.length) problems.push('页面报错：' + errors.join(' | '));

    const image = await win.webContents.capturePage();
    fs.writeFileSync(OUT_SHOT, image.toPNG());
    console.log('截图：' + OUT_SHOT);
  } catch (err) {
    problems.push('验证过程异常：' + String(err && err.message ? err.message : err));
  }

  console.log('\n———————————————————————————————');
  if (problems.length) {
    console.log('导出验证失败：');
    for (const p of problems) console.log('  - ' + p);
    app.exit(1);
  } else {
    console.log('导出验证通过：标题 / 正文 / 表格 / 两个图表 / 图片全部正确');
    app.exit(0);
  }
});
