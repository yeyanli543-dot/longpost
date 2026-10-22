#!/usr/bin/env node
/**
 * 文档版本一致性检查。
 *
 * 踩过的坑：代码连发三个版本，README 的徽章和下载链接还停在三个月前的 3.0.3，
 * 而且 Android 链接指向了一个早就删掉的资产文件名 —— 用户点开是 404。
 *
 * 这里做三件事：
 *   1. README 徽章版本 == package.json 版本
 *   2. README「多端下载」标题里的版本 == package.json 版本
 *   3. README 里出现的 releases/download/vX.Y.Z 链接版本 == package.json 版本
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

const problems = [];

const badge = readme.match(/badge\/version-([0-9.]+)-/);
if (!badge) {
  problems.push('README 里找不到 version 徽章');
} else if (badge[1] !== version) {
  problems.push('徽章版本是 ' + badge[1] + '，package.json 是 ' + version);
}

const heading = readme.match(/多端下载 \(v([0-9.]+)/);
if (!heading) {
  problems.push('README 里找不到「多端下载 (vX.Y.Z)」标题');
} else if (heading[1] !== version) {
  problems.push('下载章节版本是 ' + heading[1] + '，package.json 是 ' + version);
}

const linkVersions = new Set(
  Array.from(readme.matchAll(/releases\/download\/v([0-9.]+)\//g)).map((m) => m[1]),
);
for (const v of linkVersions) {
  if (v !== version) problems.push('下载链接指向 v' + v + '，应为 v' + version);
}

// 资产文件名必须是真实存在的：历史上写过已经不存在的 -v3.0.3-android.apk
if (/LongPost-v[0-9.]+-android\.apk/.test(readme)) {
  problems.push('README 引用了版本化 APK 文件名，实际资产叫 LongPost-android.apk');
}

// 白皮书的数据基准版本也要对齐
const whitepaperPath = path.join(root, 'docs', 'WHITEPAPER.md');
if (fs.existsSync(whitepaperPath)) {
  const paper = fs.readFileSync(whitepaperPath, 'utf8');
  const base = paper.match(/数据基准\*\*：仓库 \`main\` 分支 v([0-9.]+)/);
  if (base && base[1] !== version) {
    problems.push('白皮书数据基准是 v' + base[1] + '，package.json 是 ' + version);
  }
}

if (problems.length > 0) {
  console.error('[docs-check] 未通过（当前版本 ' + version + '）：');
  for (const item of problems) console.error('  - ' + item);
  process.exit(1);
}

console.log('[docs-check] 通过：README 版本与 package.json 一致（' + version + '）');
