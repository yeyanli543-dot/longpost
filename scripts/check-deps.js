#!/usr/bin/env node
/**
 * 依赖体检。
 *
 * 检查两件事：
 *   1. lockfile 里没有镜像地址（npmmirror）—— 踩过坑：镜像给过高版本，
 *      官方源根本没有，CI 一装就 404；
 *   2. lockfile 能复现 —— 用 npm ci --dry-run 验证依赖树与 lock 一致。
 *
 * 不做「逐个 npm view」：上千个包要跑上千次网络请求，CI 扛不住。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const lockPath = path.join(root, 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.error('[deps-check] 找不到 package-lock.json');
  process.exit(1);
}

const lockText = fs.readFileSync(lockPath, 'utf8');
const problems = [];

const mirrors = (lockText.match(/npmmirror|taobao\.org/g) || []).length;
if (mirrors > 0) {
  problems.push('lockfile 里有 ' + mirrors + ' 处镜像地址，CI 上可能 404');
}

const npmrcPath = path.join(root, '.npmrc');
if (fs.existsSync(npmrcPath)) {
  const npmrc = fs.readFileSync(npmrcPath, 'utf8');
  if (/registry\s*=\s*https?:\/\/(registry\.npmmirror|registry\.npm\.taobao)/.test(npmrc)) {
    problems.push('.npmrc 指向镜像源，应改为 https://registry.npmjs.org/');
  }
}

try {
  // Windows 上直接 execFileSync('npm.cmd') 会 EINVAL，走 shell
  execSync('npm ci --dry-run --ignore-scripts --no-audit --no-fund', {
    cwd: root,
    stdio: 'pipe',
    timeout: 180000,
    shell: true,
  });
} catch (error) {
  const detail = String((error.stderr && error.stderr.toString()) || (error.stdout && error.stdout.toString()) || '')
    .split('\n')
    .filter(Boolean)
    .slice(-3)
    .join(' | ');
  problems.push('npm ci 无法复现 lockfile：' + (detail || error.message));
}

if (problems.length > 0) {
  console.error('[deps-check] 未通过：');
  for (const item of problems) console.error('  - ' + item);
  process.exit(1);
}

console.log('[deps-check] 通过：无镜像地址，lockfile 可复现');
