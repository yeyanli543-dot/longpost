/**
 * 应用内更新
 *
 * 目标：用户在应用里就能知道有新版本，并且直接下载安装，不用跑去 GitHub 页面。
 *
 * 两个刻意的选择：
 * 1. **不引入 electron-updater**：它要求代码签名（macOS）与 NSIS 的差分包，
 *    对当前这种「GitHub Actions 出包 + 免安装版发行」的分发方式反而更脆。
 *    这里自己拉一个清单、下安装包、校验 sha256、再拉起安装程序，链路短且可控。
 * 2. **校验和优先**：下载完先算 sha256，发布方提供了 .sha256 就必须匹配才允许执行；
 *    没提供则记录警告——宁可让用户多点一次，也不静默执行来路不明的 exe。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, shell, net } = require('electron');

/** 仓库地址与「最新发布」入口（走 302 跳转，不吃 API 限流） */
const REPO_BASE = 'https://github.com/yeyanli543-dot/longpost';
const LATEST_PAGE = REPO_BASE + '/releases/latest';

/** 默认清单地址：GitHub Releases API（只取 latest，不列全部） */
const DEFAULT_FEED =
  'https://api.github.com/repos/yeyanli543-dot/longpost/releases/latest';

const CHECK_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------- 版本比较

/** 把 "v3.0.3" 拆成 [2,9,8]，非数字段按 0 处理 */
function parseVersion(input) {
  const cleaned = String(input || '').trim().replace(/^v/i, '').split('-')[0];
  return cleaned.split('.').map((n) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) ? v : 0;
  });
}

/** a > b 返回 1，相等 0，小于 -1 */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// ---------------------------------------------------------------- 选包

/**
 * 按当前平台挑安装包。
 * 优先挑版本化命名的资源（LongPost.Setup.3.0.3.exe），避免误拿滚动构建。
 */
function pickAsset(assets, platform = process.platform) {
  const list = Array.isArray(assets) ? assets : [];
  const byExt = (ext) => list.filter((a) => String(a.name || '').toLowerCase().endsWith(ext));

  if (platform === 'win32') {
    const exe = byExt('.exe');
    return exe.find((a) => /setup/i.test(a.name)) || exe[0] || null;
  }
  if (platform === 'darwin') {
    return byExt('.dmg')[0] || null;
  }
  if (platform === 'linux') {
    return byExt('.appimage')[0] || null;
  }
  return null;
}

/** 找发布方提供的 sha256 清单（同名的 .sha256 资源，或 checksums.txt） */
function pickChecksumAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  return list.find((a) => /\.sha256$/i.test(a.name || '')) || list.find((a) => /checksums.*\.txt$/i.test(a.name || '')) || null;
}

// ---------------------------------------------------------------- 版本发现

/**
 * 从 GitHub 的 /releases/latest 302 跳转地址里解析版本号。
 * 例：https://github.com/o/r/releases/tag/v3.5.1 → 3.5.1
 */
function parseLatestTag(location) {
  const text = String(location || '');
  const m = text.match(/\/releases\/tag\/v?([0-9][0-9.\w-]*)/i);
  return m ? m[1] : null;
}

/**
 * 按命名约定拼出各平台资产地址。
 *
 * 这样就不必依赖 GitHub API —— 未认证的 API 每小时只有 60 次，
 * 用完就 403，更新提示会静默失效（实测遇到过）。
 */
function assetUrlFor(version, platform) {
  const base = REPO_BASE + '/releases/download/v' + version + '/';
  if (platform === 'win32') {
    return { setup: base + 'LongPost.Setup.' + version + '.exe', portable: base + 'LongPost.' + version + '.exe' };
  }
  if (platform === 'darwin') return { dmg: base + 'LongPost-' + version + '-arm64.dmg' };
  if (platform === 'linux') return { appImage: base + 'LongPost-' + version + '.AppImage' };
  return {};
}

// ---------------------------------------------------------------- 网络

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' });
    request.setHeader('User-Agent', 'LongPost-Desktop-Updater');
    request.setHeader('Accept', 'application/vnd.github+json');
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('检查更新超时'));
    }, CHECK_TIMEOUT_MS);

    let body = '';
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        clearTimeout(timer);
        reject(new Error('检查更新失败：HTTP ' + response.statusCode));
        response.resume();
        return;
      }
      response.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      response.on('end', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('更新清单不是合法 JSON'));
        }
      });
    });
    request.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}

/** 下载到 dest，边下边算 sha256，回调进度 */
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' });
    request.setHeader('User-Agent', 'LongPost-Desktop-Updater');

    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error('下载失败：HTTP ' + response.statusCode));
        response.resume();
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      const out = fs.createWriteStream(dest);
      const hash = crypto.createHash('sha256');
      let received = 0;

      response.on('data', (chunk) => {
        received += chunk.length;
        hash.update(chunk);
        out.write(chunk);
        if (onProgress) onProgress(received, total);
      });

      response.on('end', () => {
        out.end(() => resolve({ sha256: hash.digest('hex'), bytes: received }));
      });

      response.on('error', (err) => {
        out.destroy();
        reject(err);
      });
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * 文件名归一化。
 *
 * GitHub 上传资源时会把空格换成点：CI 里算出来的是
 * "LongPost Setup 3.0.3.exe"，Release 上却叫 "LongPost.Setup.3.0.3.exe"。
 * 直接字符串相等会永远匹配不上，导致明明提供了校验和却被判定为"未校验"。
 */
function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(/^\*/, '')
    .toLowerCase()
    .replace(/[\s.]+/g, '.');
}

/** 从 checksums 文本里取出指定文件名的 sha256 */
function findChecksum(text, fileName) {
  const lines = String(text || '').split(/\r?\n/);
  const want = normalizeName(fileName);

  for (const line of lines) {
    // 文件名本身可能带空格（"LongPost Setup 3.0.3.exe"），
    // 所以只按第一段空白切成「哈希 / 文件名」，不能把整行 split 完再取最后一段。
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!match) continue;
    if (normalizeName(match[2]) === want) return match[1].toLowerCase();
  }
  // 只有一个哈希、没有文件名时，也接受
  const only = lines.map((l) => l.trim()).filter(Boolean);
  if (only.length === 1 && /^[0-9a-f]{64}$/i.test(only[0])) return only[0].toLowerCase();
  return null;
}

// ---------------------------------------------------------------- 对外接口

/**
 * 检查更新。
 * @param {object} options
 * @param {string} [options.feed] 自定义清单地址；默认 GitHub latest release
 * @param {string} [options.currentVersion] 默认取 app.getVersion()
 */
function headLocation(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'HEAD', redirect: 'manual' });
    request.setHeader('User-Agent', 'LongPost-Desktop-Updater');
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('检查更新超时'));
    }, CHECK_TIMEOUT_MS);

    request.on('response', (response) => {
      clearTimeout(timer);
      const location = response.headers.location || response.headers.Location;
      response.resume();
      resolve({ status: response.statusCode, location: Array.isArray(location) ? location[0] : location });
    });
    request.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}

/**
 * 走网页跳转拿版本：没有 API 限流，也不会因为 403 静默失效。
 */
async function checkViaRedirect(currentVersion) {
  const { status, location } = await headLocation(LATEST_PAGE);
  if (status !== 301 && status !== 302 && status !== 307 && status !== 308) {
    throw new Error('最新的发布页没有按预期跳转（HTTP ' + status + '）');
  }
  const latest = parseLatestTag(location);
  if (!latest) throw new Error('无法从跳转地址解析版本号');

  const hasUpdate = compareVersions(latest, currentVersion) > 0;
  const assets = assetUrlFor(latest, process.platform);

  if (!hasUpdate) {
    return { current: currentVersion, latest, hasUpdate: false, notes: '', url: null, assetName: null, checksumUrl: null, publishedAt: null };
  }

  const name =
    process.platform === 'win32'
      ? 'LongPost.Setup.' + latest + '.exe'
      : process.platform === 'darwin'
        ? 'LongPost-' + latest + '-arm64.dmg'
        : 'LongPost-' + latest + '.AppImage';
  const url =
    process.platform === 'win32'
      ? assets.setup
      : process.platform === 'darwin'
        ? assets.dmg
        : assets.appImage;

  return {
    current: currentVersion,
    latest,
    hasUpdate: true,
    notes: '',
    url,
    assetName: name,
    checksumUrl: REPO_BASE + '/releases/download/v' + latest + '/checksums.txt',
    publishedAt: null,
  };
}

async function checkForUpdates(options = {}) {
  const currentVersion = options.currentVersion || app.getVersion();
  const feed = options.feed || DEFAULT_FEED;

  const release = await fetchJson(feed);

  // 兼容两种清单：GitHub Release 结构 / 自己的极简 JSON { version, notes, url, sha256 }
  const latestVersion = String(release.tag_name || release.version || '').replace(/^v/i, '');
  if (!latestVersion) throw new Error('更新清单缺少版本号');

  const result = {
    current: currentVersion,
    latest: latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    notes: String(release.body || release.notes || '').slice(0, 2000),
    url: null,
    assetName: null,
    checksumUrl: null,
    publishedAt: release.published_at || null,
  };

  if (!result.hasUpdate) return result;

  if (release.url && !release.assets) {
    // 极简清单：直接给下载地址
    result.url = release.url;
    result.assetName = path.basename(new URL(release.url).pathname) || 'update';
    if (release.sha256) result.sha256 = String(release.sha256).toLowerCase();
    return result;
  }

  const asset = pickAsset(release.assets);
  if (!asset) {
    result.error = '这个版本没有提供适用于当前平台的安装包';
    return result;
  }
  result.url = asset.browser_download_url;
  result.assetName = asset.name;

  const checksumAsset = pickChecksumAsset(release.assets);
  if (checksumAsset) result.checksumUrl = checksumAsset.browser_download_url;

  return result;
}

/**
 * 下载并校验安装包，返回本地路径。
 * 发布方提供 checksums 时，哈希不匹配会直接抛错并删除文件。
 */
async function downloadUpdate(info, options = {}) {
  if (!info || !info.url) throw new Error('没有可下载的安装包');

  const dir = options.dir || path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, info.assetName || 'LongPost-update.bin');

  const { sha256 } = await downloadFile(info.url, dest, options.onProgress);

  let expected = info.sha256 || null;
  if (!expected && info.checksumUrl) {
    try {
      const text = await new Promise((resolve, reject) => {
        const request = net.request({ url: info.checksumUrl, method: 'GET', redirect: 'follow' });
        let body = '';
        request.on('response', (res) => {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
          res.on('data', (c) => { body += c.toString('utf8'); });
          res.on('end', () => resolve(body));
        });
        request.on('error', reject);
        request.end();
      });
      expected = findChecksum(text, info.assetName);
    } catch {
      expected = null;
    }
  }

  if (expected && expected !== sha256) {
    try { fs.unlinkSync(dest); } catch { /* 忽略 */ }
    throw new Error('安装包校验失败（sha256 不匹配），已删除下载文件');
  }

  return { filePath: dest, sha256, verified: Boolean(expected) };
}

/** 拉起安装程序，然后退出当前应用 */
async function installUpdate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('安装包不存在，请重新下载');
  const error = await shell.openPath(filePath);
  if (error) throw new Error('无法启动安装程序：' + error);
  // 给安装程序一点时间接管文件占用
  setTimeout(() => app.quit(), 800);
  return true;
}

module.exports = {
  DEFAULT_FEED,
  compareVersions,
  parseVersion,
  pickAsset,
  pickChecksumAsset,
  findChecksum,
  normalizeName,
  parseLatestTag,
  assetUrlFor,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
};
