#!/usr/bin/env node
/**
 * 打包清单守卫。
 *
 * 踩过的坑：新增 desktop/bridge.js 但忘了加进 electron-builder 的 build.files，
 * 开发时一切正常，装到用户机器上启动即崩溃：
 *     Error: Cannot find module './bridge'
 *
 * 这里静态解析 main.js / preload.js 里的 require('./x')，
 * 逐个检查是否被 build.files 的模式覆盖。不通过就退出码 1。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
const files = (pkg.build && pkg.build.files) || [];

function covered(rel) {
  const norm = rel.split(path.sep).join('/');
  return files.some((pattern) => {
    if (pattern.startsWith('!')) return false;
    if (!pattern.includes('*')) return pattern === norm;
    const rx = new RegExp(
      '^' +
        pattern
          .replace(/[.+^$()|[\]{}]/g, '\\$&')
          .replace(/\*\*\/?/g, '.*')
          .replace(/\*/g, '[^/]*') +
        '$',
    );
    return rx.test(norm);
  });
}

const offenders = [];
for (const entry of ['main.js', 'preload.js', 'bridge.js']) {
  const file = path.join(desktopDir, entry);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const re = /require\(['"]\.\/([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const rel = m[1].endsWith('.js') ? m[1] : m[1] + '.js';
    if (!covered(rel)) offenders.push(entry + ' -> ' + rel);
  }
}

if (offenders.length > 0) {
  console.error('[package-files] 以下本地文件不会被装进安装包：');
  for (const item of offenders) console.error('  - ' + item);
  console.error('[package-files] 请把它们加进 desktop/package.json 的 build.files');
  process.exit(1);
}

console.log('[package-files] 通过：本地 require 全部被 build.files 覆盖');
