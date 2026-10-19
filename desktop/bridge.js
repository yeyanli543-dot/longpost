/**
 * Chrome 剪藏本地桥（HTTP 服务）。
 *
 * 只监听 127.0.0.1，端口随机；每个请求都必须带 X-LongPost-Token。
 * 之所以不用自定义协议：书签小工具与扩展都能直接发 POST，
 * 而协议跳转拿不到返回结果，用户不知道成没成。
 *
 * 安全约束（对应 AGENTS.md 的出站/入站约定）：
 *   - 绑回环地址，外部机器连不上；
 *   - 令牌恒定时间比较；
 *   - CORS 只放行 POST/OPTIONS + 令牌头；不用凭据；
 *   - 60 秒内超过 40 次请求直接 429。
 */

'use strict';

const http = require('node:http');
const { isValidToken, normalizeClipPayload, buildClipMarkdown, createToken } = require('./lib/clip-bridge');
const { randomBytes } = require('node:crypto');

const MAX_BODY = 512 * 1024;
const WINDOW_MS = 60000;
const MAX_REQUESTS = 40;

function corsHeaders(extraPrivateNetwork) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LongPost-Token',
    'Access-Control-Max-Age': '600',
  };

  // Chrome 的 Private Network Access：https 页面要访问 127.0.0.1，
  // 预检会带 Access-Control-Request-Private-Network，必须回允许头，
  // 否则请求在预检阶段就被拒 —— 书签小工具会"点了没反应"。
  if (extraPrivateNetwork) {
    headers['Access-Control-Allow-Private-Network'] = 'true';
  }
  return headers;
}

/**
 * @param {{ token?: string, onClip: (clip) => Promise<void>|void }} options
 * @returns {Promise<{port:number, token:string, close:()=>Promise<void>}>}
 */
function startBridge(options) {
  const token = (options && options.token) || createToken(randomBytes);
  const onClip = (options && options.onClip) || (() => {});
  const onLog = (options && options.onLog) || (() => {});

  /** 最近剪藏摘要，供扩展弹窗展示 */
  const recent = [];

  /** 最近请求记录，供设置页展示（最多 20 条） */
  const log = [];
  function record(entry) {
    log.push(Object.assign({ at: new Date().toISOString() }, entry));
    if (log.length > 20) log.shift();
    try {
      onLog(entry);
    } catch {
      /* 日志回调出错不影响主流程 */
    }
  }
  function getLog() {
    return log.slice();
  }

  let windowStart = Date.now();
  let count = 0;

  const server = http.createServer((req, res) => {
    const wantsPrivate =
      String(req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true';

    const reply = (status, body) => {
      record({ method: req.method, url: req.url, status });
      res.writeHead(
        status,
        Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(wantsPrivate)),
      );
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      record({ method: 'OPTIONS', url: req.url, status: 204 });
      res.writeHead(204, corsHeaders(wantsPrivate));
      res.end();
      return;
    }

    // 最近剪藏：给扩展弹窗展示用，同样要令牌
    if (req.method === 'GET' && (req.url || '').split('?')[0] === '/recent') {
      if (!isValidToken(req.headers['x-longpost-token'], token)) {
        reply(401, { ok: false, error: '令牌无效' });
        return;
      }
      reply(200, { ok: true, items: recent.slice(-5).reverse() });
      return;
    }

    if (req.method !== 'POST' || (req.url || '').split('?')[0] !== '/clip') {
      reply(404, { ok: false, error: 'not found' });
      return;
    }

    // 限流：按 60 秒滑窗
    const now = Date.now();
    if (now - windowStart > WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > MAX_REQUESTS) {
      reply(429, { ok: false, error: '请求过于频繁' });
      return;
    }

    if (!isValidToken(req.headers['x-longpost-token'], token)) {
      reply(401, { ok: false, error: '令牌无效' });
      return;
    }

    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reply(413, { ok: false, error: '内容太大' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        reply(400, { ok: false, error: '请求体不是合法 JSON' });
        return;
      }

      const normalized = normalizeClipPayload(body);
      if (!normalized.ok) {
        reply(400, { ok: false, error: normalized.error });
        return;
      }

      try {
        recent.push({
          title: normalized.clip.title,
          url: normalized.clip.url,
          tags: normalized.clip.tags,
          // 带正文：外部应用（Obsidian 插件）要拿它直接建笔记
          content: String(buildClipMarkdown(normalized.clip)).slice(0, 20000),
          at: new Date().toISOString(),
        });
        if (recent.length > 20) recent.shift();

        await onClip({
          title: normalized.clip.title,
          content: buildClipMarkdown(normalized.clip),
          tags: normalized.clip.tags,
          sourceUrl: normalized.clip.url,
          capturedAt: normalized.clip.capturedAt,
        });
        reply(200, { ok: true });
      } catch (error) {
        reply(500, { ok: false, error: String((error && error.message) || error) });
      }
    });
  });

  return new Promise((resolve, reject) => {
    // listen(0) 让系统挑空闲端口；万一撞上也不放弃，最多试 3 次
    let attempts = 0;
    const tryListen = () => {
      attempts += 1;
      const onError = (error) => {
        if (error && error.code === 'EADDRINUSE' && attempts < 3) {
          setTimeout(tryListen, 80);
          return;
        }
        reject(error);
      };
      server.once('error', onError);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', onError);
        const address = server.address();
        record({ method: 'LISTEN', url: '127.0.0.1:' + address.port, status: 0 });
        resolve({
          port: address.port,
          token: token,
          getLog: getLog,
          close: () =>
            new Promise((done) => {
              record({ method: 'CLOSE', url: '', status: 0 });
              server.close(() => done());
            }),
        });
      });
    };
    tryListen();
  });
}

module.exports = { startBridge };
