'use strict';

// 在全新临时库中启动真正的桌面窗口，避免测试读写用户自己的文章。
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(root, 'longpost-ui-test-'));
app.setPath('userData', dataDir);
process.argv.push('--smoke=' + path.join(dataDir, 'screen.png'));
process.argv.push('--smoke-script=' + path.join(__dirname, 'save-scenario.js'));

process.on('exit', () => {
  const relative = path.relative(root, dataDir);
  if (relative.startsWith('longpost-ui-test-') && !relative.includes(path.sep)) {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* 临时文件由系统稍后清理 */ }
  }
});

require('../main.js');
