/**
 * 把 LongPost 的图标换到 Capacitor 生成的 Android 工程里。
 *
 * Capacitor 生成的工程默认是它自己的占位图标，跟桌面版对不上。
 * 这里把 desktop/resources/icon.png（1024×1024）复制到各个 mipmap 目录。
 * Android 会自己缩放到需要的尺寸，所以不额外做多倍图。
 *
 * 找不到工程或找不到图标都只是跳过，不让构建失败 —— 图标不好看是小事，
 * 出不了包是大事。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const icon = path.join(root, 'desktop', 'resources', 'icon.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(resDir)) {
  console.log('[apply-icon] 没有 android/app/src/main/res，跳过（工程还没生成）');
  process.exit(0);
}
if (!fs.existsSync(icon)) {
  console.log('[apply-icon] 没有 desktop/resources/icon.png，跳过');
  process.exit(0);
}

const names = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];
let written = 0;

for (const dir of fs.readdirSync(resDir)) {
  if (!dir.startsWith('mipmap')) continue;
  const full = path.join(resDir, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const name of names) {
    const target = path.join(full, name);
    // 只覆盖工程里已经有的文件，不凭空造资源名，免得 aapt 找不到引用
    if (!fs.existsSync(target)) continue;
    fs.copyFileSync(icon, target);
    written += 1;
  }
}

console.log('[apply-icon] 已替换 ' + written + ' 个图标文件');
