import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 更新器只在 Electron 里跑，但版本比较与选包是纯函数，可以直接单测。
// 顶层 require('electron') 在纯 Node 下返回的是二进制路径字符串，解构得到 undefined，不影响这些函数。
const updater = require('../desktop/lib/updater.js');

describe('应用内更新：版本比较', () => {
  it('按语义化版本逐段比较', () => {
    assert.equal(updater.compareVersions('2.9.8', '2.9.7'), 1);
    assert.equal(updater.compareVersions('2.9.7', '2.9.8'), -1);
    assert.equal(updater.compareVersions('2.9.8', '2.9.8'), 0);
    assert.equal(updater.compareVersions('v2.10.0', '2.9.9'), 1);
    assert.equal(updater.compareVersions('2.10', '2.9.9'), 1);
    assert.equal(updater.compareVersions('2.9.8-beta.1', '2.9.8'), 0);
  });

  it('容错：空值与非数字段按 0 处理', () => {
    assert.equal(updater.compareVersions('', '0.0.0'), 0);
    assert.equal(updater.compareVersions('2.x.1', '2.0.1'), 0);
    assert.deepEqual(updater.parseVersion('v2.9.8'), [2, 9, 8]);
  });
});

describe('应用内更新：安装包选择', () => {
  const assets = [
    { name: 'LongPost.Setup.2.9.9.exe', browser_download_url: 'https://x/setup.exe' },
    { name: 'LongPost.2.9.9.exe', browser_download_url: 'https://x/portable.exe' },
    { name: 'LongPost-2.9.9-arm64.dmg', browser_download_url: 'https://x/app.dmg' },
    { name: 'LongPost-2.9.9.AppImage', browser_download_url: 'https://x/app.AppImage' },
    { name: 'checksums.txt', browser_download_url: 'https://x/checksums.txt' },
  ];

  it('Windows 优先选安装版而不是便携版', () => {
    assert.equal(updater.pickAsset(assets, 'win32').name, 'LongPost.Setup.2.9.9.exe');
  });

  it('macOS 选 dmg，Linux 选 AppImage', () => {
    assert.equal(updater.pickAsset(assets, 'darwin').name, 'LongPost-2.9.9-arm64.dmg');
    assert.equal(updater.pickAsset(assets, 'linux').name, 'LongPost-2.9.9.AppImage');
  });

  it('没有匹配产物时返回 null，而不是瞎挑一个', () => {
    assert.equal(updater.pickAsset([{ name: 'notes.txt' }], 'win32'), null);
    assert.equal(updater.pickAsset([], 'win32'), null);
  });

  it('能识别校验和清单', () => {
    assert.equal(updater.pickChecksumAsset(assets).name, 'checksums.txt');
    assert.equal(updater.pickChecksumAsset([{ name: 'a.zip' }]), null);
  });
});

describe('应用内更新：校验和解析', () => {
  const sha = 'a'.repeat(64);

  it('从 sha256sum 格式里取出对应文件的哈希', () => {
    const text = sha + '  LongPost.Setup.2.9.9.exe\n' + 'b'.repeat(64) + '  other.dmg\n';
    assert.equal(updater.findChecksum(text, 'LongPost.Setup.2.9.9.exe'), sha);
  });

  it('兼容带星号的二进制模式写法', () => {
    assert.equal(updater.findChecksum(sha + ' *LongPost.exe\n', 'LongPost.exe'), sha);
  });

  it('只有一行裸哈希时也认', () => {
    assert.equal(updater.findChecksum(sha, 'anything.exe'), sha);
  });

  it('GitHub 把空格换成点之后仍能匹配（真实踩过的坑）', () => {
    // CI 里算出来是空格，Release 上资产名是点
    const text = sha + '  LongPost Setup 2.9.9.exe\n';
    assert.equal(updater.findChecksum(text, 'LongPost.Setup.2.9.9.exe'), sha);
    // 反过来也要成立
    const text2 = sha + '  LongPost.Setup.2.9.9.exe\n';
    assert.equal(updater.findChecksum(text2, 'LongPost Setup 2.9.9.exe'), sha);
  });

  it('便携版与安装版不会被混淆', () => {
    const text = sha + '  LongPost Setup 2.9.9.exe\n' + 'c'.repeat(64) + '  LongPost 2.9.9.exe\n';
    assert.equal(updater.findChecksum(text, 'LongPost.2.9.9.exe'), 'c'.repeat(64));
    assert.equal(updater.findChecksum(text, 'LongPost.Setup.2.9.9.exe'), sha);
  });

  it('找不到对应文件时返回 null（调用方据此决定是否放行）', () => {
    assert.equal(updater.findChecksum(sha + '  a.exe\n', 'b.exe'), null);
    assert.equal(updater.findChecksum('', 'a.exe'), null);
  });
});
