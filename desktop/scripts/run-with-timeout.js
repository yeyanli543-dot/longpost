/**
 * 带硬超时地跑一个脚本。
 *
 * 为什么需要它：之前 verify-mobile.js 在 echarts 的压缩代码上触发了正则回溯，
 * Node 主线程被占满，进程既算不完也退不出来，结果把整条本地执行通道一起堵住了，
 * 半个多小时里连 `Write-Output "alive"` 都发不出去。脚本内部的 setTimeout 挡不住
 * 这种情况——事件循环都跑不到了。只有一个独立的父进程能从外面把它掐掉。
 *
 * 用法：node scripts/run-with-timeout.js <毫秒> <脚本路径> [参数...]
 * 退出码：子进程正常结束就用它自己的码；超时被杀返回 124。
 */

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const args = process.argv.slice(2);
const limit = Number(args[0]);
const script = args[1];

if (!limit || !script) {
  console.error('用法：node scripts/run-with-timeout.js <毫秒> <脚本路径> [参数...]');
  process.exit(2);
}

const target = path.resolve(script);
const child = spawn(process.execPath, [target, ...args.slice(2)], { stdio: 'inherit' });

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error('\n[run-with-timeout] ' + path.basename(target) + ' 超过 ' + limit + 'ms 仍未结束，强制终止。');
  try {
    child.kill('SIGKILL');
  } catch (e) {
    /* 已经退出了 */
  }
}, limit);

child.on('error', (err) => {
  clearTimeout(timer);
  console.error('[run-with-timeout] 启动失败：' + err.message);
  process.exit(2);
});

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (timedOut) process.exit(124);
  process.exit(code == null ? (signal ? 1 : 0) : code);
});
