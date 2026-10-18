import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmail,
  isValidEmail,
  generateToken,
  escapeHtml,
  buildConfirmEmail,
  buildArticleIssueEmail,
  buildStatusPage,
} from '../server/common/utils/newsletter.ts';

describe('Newsletter：邮箱规范化与校验', () => {
  it('统一小写并去掉空白', () => {
    assert.equal(normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
  });

  it('接受常见写法，包括 + 别名', () => {
    for (const ok of ['a@b.co', 'first.last@sub.example.com', 'me+news@example.com', 'x_y-z@example.io']) {
      assert.equal(isValidEmail(ok), true, ok);
    }
  });

  it('拒绝明显不合法或容易打错的结构', () => {
    for (const bad of ['', 'plain', 'a@', '@b.com', 'a b@c.com', 'a..b@c.com', 'a@b', 'a@b..com', 'a@-b.com']) {
      assert.equal(isValidEmail(bad), false, bad);
    }
  });

  it('超长地址直接拒绝', () => {
    const long = 'a'.repeat(65) + '@example.com';
    assert.equal(isValidEmail(long), false);
  });
});

describe('Newsletter：令牌', () => {
  it('每次都不一样，且长度稳定', () => {
    const a = generateToken();
    const b = generateToken();
    assert.notEqual(a, b);
    assert.equal(a.length, 48);
    assert.match(a, /^[0-9a-f]+$/);
  });
});

describe('Newsletter：HTML 转义', () => {
  it('把标签与引号转掉，防止标题注入', () => {
    assert.equal(escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
    assert.equal(escapeHtml('"a" & \'b\''), '&quot;a&quot; &amp; &#39;b&#39;');
  });
});

describe('Newsletter：确认信', () => {
  const mail = buildConfirmEmail({
    siteName: 'LongPost',
    email: 'reader@example.com',
    confirmUrl: 'https://blog.example.com/api/newsletter/confirm?token=abc',
  });

  it('主题里带站点名', () => {
    assert.ok(mail.subject.includes('LongPost'));
  });

  it('纯文本版包含可点击的完整链接（给不支持 HTML 的客户端）', () => {
    assert.ok(mail.text.includes('https://blog.example.com/api/newsletter/confirm?token=abc'));
  });

  it('HTML 版把链接塞进 a 标签，且没有外部图片依赖', () => {
    assert.ok(mail.html.includes('href="https://blog.example.com/api/newsletter/confirm?token=abc"'));
    assert.ok(!/<img\s/i.test(mail.html));
  });

  it('明确写了"不是本人操作就忽略"，降低被恶意订阅的困扰', () => {
    assert.ok(mail.text.includes('忽略'));
    assert.ok(mail.html.includes('忽略'));
  });
});

describe('Newsletter：新文章推送', () => {
  const mail = buildArticleIssueEmail({
    siteName: 'LongPost',
    title: '写了三年长文，我才明白没人看的真正原因',
    summary: '内容是产品，分发也是产品。',
    url: 'https://blog.example.com/p/abc12345',
    authorName: 'Alex',
    unsubscribeUrl: 'https://blog.example.com/api/newsletter/unsubscribe?token=t1',
  });

  it('标题进主题，且不会被 HTML 注入', () => {
    assert.ok(mail.subject.includes('三年长文'));
    const evil = buildArticleIssueEmail({
      siteName: 'S',
      title: '<script>alert(1)</script>',
      summary: '',
      url: 'https://x/y',
      unsubscribeUrl: 'https://x/unsub',
    });
    assert.ok(!evil.html.includes('<script>'));
    assert.ok(evil.html.includes('&lt;script&gt;'));
  });

  it('正文里同时有阅读链接和退订链接', () => {
    assert.ok(mail.html.includes('https://blog.example.com/p/abc12345'));
    assert.ok(mail.html.includes('https://blog.example.com/api/newsletter/unsubscribe?token=t1'));
    assert.ok(mail.text.includes('退订'));
  });

  it('没有摘要时不渲染空的摘要段落', () => {
    const noSummary = buildArticleIssueEmail({
      siteName: 'S',
      title: 'T',
      summary: '',
      url: 'https://x/y',
      unsubscribeUrl: 'https://x/unsub',
    });
    assert.ok(!noSummary.html.includes('<p style="margin:0 0 24px;font-size:15px;color:#3d444d;"></p>'));
  });
});

describe('Newsletter：状态页', () => {
  it('包含标题与说明，且转义用户可控内容', () => {
    const page = buildStatusPage({ title: '订阅成功', message: '感谢 <你>' });
    assert.ok(page.includes('订阅成功'));
    assert.ok(page.includes('&lt;你&gt;'));
    assert.ok(page.startsWith('<!doctype html>'));
  });
});
