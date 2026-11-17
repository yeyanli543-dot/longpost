/**
 * 应用内更新
 *
 * 目标：用户在应用里就能知道有新版本，并且直接下载安装，不用跑去 GitHub 页面。
 *
 * 两个刻意的选择：
 * 1. **不引入 electron-updater**：它要求代码签名（macOS）与 NSIS 的差分包，
 *    对当前这种「GitHub Actions 出包 + 免安装版发行」的分发方式反而更脆。
 *    这里自己拉一个清单、下安装包、校验 sha256、再拉起安装程序，链路短且可控。
 * 2. 安装前必须取得并核对 SHA-256；校验失败或无法取得校验和时停止更新。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform, pipeline } = require('node:stream');

/** 仓库地址与「最新发布」入口（走 302 跳转，不吃 API 限流） */
const REPO_BASE = 'https://github.com/yeyanli543-dot/longpost';
const LATEST_PAGE = REPO_BASE + '/releases/latest';

/** 默认清单地址：GitHub Releases API（只取 latest，不列全部） */
const DEFAULT_FEED =
  'https://api.github.com/repos/yeyanli543-dot/longpost/releases/latest';

const CHECK_TIMEOUT_MS = 15000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 60000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

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
function pickAsset(assets, platform = process.platform, arch = process.arch) {
  const list = Array.isArray(assets) ? assets : [];
  const byExt = (ext) => list.filter((a) => String(a.name || '').toLowerCase().endsWith(ext));
  const matchesArch = (asset) => {
    const name = String(asset.name || '').toLowerCase();
    if (/universal/.test(name)) return true;
    if (/(?:arm64|aarch64)/.test(name)) return arch === 'arm64';
    if (/(?:x64|amd64|x86_64)/.test(name)) return arch === 'x64';
    // 目前发布流水线的无架构后缀安装包均由 x64 构建机生成。
    return arch === 'x64';
  };

  if (platform === 'win32') {
    const exe = byExt('.exe').filter(matchesArch);
    return exe.find((a) => /setup/i.test(a.name)) || exe[0] || null;
  }
  if (platform === 'darwin') {
    return byExt('.dmg').filter(matchesArch)[0] || null;
  }
  if (platform === 'linux') {
    return byExt('.appimage').filter(matchesArch)[0] || null;
  }
  return null;
}

/** 找发布方提供的 sha256 清单（同名的 .sha256 资源，或 checksums.txt） */
function pickChecksumAsset(assets, assetName) {
  const list = Array.isArray(assets) ? assets : [];
  const exact = assetName && list.find((a) => normalizeName(a.name) === normalizeName(assetName + '.sha256'));
  return exact || list.find((a) => /checksums.*\.txt$/i.test(a.name || '')) ||
    (!assetName && list.find((a) => /\.sha256$/i.test(a.name || ''))) || null;
}

// ---------------------------------------------------------------- 版本发现

/**
 * 从 GitHub 的 /releases/latest 302 跳转地址里解析版本号。
 * 例：https://github.com/o/r/releases/tag/v3.8.1 → 3.8.1
 */
function parseLatestTag(location) {
  const text = String(location || '');
  const m = text.match(/\/releases\/tag\/v?(\d+(?:\.\d+){1,3})(?:[?#]|$)/i);
  return m ? m[1] : null;
}

/**
 * 按命名约定拼出各平台资产地址。
 *
 * 这样就不必依赖 GitHub API —— 未认证的 API 每小时只有 60 次，
 * 用完就 403，更新提示会静默失效（实测遇到过）。
 */
function assetUrlFor(version, platform, arch = process.arch, tag = 'v' + version) {
  const base = REPO_BASE + '/releases/download/' + encodeURIComponent(tag) + '/';
  if (platform === 'win32' && arch === 'x64') {
    return { setup: base + 'LongPost.Setup.' + version + '.exe', portable: base + 'LongPost.' + version + '.exe' };
  }
  if (platform === 'darwin' && arch === 'arm64') return { dmg: base + 'LongPost-' + version + '-arm64.dmg' };
  if (platform === 'linux' && arch === 'x64') return { appImage: base + 'LongPost-' + version + '.AppImage' };
  return {};
}

// ---------------------------------------------------------------- 网络

function assertHttps(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('更新地址无效'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('更新地址必须使用 HTTPS');
}

function followHttpsRedirects(request, finish) {
  request.on('redirect', (_status, _method, location) => {
    try {
      assertHttps(location);
      // Electron 要求在 redirect 回调内同步调用。
      request.followRedirect();
    } catch (error) {
      finish(error);
      request.abort();
    }
  });
}

function fetchText(url, options = {}) {
  assertHttps(url);
  return new Promise((resolve, reject) => {
    const request = (options.net || require('electron').net).request({ url, method: 'GET', redirect: 'manual' });
    request.setHeader('User-Agent', 'LongPost-Desktop-Updater');
    if (options.accept) request.setHeader('Accept', options.accept);
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {
      request.abort();
      finish(new Error('获取更新信息超时'));
    }, options.timeoutMs || CHECK_TIMEOUT_MS);
    followHttpsRedirects(request, finish);

    const chunks = [];
    let size = 0;
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        finish(new Error('获取更新信息失败：HTTP ' + response.statusCode));
        response.resume();
        return;
      }
      response.on('data', (chunk) => {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_MANIFEST_BYTES) {
          finish(new Error('更新信息过大'));
          request.abort();
          return;
        }
        chunks.push(bytes);
      });
      response.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
      response.on('error', finish);
      response.on('aborted', () => finish(new Error('更新信息传输中断')));
    });
    request.on('error', finish);
    request.end();
  });
}

async function fetchJson(url, netImpl) {
  const text = await fetchText(url, { net: netImpl, accept: 'application/vnd.github+json' });
  try { return JSON.parse(text); } catch { throw new Error('更新清单不是合法 JSON'); }
}

/** 下载到 dest，边下边算 sha256，回调进度 */
function downloadFile(url, dest, onProgress, options = {}) {
  assertHttps(url);
  return new Promise((resolve, reject) => {
    const request = (options.net || require('electron').net).request({ url, method: 'GET', redirect: 'manual' });
    request.setHeader('User-Agent', 'LongPost-Desktop-Updater');
    let done = false;
    let timer;
    let out;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        if (out && !out.closed) {
          out.once('close', () => reject(error));
          out.destroy();
        } else reject(error);
      } else resolve(value);
    };
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        request.abort();
        finish(new Error('安装包下载超时'));
      }, options.idleTimeoutMs || DOWNLOAD_IDLE_TIMEOUT_MS);
    };
    resetTimer();
    followHttpsRedirects(request, finish);

    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        finish(new Error('下载失败：HTTP ' + response.statusCode));
        response.resume();
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      out = fs.createWriteStream(dest, { flags: 'wx' });
      const hash = crypto.createHash('sha256');
      let received = 0;
      const monitor = new Transform({
        transform(chunk, _encoding, callback) {
          resetTimer();
          received += chunk.length;
          hash.update(chunk);
          if (onProgress) {
            try { onProgress(received, total); } catch { /* 进度通知不影响下载 */ }
          }
          callback(null, chunk);
        },
      });
      pipeline(response, monitor, out, (error) => {
        if (error) return finish(error);
        if (!received || (total > 0 && received !== total)) return finish(new Error('安装包下载不完整'));
        finish(null, { sha256: hash.digest('hex'), bytes: received });
      });
    });

    request.on('error', finish);
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
function headLocation(url, netImpl) {
  return new Promise((resolve, reject) => {
    const request = (netImpl || require('electron').net).request({ url, method: 'HEAD', redirect: 'manual' });
    request.setHeader('User-Agent', 'LongPost-Desktop-Updater');
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => {
      request.abort();
      finish(new Error('检查更新超时'));
    }, CHECK_TIMEOUT_MS);

    // Electron 的 manual 重定向通过 redirect 事件暴露，不一定会触发 response。
    request.on('redirect', (status, _method, location) => finish(null, { status, location }));
    request.on('response', (response) => {
      const location = response.headers.location || response.headers.Location;
      response.resume();
      finish(null, { status: response.statusCode, location: Array.isArray(location) ? location[0] : location });
    });
    request.on('error', finish);
    request.end();
  });
}

/**
 * 走网页跳转拿版本：没有 API 限流，也不会因为 403 静默失效。
 */
async function checkViaRedirect(currentVersion, options = {}) {
  const { status, location } = await headLocation(LATEST_PAGE, options.net);
  if (status !== 301 && status !== 302 && status !== 307 && status !== 308) {
    throw new Error('最新的发布页没有按预期跳转（HTTP ' + status + '）');
  }
  let target;
  try { target = new URL(location, LATEST_PAGE); } catch { throw new Error('最新发布页跳转地址无效'); }
  if (target.protocol !== 'https:' || target.hostname !== 'github.com' ||
      !target.pathname.startsWith('/yeyanli543-dot/longpost/releases/tag/')) {
    throw new Error('最新发布页跳转到了未知地址');
  }
  const latest = parseLatestTag(target.href);
  if (!latest) throw new Error('无法从跳转地址解析版本号');
  const tag = target.pathname.split('/').pop();

  const hasUpdate = compareVersions(latest, currentVersion) > 0;
  const platform = options.platform || process.platform;
  const assets = assetUrlFor(latest, platform, options.arch || process.arch, tag);

  if (!hasUpdate) {
    return { current: currentVersion, latest, hasUpdate: false, notes: '', url: null, assetName: null, checksumUrl: null, publishedAt: null };
  }

  const name =
    platform === 'win32'
      ? 'LongPost.Setup.' + latest + '.exe'
      : platform === 'darwin'
        ? 'LongPost-' + latest + '-arm64.dmg'
        : 'LongPost-' + latest + '.AppImage';
  const url =
    platform === 'win32'
      ? assets.setup
      : platform === 'darwin'
        ? assets.dmg
        : assets.appImage;

  if (!url) {
    return { current: currentVersion, latest, hasUpdate: true, notes: '', url: null, assetName: null,
      checksumUrl: null, publishedAt: null, error: '无法确定适用于当前设备的安装包，请查看发布页面' };
  }
  return {
    current: currentVersion,
    latest,
    hasUpdate: true,
    notes: '',
    url,
    assetName: name,
    checksumUrl: REPO_BASE + '/releases/download/' + encodeURIComponent(tag) + '/checksums.txt',
    publishedAt: null,
  };
}

async function checkForUpdates(options = {}) {
  const currentVersion = options.currentVersion || require('electron').app.getVersion();
  const feed = options.feed || DEFAULT_FEED;
  let release;
  try {
    release = await fetchJson(feed, options.net);
    const version = String(release.tag_name || release.version || '').replace(/^v/i, '');
    if (!/^\d+(?:\.\d+){1,3}$/.test(version)) throw new Error('更新清单缺少有效的稳定版本号');
  } catch (error) {
    // 只对官方默认清单回退；自定义源失败时不能悄悄切换到另一个发布源。
    if (feed !== DEFAULT_FEED) throw error;
    try {
      return await checkViaRedirect(currentVersion, options);
    } catch (fallbackError) {
      throw new Error('检查更新失败：' + error.message + '；备用方式：' + fallbackError.message);
    }
  }

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

  const asset = pickAsset(release.assets, options.platform || process.platform, options.arch || process.arch);
  if (!asset) {
    result.error = '这个版本没有提供适用于当前平台的安装包';
    return result;
  }
  result.url = asset.browser_download_url;
  result.assetName = asset.name;

  const checksumAsset = pickChecksumAsset(release.assets, asset.name);
  if (checksumAsset) result.checksumUrl = checksumAsset.browser_download_url;

  return result;
}

/**
 * 下载并校验安装包，返回本地路径。
 * 发布方提供 checksums 时，哈希不匹配会直接抛错并删除文件。
 */
async function downloadUpdate(info, options = {}) {
  if (!info || !info.url) throw new Error('没有可下载的安装包');
  assertHttps(info.url);
  const name = String(info.assetName || '');
  if (!name || name === '.' || name === '..' || name.length > 180 || /[\\/:\x00-\x1f]/.test(name)) {
    throw new Error('安装包文件名无效');
  }

  let expected = info.sha256 ? String(info.sha256).toLowerCase() : null;
  if (!expected && info.checksumUrl) {
    assertHttps(info.checksumUrl);
    const text = await fetchText(info.checksumUrl, { net: options.net });
    expected = findChecksum(text, name);
  }
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('没有找到有效的安装包校验和，请前往发布页面手动下载');
  }

  const dir = options.dir || path.join(require('electron').app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, crypto.randomBytes(6).toString('hex') + '-' + name);
  const partial = dest + '.part';
  try {
    const { sha256 } = await downloadFile(info.url, partial, options.onProgress, options);
    if (expected !== sha256) throw new Error('安装包校验失败（sha256 不匹配）');
    fs.renameSync(partial, dest);
    return { filePath: dest, sha256, verified: true };
  } catch (error) {
    try { fs.unlinkSync(partial); } catch { /* 文件尚未创建或已经清理 */ }
    throw error;
  }
}

/** Windows 启动安装程序；macOS 和 Linux 需要用户完成平台对应的安装步骤。 */
async function installUpdate(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('安装包不存在，请重新下载');
  if (!/^[a-f0-9]{64}$/.test(String(options.expectedSha256 || ''))) throw new Error('缺少安装包校验信息，请重新下载');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  if (hash.digest('hex') !== options.expectedSha256) throw new Error('安装包在下载后发生变化，请重新下载');
  const targetShell = options.shell || require('electron').shell;
  const platform = options.platform || process.platform;
  if (platform === 'linux') {
    fs.chmodSync(filePath, 0o755);
    targetShell.showItemInFolder(filePath);
    return { mode: 'manual', message: '已打开安装包位置，请关闭应用后手动替换并运行 AppImage。' };
  }
  if (platform !== 'win32' && platform !== 'darwin') throw new Error('当前平台不支持自动安装，请手动安装');
  const error = await targetShell.openPath(filePath);
  if (error) throw new Error('无法启动安装程序：' + error);
  if (platform === 'darwin') {
    return { mode: 'manual', message: '已打开磁盘映像，请将 LongPost 拖入“应用程序”完成安装。' };
  }
  setTimeout(() => (options.app || require('electron').app).quit(), 800);
  return { mode: 'installer', message: '安装程序已启动。' };
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
