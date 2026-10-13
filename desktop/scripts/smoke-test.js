/**
 * 纯逻辑自检：不启动界面，直接验证 Markdown 渲染器、图表解析、导出链路。
 *
 *   node scripts/smoke-test.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MD = require('../lib/markdown');
const CH = require('../lib/chart');
const buildHtml = require('../lib/export-html');
let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  ✓ ' + name);
  } else {
    failures.push(name + (detail ? ' —— ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? ' —— ' + detail : ''));
  }
}
console.log('\n[1] Markdown 渲染');
{
  const html = MD.renderMarkdown(
    [
      '# 一级标题',
      '',
      '这是**加粗**、*斜体*、`行内代码`和[链接](https://example.com)。',
      '',
      '- 第一项',
      '- 第二项',
      '',
      '1. 有序一',
      '2. 有序二',
      '',
      '> 引用一行',
      '',
      '| 名称 | 数值 |',
      '| --- | ---: |',
      '| 甲 | 10 |',
      '| 乙 | 20 |',
      '',
      '```js',
      'const a = 1 < 2;',
      '```',
      '',
      '---',
    ].join('\n'),
  );
  check('h1 生成', html.includes('<h1>一级标题</h1>'));
  check('加粗', html.includes('<strong>加粗</strong>'));
  check('斜体', html.includes('<em>斜体</em>'));
  check('行内代码', html.includes('<code>行内代码</code>'));
  check('链接带 rel', html.includes('rel="noreferrer noopener"'));
  check('无序列表', html.includes('<ul><li>第一项</li><li>第二项</li></ul>'));
  check('有序列表', html.includes('<ol><li>有序一</li><li>有序二</li></ol>'));
  check('引用', html.includes('<blockquote>'));
  check('表格表头', html.includes('<th>名称</th>'));
  check('表格右对齐', html.includes('<th style="text-align:right">数值</th>'));
  check('代码块', html.includes('class="code-block"'));
  check('代码块内容被转义', html.includes('const a = 1 &lt; 2;'));
  check('分隔线', html.includes('<hr>'));
}
console.log('\n[2] 安全性');
{
  const evil = MD.renderMarkdown('正常文本 <script>alert(1)</script> 结束');
  check('script 标签被转义', !evil.includes('<script>') && evil.includes('&lt;script&gt;'));
  const img = MD.renderMarkdown('<img src=x onerror=alert(1)>');
  check('img 标签被转义', !img.includes('<img src=x') && img.includes('&lt;img'));
  const badLink = MD.renderMarkdown('[点我](javascript:alert(1))');
  check('javascript: 链接被拦下', !badLink.includes('javascript:') && badLink.includes('点我'));
  const badImg = MD.renderMarkdown('![x](data:text/html;base64,AAAA)');
  check('data: 图片被拦下', !badImg.includes('<img'));
  const goodImg = MD.renderMarkdown('![图](lp://files/abc.png)');
  check('lp:// 图片放行', goodImg.includes('src="lp://files/abc.png"'));
  const httpsImg = MD.renderMarkdown('![图](https://example.com/a.png)');
  check('https 图片放行', httpsImg.includes('src="https://example.com/a.png"'));
}
console.log('\n[3] 图表卡片');
{
  const okCard = {
    type: 'bar',
    title: '月度阅读量',
    xAxis: ['1月', '2月', '3月'],
    series: [{ name: '阅读', data: [12, 30, 18] }],
    height: 400,
  };
  const fence = CH.encodeChartCard(okCard);
  check('encode 产出 ```chart 围栏', fence.startsWith('```chart\n') && fence.endsWith('\n```'));
  const parsed = CH.parseChartCard(fence.slice(8, -4));
  check('round-trip 解析成功', !!parsed && parsed.title === '月度阅读量');
  check('高度保留', parsed && parsed.height === 400);
  check('非法 JSON 返回 null', CH.parseChartCard('{不是 json}') === null);
  check('未知类型返回 null', CH.parseChartCard('{"type":"radar","series":[{"data":[1]}]}') === null);
  check('缺数据返回 null', CH.parseChartCard('{"type":"bar","series":[]}') === null);
  check(
    '超范围高度被丢弃',
    (() => {
      const c = CH.parseChartCard('{"type":"bar","height":9999,"xAxis":["a"],"series":[{"data":[1]}]}');
      return c && c.height === undefined;
    })(),
  );
  const doc = [
    '正文开始',
    '',
    fence,
    '',
    '图表之后的正文',
  ].join('\n');
  const segs = CH.splitChartCards(doc);
  check('切分出 3 段', segs.length === 3, '实际 ' + segs.length);
  check('第 2 段是图表', segs[1] && segs[1].kind === 'chart');
  check('图表计数函数一致', CH.chartCount(doc) === 1);
  const broken = '```chart\n{坏掉的}\n```';
  const segs2 = CH.splitChartCards(broken);
  check('坏图表不会丢内容', segs2.length === 1 && segs2[0].kind === 'markdown');
  const option = CH.chartCardToEchartsOption(parsed, 'dark');
  check('option 有 series', Array.isArray(option.series) && option.series.length === 1);
  check('option 有 xAxis', !!option.xAxis);
  check('柱状图类型正确', option.series[0].type === 'bar');
  const pie = CH.parseChartCard('{"type":"pie","data":[{"name":"甲","value":3}]}');
  const pieOption = CH.chartCardToEchartsOption(pie, 'light');
  check('饼图 option 正确', pieOption.series[0].type === 'pie');
  check('示例卡片可解析', !!CH.parseChartCard(JSON.stringify(CH.sampleCard('line'))));
  for (const t of CH.CHART_TYPES) {
    check('示例卡片 ' + t + ' 可解析', !!CH.parseChartCard(JSON.stringify(CH.sampleCard(t))));
  }
}
console.log('\n[4] 导出');
{
  const tmpFiles = path.join(__dirname, '..', '.smoke-files');
  fs.rmSync(tmpFiles, { recursive: true, force: true });
  fs.mkdirSync(tmpFiles, { recursive: true });
  fs.writeFileSync(path.join(tmpFiles, 'abc123.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const article = {
    id: 'x',
    title: '一篇带图表的文章',
    content: [
      '# 开篇',
      '',
      '第一段，带一张图片：',
      '',
      '![截图](lp://files/abc123.png)',
      '',
      CH.encodeChartCard({
        type: 'line',
        title: '趋势',
        xAxis: ['a', 'b', 'c'],
        series: [{ name: '值', data: [1, 2, 3] }],
      }),
      '',
      '还有一个不存在的附件：',
      '',
      '[下载](lp://files/nope.pdf)',
      '',
      '结尾段落。',
    ].join('\n'),
    updatedAt: Date.now(),
  };
  const result = buildHtml(article, tmpFiles, '我的文章.files');
  const html = result.html;
  check('含文档标题', html.startsWith('<!doctype html>') && html.includes('<title>一篇带图表的文章</title>'));
  check('含正文 h1', html.includes('<h1>开篇</h1>'));
  check('ECharts 已内联', html.includes('echarts') && html.length > 500000, '长度 ' + html.length);
  check('图表容器存在', html.includes('class="lp-chart"'));
  check('图表数据已写入', html.includes('&quot;series&quot;') || html.includes('data-option='));
  check('图片路径已改写为相对路径', html.includes('./我的文章.files/abc123.png'));
  check('残留 lp:// 已清零', !html.includes('lp://files/abc123.png'));
  check('存在的附件被收集', result.files.length === 1 && result.files[0].stored === 'abc123.png', JSON.stringify(result.files));
  check('不存在的附件未收集', result.files.every((f) => f.stored !== 'nope.pdf'));
  // 生成的 HTML 里不应再有未替换的占位符
  check('没有未替换占位符', !html.includes('{{ASSET_DIR}}'));
  // 结构完整性：先把内联脚本挖掉再数标签，
  // 因为 ECharts 包内部本身含有一个 </body> 字符串字面量（不会被解析成标签，但会干扰计数）
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
  check(
    '标签成对（body）',
    (withoutScripts.match(/<body>/g) || []).length === 1 &&
      (withoutScripts.match(/<\/body>/g) || []).length === 1,
    '开 ' +
      (withoutScripts.match(/<body>/g) || []).length +
      ' 闭 ' +
      (withoutScripts.match(/<\/body>/g) || []).length,
  );
  check('标签成对（html）', (html.match(/<html /g) || []).length === 1 && (html.match(/<\/html>/g) || []).length === 1);
  check('脚本体里没有能提前闭合的 </script', !/<\/script/i.test(html.replace(/<\/script>/gi, '')));
  fs.rmSync(tmpFiles, { recursive: true, force: true });
}
console.log('\n[5] 图标');
{
  const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');

  // icon.png 不进仓库（见 .gitignore），正常情况下由 npm install 的 prepare 脚本生成。
  // 但 Android 流水线为了不下载上百兆的 Electron，用的是 --ignore-scripts，
  // prepare 不会跑，全新检出时这个文件根本不存在——整条 Android 流水线之前就是
  // 死在这里，连 Android 构建的边都没摸到。
  // 所以自检自己负责把它补出来：缺了就现场生成，而不是直接报错。
  if (!fs.existsSync(iconPath)) {
    try {
      require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js')], {
        stdio: 'inherit',
      });
    } catch (err) {
      // 生成不了就让它落到下面的断言里，报错信息比在这里吞掉更直接
    }
  }

  check('图标存在（缺了会现场生成）', fs.existsSync(iconPath), 'resources/icon.png 没能生成出来');
  if (fs.existsSync(iconPath)) {
    const b = fs.readFileSync(iconPath);
    check('PNG 头正确', b.slice(0, 8).toString('hex') === '89504e470d0a1a0a');
    const iw = b.readUInt32BE(16);
    const ih = b.readUInt32BE(20);
    check('宽高为正且相等', iw > 0 && iw === ih, iw + 'x' + ih);
    // macOS 打包要求图标不小于 512x512，Windows 也靠它降采样出多档尺寸
    check('边长不小于 512', iw >= 512, String(iw));
  }
}
console.log('\n[6] 主进程文件可被解析');
{
  for (const f of ['main.js', 'preload.js', 'lib/store.js']) {
    const p = path.join(__dirname, '..', f);
    try {
      new Function(fs.readFileSync(p, 'utf8'));
      check(f + ' 语法正确', true);
    } catch (err) {
      check(f + ' 语法正确', false, String(err.message));
    }
  }
  check(
    'package.json 可解析且 main 指向存在',
    (() => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      return pkg.main === 'main.js' && fs.existsSync(path.join(__dirname, '..', pkg.main));
    })(),
  );
}
console.log('\n[7] 剪贴板通道与主进程 IPC');
{
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  check(
    'desktop/main.js 注册了 clipboard:writeImage',
    mainSrc.includes("ipcMain.handle('clipboard:writeImage'") ||
      mainSrc.includes('ipcMain.handle("clipboard:writeImage"'),
  );

  const preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const preloadHasWrite = /\bwriteImage\s*[:(]/.test(preloadSrc);
  check(
    'preload 暴露了 writeImage',
    preloadHasWrite,
    'preload: ' + preloadHasWrite,
  );
}
console.log('\n[8] 跨端平台抽象层 (PAL) 架构对齐');
{
  const palPath = path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'platform.ts');
  const palExists = fs.existsSync(palPath);
  check('client/src/lib/platform.ts 存在', palExists);
  if (palExists) {
    const palSrc = fs.readFileSync(palPath, 'utf8');
    check(
      'PAL 包含 UniversalPlatformAdapter 并挂载 bridge',
      palSrc.includes('UniversalPlatformAdapter') && palSrc.includes('isElectron'),
    );
  }
}
console.log('\n[9] 移动端 Capacitor 与主干产物映射');
{
  const capConfigPath = path.join(__dirname, '..', '..', 'mobile', 'capacitor.config.json');
  const capExists = fs.existsSync(capConfigPath);
  check('mobile/capacitor.config.json 存在', capExists);
  if (capExists) {
    const cap = JSON.parse(fs.readFileSync(capConfigPath, 'utf8'));
    check(
      'mobile/capacitor.config.json 对齐 dist/client',
      cap.webDir === '../dist/client',
      'webDir=' + cap.webDir,
    );
  }
}
console.log('\n———————————————————————————————');
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('全部通过');
