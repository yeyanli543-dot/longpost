/**
 * 测试期路径别名解析器
 *
 * 生产代码里到处是 `@/...`、`@shared/...`、`@client/...` 这类别名：
 * 浏览器端由 Vite alias 解析，服务端由 SWC 编译期把 tsconfig.paths 展开。
 * 但 `node --test` 直接跑 .mjs/.ts 时没有任何人认识这些别名，
 * 于是过去的测试只能把逻辑"抄一份"进测试文件 —— 测试全绿，线上照坏。
 *
 * 这里用 Node 24 的 module.registerHooks 在解析阶段把别名映射回真实文件，
 * 让测试可以 import 生产模块本体。
 */

import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');

/** 别名前缀 → 磁盘目录 */
const ALIASES = [
  ['@shared/', path.join(ROOT, 'shared')],
  ['@client/', path.join(ROOT, 'client')],
  ['@/', path.join(ROOT, 'client', 'src')],
];

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

function resolveAlias(specifier) {
  for (const [prefix, baseDir] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue;
    const target = path.join(baseDir, specifier.slice(prefix.length));
    for (const ext of EXTENSIONS) {
      const candidate = target + ext;
      try {
        if (fs.statSync(candidate).isFile()) {
          return pathToFileURL(candidate).href;
        }
      } catch {
        // 继续尝试下一个扩展名
      }
    }
    return null;
  }
  return null;
}

/**
 * 相对路径没有写扩展名时（源码里到处是 `from './logger'`），
 * 按 TS/TSX/index 的顺序补全 —— 这套规则和 Vite / tsc 的解析顺序一致。
 */
function resolveRelative(specifier, parentURL) {
  if (!specifier.startsWith('.')) return null;
  if (/\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(specifier)) return null;
  if (!parentURL) return null;

  const baseDir = path.dirname(new URL(parentURL).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const target = path.resolve(baseDir, specifier);

  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = target + ext;
    try {
      if (fs.statSync(candidate).isFile()) {
        return pathToFileURL(candidate).href;
      }
    } catch {
      // 继续尝试
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mapped = resolveAlias(specifier) || resolveRelative(specifier, context.parentURL);
    if (mapped) {
      return { url: mapped, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
