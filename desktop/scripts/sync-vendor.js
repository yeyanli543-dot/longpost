/**
 * 把不进仓库的产物同步到 renderer/vendor/。
 *
 * 同步两类东西：
 *   1. echarts.min.js —— 1.1 MB 的压缩包，从 node_modules 复制，版本只认 package.json
 *   2. lib/ 里的共享模块 —— 渲染层直接引用它们，复制一份让 renderer/ 自成一体
 *
 * 第 2 点是为了手机版：Capacitor 打包时只认一个 web 目录，index.html 里
 * 出现 "../lib/xxx.js" 这种跳出目录的引用是拿不到的。所以统一用 vendor/ 下的拷贝。
 *
 * 代价是同一份代码存在两个位置，所以复制完会逐个比对字节，不一致直接报错退出 ——
 * 免得改了 lib/ 忘了同步，桌面能跑手机跑不了。
 *
 * npm install / npm ci 之后自动执行（见 package.json 的 prepare）。
 * 单独重跑：npm run vendor
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const libDir = path.join(root, 'lib');
const destDir = path.join(root, 'renderer', 'vendor');

/** 需要一起搬进 renderer/vendor/ 的共享模块。 */
const SHARED = ['markdown.js', 'chart.js', 'repo.js', 'page-style.js', 'outline.js'];

fs.mkdirSync(destDir, { recursive: true });

// ---------------------------------------------------------------- echarts

const echartsCandidates = [
  path.join(root, 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
  path.join(root, '..', 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
];

const echartsSrc = echartsCandidates.find((p) => fs.existsSync(p));
if (!echartsSrc) {
  console.error('[sync-vendor] 没找到 echarts.min.js，找过这些位置：');
  for (const c of echartsCandidates) console.error('  - ' + c);
  console.error('[sync-vendor] 先执行 npm install（echarts 已在 package.json 的 dependencies 里）。');
  process.exit(1);
}

const echartsDest = path.join(destDir, 'echarts.min.js');
fs.copyFileSync(echartsSrc, echartsDest);

const echartsSize = fs.statSync(echartsDest).size;
if (echartsSize < 500 * 1024) {
  console.error('[sync-vendor] echarts 只有 ' + echartsSize + ' 字节，明显不对（正常约 1.1 MB）。');
  process.exit(1);
}
console.log('[sync-vendor] echarts.min.js -> renderer/vendor/（' + echartsSize + ' 字节）');

// ---------------------------------------------------------------- 共享模块

const missing = SHARED.filter((f) => !fs.existsSync(path.join(libDir, f)));
if (missing.length) {
  console.error('[sync-vendor] lib/ 里缺这些文件：' + missing.join(', '));
  process.exit(1);
}

for (const name of SHARED) {
  const src = path.join(libDir, name);
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);

  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dest);
  if (!a.equals(b)) {
    console.error('[sync-vendor] ' + name + ' 复制后内容对不上，中止。');
    process.exit(1);
  }
  console.log('[sync-vendor] ' + name + ' -> renderer/vendor/（' + a.length + ' 字节）');
}

console.log('[sync-vendor] 完成，共 ' + (SHARED.length + 1) + ' 个文件。');
