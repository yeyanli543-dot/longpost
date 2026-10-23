#!/usr/bin/env node
/**
 * 生成国内可用的下载链接（GitHub 加速镜像）。
 *
 * 背景：GitHub Releases 在国内经常几十 KB/s 甚至连不上，
 * 而 release 资产不能走 jsDelivr（有 20MB 限制），所以只能用镜像前缀。
 *
 * 用法：node scripts/cn-mirrors.cjs [版本号]
 */

'use strict';

const pkg = require('../package.json');
const version = process.argv[2] || pkg.version;

const MIRRORS = [
  { name: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
  { name: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
  { name: 'ghfast.top', prefix: 'https://ghfast.top/' },
  { name: 'gh.llkk.cc', prefix: 'https://gh.llkk.cc/' },
];

const BASE = 'https://github.com/yeyanli543-dot/longpost/releases/download/v' + version + '/';

const ASSETS = [
  { name: 'Windows 安装版', file: 'LongPost.Setup.' + version + '.exe' },
  { name: 'Windows 便携版', file: 'LongPost.' + version + '.exe' },
  { name: 'macOS (Apple Silicon)', file: 'LongPost-' + version + '-arm64.dmg' },
  { name: 'Linux AppImage', file: 'LongPost-' + version + '.AppImage' },
  { name: 'Android APK', file: 'LongPost-android.apk' },
];

console.log('LongPost v' + version + ' 下载地址\n');

for (const asset of ASSETS) {
  console.log(asset.name + '（' + asset.file + '）');
  console.log('  官方  ' + BASE + encodeURIComponent(asset.file));
  for (const mirror of MIRRORS) {
    console.log('  ' + mirror.name.padEnd(14) + mirror.prefix + BASE + encodeURIComponent(asset.file));
  }
  console.log('');
}

console.log('校验：' + BASE + 'checksums.txt');
console.log('镜像为第三方公益服务，可能失效或限速；安装前建议核对 sha256。');
