/**
 * 把 LongPost 的图标换到 Capacitor 生成的 Android 工程里。
 *
 * Capacitor 生成的工程默认是它自己的占位图标，跟桌面版对不上。
 * 这里把 desktop/resources/ 下的图标复制到各个 mipmap 目录。
 * Android 会自己缩放到需要的尺寸，所以不额外做多倍图。
 *
 * 自适应图标（Android 8 起）分两层，两者要求不一样：
 *   ic_launcher.png / ic_launcher_round.png —— 整张方图，直接铺满
 *   ic_launcher_foreground.png —— 只占中间约 2/3，四周要透明，
 *                                 因为系统会按机型形状裁外圈、还会放大一点
 * 所以前景层优先用单独生成的 icon-foreground.png；没有就退回整张图，
 * 至少不会缺资源、不会让构建失败。
 *
 * 找不到工程或找不到图标都只是跳过，不让构建失败 —— 图标不好看是小事，
 * 出不了包是大事。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const resRoot = path.join(root, 'desktop', 'resources');
const icon = path.join(resRoot, 'icon.png');
const iconForeground = path.join(resRoot, 'icon-foreground.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(resDir)) {
  console.log('[apply-icon] 没有 android/app/src/main/res，跳过（工程还没生成）');
  process.exit(0);
}
if (!fs.existsSync(icon)) {
  console.log('[apply-icon] 没有 desktop/resources/icon.png，跳过');
  process.exit(0);
}

// 每个目标文件该用哪张源图
const sources = new Map([
  ['ic_launcher.png', icon],
  ['ic_launcher_round.png', icon],
  ['ic_launcher_foreground.png', fs.existsSync(iconForeground) ? iconForeground : icon],
]);

let written = 0;

for (const dir of fs.readdirSync(resDir)) {
  if (!dir.startsWith('mipmap')) continue;
  const full = path.join(resDir, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const [name, src] of sources) {
    const target = path.join(full, name);
    // 只覆盖工程里已经有的文件，不凭空造资源名，免得 aapt 找不到引用
    if (!fs.existsSync(target)) continue;
    fs.copyFileSync(src, target);
    written += 1;
  }
}

const fgNote = fs.existsSync(iconForeground) ? '前景层用了专用留白图' : '前景层退回整张图';
console.log('[apply-icon] 已替换 ' + written + ' 个图标文件（' + fgNote + '）');
