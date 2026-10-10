'use strict';

/**
 * 桌面版的存储入口 —— 把「磁盘后端」接到「与平台无关的仓库层」上。
 *
 * 主进程只跟这个模块打交道；规则本身在 lib/repo.js 里，跟手机端共用同一份。
 * init / dataDir / filesDir 保持同步：主进程注册 lp:// 协议、建菜单时要用，
 * 那两步都在 await 之外。其余方法返回 Promise，main.js 里用 ipcMain.handle 接。
 */

const path = require('node:path');

const { createRepo } = require('./repo');
const { createFsBackend } = require('./backend-fs');

const backend = createFsBackend();
const repo = createRepo(backend);

function init(userDataDir) {
  backend.setBase(path.join(userDataDir, 'data'));
}

module.exports = { ...repo, init };
