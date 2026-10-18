const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
// 版本号从 package.json 读，输出目录跟随当前用户的桌面，不再写死某台机器的绝对路径
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;
const desktopPath = path.join(os.homedir(), 'Desktop');

const ignoreDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.spark_project',
  'coverage',
  '.vscode',
  '.idea',
  'archive'
]);

const allowedExts = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs',
  '.css', '.html', '.md', '.sql', '.prisma', '.yml', '.yaml'
]);

// Collect files
function collectFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) {
        results = results.concat(collectFiles(path.join(dir, entry.name)));
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      // Exclude giant lockfiles or minified bundle artifacts if any
      if (entry.name === 'package-lock.json' || entry.name.endsWith('.min.js')) {
        continue;
      }
      if (allowedExts.has(ext)) {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  return results;
}

const allFilePaths = collectFiles(projectRoot);
console.log(`Discovered ${allFilePaths.length} source and config files.`);

// 1. Generate All-In-One Text File for Gemini Argon
const allInOnePath = path.join(desktopPath, `LongPost-v${APP_VERSION}-Codebase-AllInOne.txt`);
const outStream = fs.createWriteStream(allInOnePath, { encoding: 'utf8' });

outStream.write('# ================================================================================\n');
outStream.write(`# LongPost (v${APP_VERSION}) Full Production Codebase\n`);
outStream.write('# Clean Architecture: React 19 + NestJS + Drizzle ORM + Electron 44 + Capacitor 8\n');
outStream.write('# Dual-Mode Architecture: Apple Zen (🍎 简洁版) & Google Pro Studio (🎨 专业版)\n');
outStream.write('# Target Reviewer: Gemini 4 Argon\n');
outStream.write(`# Date: ${new Date().toISOString().slice(0, 10)}\n`);
outStream.write('# ================================================================================\n\n');

outStream.write('## Project Directory Structure\n\n```\n');
const relPaths = allFilePaths.map(p => path.relative(projectRoot, p).replace(/\\/g, '/')).sort();
for (const rel of relPaths) {
  outStream.write(rel + '\n');
}
outStream.write('```\n\n');

outStream.write('## Full Source Code of All Modules\n\n');

for (const rel of relPaths) {
  const fullPath = path.join(projectRoot, rel);
  const content = fs.readFileSync(fullPath, 'utf8');
  outStream.write('\n' + '='.repeat(80) + '\n');
  outStream.write(`// FILE: ${rel}\n`);
  outStream.write('='.repeat(80) + '\n\n');
  outStream.write(content);
  outStream.write('\n');
}

outStream.end(() => {
  const stat = fs.statSync(allInOnePath);
  console.log(`Successfully generated All-In-One text file:`);
  console.log(`Path: ${allInOnePath}`);
  console.log(`Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${stat.size} bytes)`);
});

// 2. Also ensure ZIP file is created cleanly
// Using node-archiver or native zip script
const zipPath = path.join(desktopPath, `LongPost-v${APP_VERSION}-Complete.zip`);
console.log(`Target ZIP path: ${zipPath}`);
