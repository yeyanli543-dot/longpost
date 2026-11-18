import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAppBasePath, resolveAppUrl } from '../client/src/lib/utils.ts';

describe('分享链接基路径', () => {
  it('保留同源部署目录，并兼容站点根目录和完整链接', () => {
    const oldWindow = globalThis.window;
    const oldDocument = globalThis.document;
    try {
      globalThis.window = { location: { origin: 'https://example.com' } };
      globalThis.document = { baseURI: 'https://example.com/workspace/' };
      assert.equal(getAppBasePath(), '/workspace');
      assert.equal(resolveAppUrl('/post/123'), 'https://example.com/workspace/post/123');
      assert.equal(resolveAppUrl('article/123'), 'https://example.com/workspace/article/123');
      assert.equal(resolveAppUrl('https://another.example/a'), 'https://another.example/a');
      globalThis.document.baseURI = 'https://example.com/';
      assert.equal(getAppBasePath(), '/');
      assert.equal(resolveAppUrl('/post/123'), 'https://example.com/post/123');
      globalThis.document.baseURI = 'https://another.example/workspace/';
      assert.equal(getAppBasePath(), '/');
    } finally {
      globalThis.window = oldWindow;
      globalThis.document = oldDocument;
    }
  });
});
