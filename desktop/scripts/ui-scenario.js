/**
 * 界面场景脚本（在渲染进程里执行，配合 main.js 的 --smoke-script 使用）。
 *
 * 模拟一次真实使用：新建文章 -> 填标题 -> 写一篇带图表的正文 -> 等预览渲染 -> 汇报状态。
 * 这样在没有人操作的环境里，也能验证「编辑器 + 实时预览 + 图表绘制」整条链路是通的。
 */

(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  const CH = window.LPChart;
  const MD = window.LPMarkdown;
  if (!CH || !MD) return 'FAIL: 本地模块没加载（LPMarkdown / LPChart 缺失）';

  // 1. 新建文章
  $('btnNew').click();
  await wait(900);

  if ($('editorWrap').hidden) return 'FAIL: 点新建后编辑器没有出现';

  // 2. 标题
  $('title').value = '桌面版跑起来了';
  fire($('title'), 'input');

  // 3. 正文
  const bar = CH.encodeChartCard({
    type: 'bar',
    title: '每月发布篇数',
    xAxis: ['3月', '4月', '5月', '6月', '7月', '8月'],
    series: [{ name: '发布', data: [4, 7, 5, 9, 12, 15] }],
    height: 320,
  });
  const pie = CH.encodeChartCard({
    type: 'pie',
    title: '内容构成',
    data: [
      { name: '技术', value: 42 },
      { name: '随笔', value: 28 },
      { name: '读书', value: 18 },
      { name: '其他', value: 12 },
    ],
    height: 300,
  });

  const lines = [
    '# 桌面版跑起来了',
    '',
    '这是一个**完全离线**的写作台：正文、图片、附件全部在你自己电脑上，不联网、不上传。',
    '',
    '## 能做什么',
    '',
    '- Markdown 写作，右边实时预览',
    '- 插入 `柱状图 / 折线图 / 面积图 / 饼图`，图表存在正文里',
    '- 插入图片和任意附件，一键导出成可以随便转发的网页',
    '',
    '> 导出的 HTML 会把图表运行库一起打包进去，别人拿到文件双击就能看图。',
    '',
    '## 数据长这样',
    '',
    bar,
    '',
    '下面这张饼图看的是内容构成：',
    '',
    pie,
    '',
    '## 一些细节',
    '',
    '| 项目 | 说明 |',
    '| --- | --- |',
    '| 存储位置 | 本机用户数据目录 |',
    '| 是否联网 | 完全不联网 |',
    '| 卸载影响 | 数据保留，可手动备份 |',
    '',
    '```js',
    'const fenced = "代码块也会被正确渲染";',
    '```',
    '',
    '— 完 —',
  ];

  const editor = $('editor');
  editor.value = lines.join('\n');
  fire(editor, 'input');

  // 4. 等自动保存 + 预览渲染
  await wait(2200);

  const chartBlocks = document.querySelectorAll('#preview .chart-block').length;
  const canvases = document.querySelectorAll('#preview canvas').length;
  const listItems = document.querySelectorAll('#list .item').length;
  const badCharts = document.querySelectorAll('#preview .chart-bad').length;
  const hasH1 = !!document.querySelector('#preview h1');
  const hasTable = !!document.querySelector('#preview table');
  const hasBlockquote = !!document.querySelector('#preview blockquote');

  const problems = [];
  if (chartBlocks !== 2) problems.push('图表块数量应为 2，实际 ' + chartBlocks);
  if (canvases !== 2) problems.push('canvas 数量应为 2，实际 ' + canvases);
  if (badCharts) problems.push('有 ' + badCharts + ' 个图表格式报错');
  if (!hasH1) problems.push('预览缺少 h1');
  if (!hasTable) problems.push('预览缺少表格');
  if (!hasBlockquote) problems.push('预览缺少引用');
  if (!listItems) problems.push('侧栏列表没有条目');

  if (problems.length) return 'FAIL: ' + problems.join('；');

  return (
    'OK 图表块=' +
    chartBlocks +
    ' canvas=' +
    canvases +
    ' 列表=' +
    listItems +
    ' 状态栏=' +
    $('status').textContent
  );
})();
