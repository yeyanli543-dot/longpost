import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const U = require('../desktop/lib/updater.js');

describe('更新：从跳转地址解析版本', () => {
  it('标准 tag 地址', () => {
    assert.equal(U.parseLatestTag('https://github.com/o/r/releases/tag/v3.4.0'), '3.4.0');
  });
  it('没有 v 前缀', () => {
    assert.equal(U.parseLatestTag('https://github.com/o/r/releases/tag/3.4.1'), '3.4.1');
  });
  it('非跳转地址返回 null', () => {
    assert.equal(U.parseLatestTag('https://github.com/o/r/releases'), null);
    assert.equal(U.parseLatestTag(undefined), null);
  });
});

describe('更新：资产命名约定', () => {
  it('Windows 安装版与便携版', () => {
    const a = U.assetUrlFor('3.4.0', 'win32');
    assert.ok(a.setup.endsWith('/v3.4.0/LongPost.Setup.3.4.0.exe'));
    assert.ok(a.portable.endsWith('/v3.4.0/LongPost.3.4.0.exe'));
  });
  it('macOS 与 Linux', () => {
    assert.ok(U.assetUrlFor('3.4.0', 'darwin').dmg.endsWith('LongPost-3.4.0-arm64.dmg'));
    assert.ok(U.assetUrlFor('3.4.0', 'linux').appImage.endsWith('LongPost-3.4.0.AppImage'));
  });
});
