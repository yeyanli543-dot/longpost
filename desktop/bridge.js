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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LongPost-Token',
    'Access-Control-Max-Age': '600',
  };
}

/**
 * @param {{ token?: string, onClip: (clip) => Promise<void>|void }} options
 * @returns {Promise<{port:number, token:string, close:()=>Promise<void>}>}
 */
function startBridge(options) {
  const token = (options && options.token) || createToken(randomBytes);
  const onClip = (options && options.onClip) || (() => {});

  let windowStart = Date.now();
  let count = 0;

  const server = http.createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders()));
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
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
        await onClip({
          title: normalized.clip.title,
          content: buildClipMarkdown(normalized.clip),
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
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: address.port,
        token: token,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

module.exports = { startBridge };
