/**
 * LongPost Bridge —— Obsidian 插件
 *
 * 读 LongPost 桌面版写在 bridge.json 里的端口与令牌，把最近的剪藏
 * 拉进 vault。不需要在插件里再配一次。
 *
 * 之所以是 desktopOnly：要读本地文件，移动端 Obsidian 没有 Node。
 */

'use strict';

const { Plugin, Notice, normalizePath } = require('obsidian');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function bridgeFilePath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'LongPost', 'bridge.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'LongPost', 'bridge.json');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'LongPost', 'bridge.json');
}

function readBridge() {
  const file = bridgeFilePath();
  if (!fs.existsSync(file)) {
    throw new Error('找不到 LongPost 运行信息：请先打开 LongPost 桌面版');
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.port || !data.token) throw new Error('LongPost 本地桥还没启动');
  return data;
}

function safeName(title) {
  return String(title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '未命名';
}

module.exports = class LongPostBridge extends Plugin {
  async onload() {
    this.addCommand({
      id: 'import-recent-clips',
      name: '导入最近的剪藏',
      callback: () => this.importRecent(),
    });

    this.addRibbonIcon('download', '导入 LongPost 剪藏', () => this.importRecent());
  }

  async importRecent() {
    let bridge;
    try {
      bridge = readBridge();
    } catch (error) {
      new Notice(error.message);
      return;
    }

    let items = [];
    try {
      const res = await fetch('http://127.0.0.1:' + bridge.port + '/recent', {
        headers: { 'X-LongPost-Token': bridge.token },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      items = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      new Notice('连不上 LongPost：' + error.message);
      return;
    }

    if (items.length === 0) {
      new Notice('LongPost 里还没有剪藏');
      return;
    }

    const folder = normalizePath(this.app.vault.configDir ? 'LongPost' : 'LongPost');
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder).catch(() => {});
    }

    let created = 0;
    for (const item of items) {
      const name = normalizePath(folder + '/' + safeName(item.title) + '.md');
      if (this.app.vault.getAbstractFileByPath(name)) continue;

      const body = [
        '---',
        'source: ' + (item.url || ''),
        'captured: ' + (item.at || ''),
        '---',
        '',
        item.content || '',
      ].join('\n');

      await this.app.vault.create(name, body).catch(() => {});
      created += 1;
    }

    new Notice('已导入 ' + created + ' 条剪藏' + (created < items.length ? '（其余已存在）' : ''));
  }
};
