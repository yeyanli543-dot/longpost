import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const updater = require('../desktop/lib/updater.js');
const latestPage = 'https://github.com/yeyanli543-dot/longpost/releases/latest';

function fakeNet(routes) {
  const calls = [];
  return {
    calls,
    request(options) {
      calls.push(options);
      const request = new EventEmitter();
      request.setHeader = () => {};
      request.abort = () => {};
      request.end = () => setImmediate(() => {
        const route = routes[options.url];
        if (!route) return request.emit('error', new Error('未模拟的地址'));
        if (route.hang) return;
        if (route.error) return request.emit('error', new Error(route.error));
        if (route.redirect) return request.emit('redirect', route.status || 302, options.method, route.redirect, {});
        const body = Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body || '');
        const response = route.stream || Readable.from([body]);
        response.statusCode = route.status || 200;
        response.headers = route.headers || { 'content-length': String(body.length) };
        request.emit('response', response);
      });
      return request;
    },
  };
}

describe('桌面更新完整流程', () => {
  it('官方 API 被限流时，通过 Electron 的 redirect 事件发现新版本', async () => {
    const net = fakeNet({
      [updater.DEFAULT_FEED]: { status: 403 },
      [latestPage]: { redirect: 'https://github.com/yeyanli543-dot/longpost/releases/tag/v3.9.0' },
    });
    const info = await updater.checkForUpdates({ currentVersion: '3.8.1', platform: 'win32', arch: 'x64', net });
    assert.equal(info.latest, '3.9.0');
    assert.equal(info.hasUpdate, true);
    assert.match(info.url, /LongPost\.Setup\.3\.9\.0\.exe$/);
    assert.match(info.checksumUrl, /checksums\.txt$/);
    assert.equal(net.calls[1].method, 'HEAD');
  });

  it('自定义源出错不回退到官方源，官方重定向也不能指向其他仓库', async () => {
    const custom = fakeNet({ 'https://example.test/feed': { status: 403 } });
    await assert.rejects(updater.checkForUpdates({ currentVersion: '1.0.0', feed: 'https://example.test/feed', net: custom }), /403/);
    assert.equal(custom.calls.length, 1);
    const net = fakeNet({
      [updater.DEFAULT_FEED]: { status: 403 },
      [latestPage]: { redirect: 'https://evil.test/yeyanli543-dot/longpost/releases/tag/v9.0.0' },
    });
    await assert.rejects(updater.checkForUpdates({ currentVersion: '1.0.0', net }), /未知地址/);
  });

  it('备用检查保留不带 v 前缀的真实发布标签', async () => {
    const net = fakeNet({
      [updater.DEFAULT_FEED]: { status: 403 },
      [latestPage]: { redirect: 'https://github.com/yeyanli543-dot/longpost/releases/tag/3.9.0' },
    });
    const info = await updater.checkForUpdates({ currentVersion: '3.8.1', platform: 'win32', arch: 'x64', net });
    assert.match(info.url, /\/download\/3\.9\.0\//);
    assert.match(info.checksumUrl, /\/download\/3\.9\.0\//);
  });

  it('按设备架构选择资源，校验和只选择对应文件或总清单', async () => {
    const release = {
      tag_name: 'v4.0.0', body: '新功能', assets: [
        { name: 'LongPost-4.0.0-arm64.dmg', browser_download_url: 'https://example.test/arm.dmg' },
        { name: 'other.dmg.sha256', browser_download_url: 'https://example.test/other.sha256' },
        { name: 'checksums.txt', browser_download_url: 'https://example.test/checksums.txt' },
      ],
    };
    const net = fakeNet({ [updater.DEFAULT_FEED]: { body: JSON.stringify(release) } });
    const arm = await updater.checkForUpdates({ currentVersion: '3.8.1', platform: 'darwin', arch: 'arm64', net });
    assert.match(arm.url, /arm\.dmg$/);
    assert.match(arm.checksumUrl, /checksums\.txt$/);
    const intel = await updater.checkForUpdates({ currentVersion: '3.8.1', platform: 'darwin', arch: 'x64', net });
    assert.equal(intel.url, null);
    assert.match(intel.error, /当前平台/);
  });

  it('下载前取得校验和，流式写入并校验后才返回安装包', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-update-'));
    try {
      const data = Buffer.from('verified installer bytes');
      const sha = crypto.createHash('sha256').update(data).digest('hex');
      const info = { url: 'https://example.test/app.exe', assetName: 'LongPost.Setup.4.0.0.exe', checksumUrl: 'https://example.test/checksums.txt' };
      const net = fakeNet({
        [info.checksumUrl]: { body: sha + '  ' + info.assetName + '\n' },
        [info.url]: { body: data },
      });
      const progress = [];
      const result = await updater.downloadUpdate(info, { dir, net, onProgress: (n) => progress.push(n) });
      assert.equal(result.verified, true);
      assert.deepEqual(fs.readFileSync(result.filePath), data);
      assert.equal(progress.at(-1), data.length);
      assert.deepEqual(fs.readdirSync(dir), [path.basename(result.filePath)]);
      assert.equal(net.calls[0].url, info.checksumUrl);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('缺失、不可读取或不匹配的校验和都不能产生可安装文件', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-update-'));
    try {
      const info = { url: 'https://example.test/app.exe', assetName: 'app.exe', checksumUrl: 'https://example.test/checksums.txt' };
      const noChecksum = fakeNet({ [info.checksumUrl]: { status: 404 } });
      await assert.rejects(updater.downloadUpdate(info, { dir, net: noChecksum }), /404/);
      assert.equal(noChecksum.calls.length, 1);
      const noEntry = fakeNet({ [info.checksumUrl]: { body: 'a'.repeat(64) + '  other.exe' } });
      await assert.rejects(updater.downloadUpdate(info, { dir, net: noEntry }), /校验和/);
      const mismatch = fakeNet({ [info.checksumUrl]: { body: 'a'.repeat(64) + '  app.exe' }, [info.url]: { body: 'wrong' } });
      await assert.rejects(updater.downloadUpdate(info, { dir, net: mismatch }), /校验失败/);
      await assert.rejects(updater.downloadUpdate({ ...info, assetName: '../outside.exe' }, { dir, net: mismatch }), /文件名/);
      await assert.rejects(updater.downloadUpdate({ ...info, url: 'http://example.test/app.exe' }, { dir, net: mismatch }), /HTTPS/);
      const downgrade = fakeNet({ [info.url]: { redirect: 'http://example.test/unsafe.exe' } });
      await assert.rejects(updater.downloadUpdate({ ...info, checksumUrl: null, sha256: 'a'.repeat(64) }, { dir, net: downgrade }), /HTTPS/);
      assert.deepEqual(fs.readdirSync(dir), []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('传输中断和长度不符会删除临时文件', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-update-'));
    try {
      const body = Buffer.from('short');
      const info = { url: 'https://example.test/app.exe', assetName: 'app.exe', sha256: crypto.createHash('sha256').update(body).digest('hex') };
      const truncated = fakeNet({ [info.url]: { body, headers: { 'content-length': '100' } } });
      await assert.rejects(updater.downloadUpdate(info, { dir, net: truncated }), /不完整/);
      const broken = new Readable({ read() { this.destroy(new Error('连接中断')); } });
      const interrupted = fakeNet({ [info.url]: { stream: broken } });
      await assert.rejects(updater.downloadUpdate(info, { dir, net: interrupted }), /连接中断/);
      const stalled = fakeNet({ [info.url]: { hang: true } });
      await assert.rejects(updater.downloadUpdate(info, { dir, net: stalled, idleTimeoutMs: 20 }), /超时/);
      assert.deepEqual(fs.readdirSync(dir), []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('macOS 和 Linux 给出手动安装指引且不会退出当前应用', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-update-'));
    try {
      const file = path.join(dir, 'update');
      fs.writeFileSync(file, 'test');
      const opened = [];
      const shell = { async openPath(p) { opened.push(p); return ''; }, showItemInFolder(p) { opened.push(p); } };
      const app = { quit() { throw new Error('不能退出'); } };
      const expectedSha256 = crypto.createHash('sha256').update('test').digest('hex');
      assert.equal((await updater.installUpdate(file, { platform: 'darwin', shell, app, expectedSha256 })).mode, 'manual');
      assert.equal((await updater.installUpdate(file, { platform: 'linux', shell, app, expectedSha256 })).mode, 'manual');
      assert.deepEqual(opened, [file, file]);
      await assert.rejects(updater.installUpdate(file, { platform: 'win32', shell: { async openPath() { return '失败'; } }, app, expectedSha256 }), /失败/);
      fs.writeFileSync(file, 'modified');
      await assert.rejects(updater.installUpdate(file, { platform: 'darwin', shell, app, expectedSha256 }), /发生变化/);
      assert.deepEqual(opened, [file, file]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
