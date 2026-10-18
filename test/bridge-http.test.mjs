import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startBridge } = require('../desktop/bridge.js');

async function withBridge(fn) {
  const clips = [];
  const bridge = await startBridge({ onClip: (c) => clips.push(c) });
  try {
    return await fn(bridge, clips);
  } finally {
    await bridge.close();
  }
}

describe('剪藏桥：HTTP 协议', () => {
  it('预检放行 Private Network（否则 https 页面访问不到 127.0.0.1）', async () => {
    await withBridge(async (bridge) => {
      const res = await fetch('http://127.0.0.1:' + bridge.port + '/clip', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Private-Network': 'true',
        },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-private-network'), 'true');
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
      assert.match(res.headers.get('access-control-allow-headers'), /x-longpost-token/i);
    });
  });

  it('非预检请求不带 Private Network 头，但照常放行', async () => {
    await withBridge(async (bridge) => {
      const res = await fetch('http://127.0.0.1:' + bridge.port + '/clip', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST' },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-private-network'), null);
    });
  });

  it('令牌错误一律 401，且不写入任何内容', async () => {
    await withBridge(async (bridge, clips) => {
      const res = await fetch('http://127.0.0.1:' + bridge.port + '/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LongPost-Token': 'nope' },
        body: JSON.stringify({ title: 'T', url: 'https://a.com', content: 'x' }),
      });
      assert.equal(res.status, 401);
      assert.equal(clips.length, 0);
    });
  });

  it('合法请求写入一条，并带上来源', async () => {
    await withBridge(async (bridge, clips) => {
      const res = await fetch('http://127.0.0.1:' + bridge.port + '/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LongPost-Token': bridge.token },
        body: JSON.stringify({ title: '标题', url: 'https://a.com/p', content: '正文' }),
      });
      assert.equal(res.status, 200);
      assert.equal(clips.length, 1);
      assert.ok(clips[0].content.includes('https://a.com/p'));
    });
  });

  it('未知路径返回 404', async () => {
    await withBridge(async (bridge) => {
      const res = await fetch('http://127.0.0.1:' + bridge.port + '/other', { method: 'POST' });
      assert.equal(res.status, 404);
    });
  });
});
