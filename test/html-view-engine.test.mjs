import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import express from 'express';

import { htmlViewEngine, serializePlatformData } from '../server/common/utils/html-view-engine.ts';
import { buildArticleHtml } from '../server/common/utils/article-template.ts';
import { clientBaseHref } from '../server/config/client.config.ts';

const render = (file, data) => new Promise((resolve, reject) => {
  htmlViewEngine(file, data, (error, result) => error ? reject(error) : resolve(result));
});

function platformFromHtml(html) {
  const script = html.match(/<script>\s*try\s*\{[\s\S]*?<\/script>/i);
  assert.ok(script, '缺少平台数据脚本');
  const code = script[0].replace(/^<script>/i, '').replace(/<\/script>$/i, '');
  const context = { window: {}, console };
  vm.runInNewContext(code, context);
  return context.window.__platform__;
}

describe('Web 视图模板与内嵌数据', () => {
  it('深层链接使用安全的站点资源根路径', async () => {
    assert.equal(clientBaseHref(''), '/');
    assert.equal(clientBaseHref('/app/example/'), '/app/example/');
    assert.equal(clientBaseHref('//other.example'), '/');
    assert.equal(clientBaseHref('/app\\other'), '/');
    const html = await render(path.resolve('client/index.html'), { assetBase: clientBaseHref('/app/example') });
    assert.match(html, /<base id="longpost-base" href="\/app\/example\/">/);
    const defaultHtml = await render(path.resolve('client/index.html'), {});
    assert.match(defaultHtml, /<base id="longpost-base" href="\/">/);
    const escapedHtml = await render(path.resolve('client/index.html'), { assetBase: '/x" onload="bad' });
    assert.ok(!escapedHtml.includes('href="/x" onload="bad"'));
  });

  it('SPA 模板保留 OG 转义，并正确还原含特殊字符的平台数据', async () => {
    const value = { text: "引号'、反斜杠\\、</script><script>bad()</script>", line: 'a\u2028b' };
    const html = await render(path.resolve('client/index.html'), {
      ogTitle: '<script>alert("x")</script>',
      ogDescription: '描述',
      __platform__: serializePlatformData(value),
    });
    assert.match(html, /&lt;script&gt;alert/);
    assert.ok(!html.includes('</script><script>bad()'));
    assert.equal(JSON.stringify(platformFromHtml(html)), JSON.stringify(value));
  });

  it('文章分享页内嵌数据也不能提前结束 script', () => {
    const value = { text: "</script><script>bad()</script>'\\" };
    const html = buildArticleHtml({
      siteName: 'LongPost', platformJson: serializePlatformData(value), title: '标题', excerpt: '',
      coverUrl: '', fullUrl: 'https://example.com/p/1', authorName: '作者', publishedAt: '',
      bodyHtml: '', assetBasePath: '', hasCharts: false, images: [], attachments: [],
      readCount: 0, commentCount: 0, likeCount: 0, bookmarkCount: 0,
    });
    assert.ok(!html.includes('</script><script>bad()'));
    assert.equal(JSON.stringify(platformFromHtml(html)), JSON.stringify(value));
  });

  it('调用方提供的 layout 和 settings 不能触发额外文件读取', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'longpost-view-'));
    try {
      const template = path.join(dir, 'index.html');
      fs.writeFileSync(template, 'Hello {{ogTitle}}');
      fs.writeFileSync(path.join(dir, 'private.html'), 'SHOULD NOT BE READ');
      const html = await render(template, { ogTitle: '<safe>', layout: 'private', settings: { views: dir } });
      assert.equal(html, 'Hello &lt;safe&gt;');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Express 能通过视图引擎实际返回 SPA 首页', async () => {
    const app = express();
    app.engine('html', htmlViewEngine);
    app.set('view engine', 'html');
    app.set('views', path.resolve('client'));
    app.get('/', (_req, res) => res.render('index', {
      ogTitle: '真实首页', ogDescription: '介绍', __platform__: serializePlatformData({ ok: true }),
    }));
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/');
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /<title>真实首页<\/title>/);
      assert.equal(platformFromHtml(html).ok, true);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
