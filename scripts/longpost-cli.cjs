#!/usr/bin/env node
/**
 * LongPost 命令行剪藏。
 *
 * 用法：
 *   node scripts/longpost-cli.cjs "要保存的内容"
 *   echo "来自管道" | node scripts/longpost-cli.cjs
 *   node scripts/longpost-cli.cjs --title "标题" --tag 灵感 "内容"
 *
 * 端口与令牌从桌面版的 settings.json 里读，不需要手动配置。
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function settingsPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(appData, 'LongPost', 'data', 'settings.json');
}

function readPairing() {
  // 优先读 bridge.json：端口每次启动都可能变，那份文件是最新的
  const live = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'LongPost', 'bridge.json');
  if (fs.existsSync(live)) {
    const info = JSON.parse(fs.readFileSync(live, 'utf8'));
    if (info && info.port && info.token) return { port: Number(info.port), token: String(info.token) };
  }

  const file = settingsPath();
  if (!fs.existsSync(file)) {
    throw new Error('找不到桌面版设置：' + file + '（先启动一次 LongPost）');
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.clipBridgeEnabled) throw new Error('本地桥没开：设置 → Chrome 剪藏 → 开启本地桥');
  if (!data.clipBridgeToken || !data.clipBridgePort) throw new Error('还没生成配对信息：在设置里打开一次「Chrome 剪藏」');
  return { port: Number(data.clipBridgePort), token: String(data.clipBridgeToken) };
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => resolve(buf));
  });
}

async function main() {
  const args = process.argv.slice(2);
  let title = '';
  let tags = [];
  const words = [];

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--title') title = args[++i] || '';
    else if (args[i] === '--tag') tags.push(args[++i] || '');
    else words.push(args[i]);
  }

  const stdin = await readStdin();
  const content = [words.join(' '), stdin].filter(Boolean).join('\n').trim();
  if (!content) {
    console.error('没有内容可保存。用法：longpost-cli "一段文字"');
    process.exit(1);
  }

  const { port, token } = readPairing();

  const res = await fetch('http://127.0.0.1:' + port + '/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LongPost-Token': token },
    body: JSON.stringify({
      title: title || content.slice(0, 30),
      content: content,
      tags: tags.join(','),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('保存失败：HTTP ' + res.status + ' ' + detail.slice(0, 120));
    process.exit(1);
  }

  console.log('已保存到 LongPost（' + content.length + ' 字）');
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
