#!/usr/bin/env node
const path = require('node:path');
const { spawn } = require('node:child_process');

process.chdir(path.resolve(__dirname, '..'));

console.log('[LongPost] 加载环境变量 (.env.local / .env)...');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
} catch (e) {
  // dotenv optional
}

console.log('[LongPost] 并行启动开发服务器: dev:server (NestJS) + dev:client (Vite)');
const child = spawn(
  'npx',
  [
    'concurrently',
    '--names',
    'server,client',
    '--prefix-colors',
    'blue,green',
    '--kill-others-on-fail',
    'npm run dev:server',
    'npm run dev:client',
  ],
  { stdio: 'inherit', env: process.env, shell: true },
);

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
