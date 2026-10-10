/**
 * 把 echarts 的打包文件同步到 renderer/vendor/。
 *
 * 这个文件（1.1 MB 的压缩版）不进仓库，而是安装依赖时从 node_modules 里复制过来：
 *   - 仓库里不带大体积产物，clone 更快、diff 更干净
 *   - 版本只有一处真相，就是 package.json 里声明的 echarts
 *
 * npm install / npm ci 之后会自动执行（见 package.json 的 prepare）。
 * 需要单独重跑：npm run vendor
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const candidates = [
  path.join(root, 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
  path.join(root, '..', 'node_modules', 'echarts', 'dist', 'echarts.min.js'),
];

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('[sync-vendor] 没找到 echarts.min.js，找过这些位置：');
  for (const c of candidates) console.error('  - ' + c);
  console.error('[sync-vendor] 先执行 npm install（echarts 已在 package.json 的 dependencies 里）。');
  process.exit(1);
}

const destDir = path.join(root, 'renderer', 'vendor');
const dest = path.join(destDir, 'echarts.min.js');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);

const size = fs.statSync(dest).size;
if (size < 500 * 1024) {
  console.error('[sync-vendor] 复制出来的文件只有 ' + size + ' 字节，明显不对（正常约 1.1 MB）。');
  process.exit(1);
}

console.log('[sync-vendor] echarts.min.js -> renderer/vendor/（' + size + ' 字节，来自 ' + src + '）');
