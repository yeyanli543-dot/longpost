import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const B = require('../desktop/lib/clip-bridge.js');

describe('剪藏桥：令牌', () => {
  it('生成 48 位十六进制字符串且每次不同', () => {
    const a = B.createToken(randomBytes);
    const b = B.createToken(randomBytes);
    assert.equal(a.length, 48);
    assert.match(a, /^[0-9a-f]+$/);
    assert.notEqual(a, b);
  });

  it('恒定时间比较：相同才通过', () => {
    const token = B.createToken(randomBytes);
    assert.equal(B.isValidToken(token, token), true);
    assert.equal(B.isValidToken(token, token.slice(0, -1) + 'x'), false);
    assert.equal(B.isValidToken('', ''), false, '空令牌永远不通过');
    assert.equal(B.isValidToken(null, token), false);
  });
});

describe('剪藏桥：地址校验', () => {
  it('只接受 http / https', () => {
    assert.equal(B.isHttpUrl('https://example.com/a'), true);
    assert.equal(B.isHttpUrl('http://localhost:3000'), true);
    assert.equal(B.isHttpUrl('file:///D:/x.html'), false);
    assert.equal(B.isHttpUrl('javascript:alert(1)'), false);
    assert.equal(B.isHttpUrl(''), false);
  });
});

describe('剪藏桥：请求规范化', () => {
  it('正常剪藏保留标题、链接与正文', () => {
    const r = B.normalizeClipPayload({
      title: '一篇文章',
      url: 'https://example.com/post',
      content: '正文内容',
    });
    assert.equal(r.ok, true);
    assert.equal(r.clip.title, '一篇文章');
    assert.equal(r.clip.content, '正文内容');
    assert.ok(r.clip.capturedAt);
  });

  it('没有标题时给兜底，不留空标题', () => {
    const r = B.normalizeClipPayload({ url: 'https://example.com', content: 'x' });
    assert.equal(r.clip.title, '未命名剪藏');
  });

  it('只有选区时用选区当正文', () => {
    const r = B.normalizeClipPayload({ title: 'T', url: 'https://a.com', selection: '选中的话' });
    assert.equal(r.clip.content, '选中的话');
  });

  it('非 http 地址被拒绝', () => {
    const r = B.normalizeClipPayload({ title: 'T', url: 'file:///etc/passwd', content: 'x' });
    assert.equal(r.ok, false);
    assert.match(r.error, /http/);
  });

  it('空请求被拒绝', () => {
    assert.equal(B.normalizeClipPayload(null).ok, false);
    assert.equal(B.normalizeClipPayload({}).ok, false);
  });

  it('超长正文被截断而不是拒绝', () => {
    const r = B.normalizeClipPayload({ title: 'T', url: 'https://a.com', content: 'x'.repeat(300000) });
    assert.equal(r.ok, true);
    assert.equal(r.clip.content.length, B.MAX_CONTENT);
  });
});

describe('剪藏桥：正文生成', () => {
  it('把来源放在最前面', () => {
    const md = B.buildClipMarkdown({ url: 'https://example.com/p', content: '正文' });
    assert.ok(md.startsWith('> 来源：<https://example.com/p>'));
    assert.ok(md.includes('正文'));
  });

  it('没有链接时不产生空的来源行', () => {
    const md = B.buildClipMarkdown({ url: '', content: '只有正文' });
    assert.ok(!md.includes('来源'));
    assert.equal(md, '只有正文');
  });
});
