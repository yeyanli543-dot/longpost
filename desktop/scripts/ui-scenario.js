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

  // ---------------------------------------------------------- D1 长图导出回归
  // 验证方 D1 的回归位：点「更多 → 导出长图（PNG）」，导出的位图必须等于**正文全高**，
  // 而不是容器那一屏。三条断言，任一不成立就 throw —— main.js 只把「抛错」当失败
  // （返回 FAIL 字符串它只打印不判负），所以这里必须抛，才能让 CI 看到非零退出码。
  //   a) 位图尺寸 == 预览区正文全尺寸 × pixelRatio(2) → 抓「只导一屏」
  //   b) 图里没有整条空白的横带 → 抓「图是高了，但克隆节点的高度没解开、下半张全白」
  //   c) 最底部 4% 有墨迹 → 抓「整张空白 / 末行没画上」
  const TAIL_MARK = 'ZZ-LONGIMAGE-TAIL-' + Date.now();
  const longTail = [];
  for (let i = 1; i <= 12; i += 1) {
    longTail.push('### 长图样张小节 ' + i, '', '第 ' + i + ' 段正文，写长一点保证它有高度。'.repeat(3), '');
  }
  longTail.push('#### ' + TAIL_MARK);
  editor.value = editor.value + '\n\n' + longTail.join('\n');
  fire(editor, 'input');
  await wait(1600);

  $('btnMore').click();
  await wait(700);
  const exportItem = Array.prototype.slice
    .call(document.querySelectorAll('#ctxMenu .menu-item'))
    .find((el) => /导出长图/.test(el.textContent || ''));
  if (!exportItem) throw new Error('D1 长图导出回归：工具条「更多」菜单里找不到「导出长图（PNG）」');
  exportItem.click();

  let longImg = null;
  for (let i = 0; i < 80; i += 1) {
    const img = $('longImageImg');
    if (img && img.src && img.src.indexOf('data:image/png') === 0 && img.naturalWidth > 0) {
      longImg = img;
      break;
    }
    await wait(500);
  }
  if (!longImg) throw new Error('D1 长图导出回归：等了 40 秒也没拿到导出的 PNG');

  const pv = $('preview');
  const fullW = Math.max(Math.round(pv.getBoundingClientRect().width), pv.scrollWidth);
  const fullH = Math.max(Math.round(pv.getBoundingClientRect().height), pv.scrollHeight);
  const gotW = longImg.naturalWidth;
  const gotH = longImg.naturalHeight;
  // 容差说明：exportLongImage 先用 swapCanvasesForCapture() 把 canvas 换成 <img>，
  // 换完才量高度，所以导出高度与「图上量到的正文高度」会有几十像素的差（实测 38px≈0.6%）。
  // 这里用相对区间：允许 ±10%，但下限同时要求「至少 1.5 屏」——「只导一屏」会掉到 ~0.22，
  // 直接被抓；「图变高了但下半张全白」由下面的空带检查抓。
  const ratioH = gotH / (fullH * 2);
  const ratioW = gotW / (fullW * 2);
  if (ratioH < 0.9 || ratioH > 1.1 || ratioW < 0.9 || ratioW > 1.1 || gotH < pv.clientHeight * 2 * 1.5) {
    throw new Error(
      'D1 长图导出回归：导出 ' + gotW + '×' + gotH + '，正文全尺寸 ' + fullW + '×' + fullH +
        '（×2 应为 ' + fullW * 2 + '×' + fullH * 2 + '，实测比例 ' + ratioH.toFixed(3) + '×' +
        ratioW.toFixed(3) + '，预览一屏高 ' + pv.clientHeight + '）—— 「只导一屏」的毛病回来了',
    );
  }

  const bmp = new Image();
  bmp.src = longImg.src;
  if (bmp.decode) await bmp.decode();
  const scale = Math.min(1, 900 / bmp.naturalWidth);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.naturalWidth * scale));
  cv.height = Math.max(1, Math.round(bmp.naturalHeight * scale));
  const c2 = cv.getContext('2d');
  c2.drawImage(bmp, 0, 0, cv.width, cv.height);
  const px = c2.getImageData(0, 0, cv.width, cv.height).data;
  const bg = [px[0], px[1], px[2]];
  const inkAt = (y) => {
    let n = 0;
    for (let x = 0; x < cv.width; x += 2) {
      const o = (y * cv.width + x) * 4;
      if (
        Math.abs(px[o] - bg[0]) + Math.abs(px[o + 1] - bg[1]) + Math.abs(px[o + 2] - bg[2]) > 36
      ) {
        n += 1;
      }
    }
    return n;
  };
  const BANDS = 12;
  const bStep = Math.floor(cv.height / BANDS);
  const blankBands = [];
  for (let b = 0; b < BANDS; b += 1) {
    let n = 0;
    for (let y = b * bStep; y < (b + 1) * bStep; y += 2) n += inkAt(y);
    if (n === 0) blankBands.push(b);
  }
  if (blankBands.length) {
    throw new Error(
      'D1 长图导出回归：导出图里有整条空白的横带（第 ' + blankBands.join('/') + ' 条）—— ' +
        '尺寸对了但内容没铺满，多半是 style 没把克隆节点的高度解开',
    );
  }
  let tailInk = 0;
  for (let y = cv.height - Math.max(1, Math.round(cv.height * 0.04)); y < cv.height; y += 1) {
    tailInk += inkAt(y);
  }
  if (!tailInk) {
    throw new Error('D1 长图导出回归：导出图最底部 4% 没有任何墨迹（末行标记没画上去或整张空白）');
  }

  return (
    'OK 图表块=' +
    chartBlocks +
    ' canvas=' +
    canvases +
    ' 列表=' +
    listItems +
    ' 状态栏=' +
    $('status').textContent +
    ' 长图=' + gotW + 'x' + gotH +
    '(正文全高' + fullH + '×2=' + fullH * 2 + ')' 
  );
})();
