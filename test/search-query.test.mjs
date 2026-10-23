import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSearchQuery, matchConditions } = require('../desktop/lib/search-query.js');

describe('搜索语法：解析', () => {
  it('纯关键词', () => {
    const r = parseSearchQuery('长文 排版');
    assert.equal(r.text, '长文 排版');
    assert.deepEqual(r.tags, []);
    assert.equal(r.since, 0);
  });

  it('标签条件（可多个）', () => {
    const r = parseSearchQuery('标签:灵感 tag:待读');
    assert.deepEqual(r.tags, ['灵感', '待读']);
    assert.equal(r.text, '');
  });

  it('标签与关键词混用', () => {
    const r = parseSearchQuery('标签:灵感 写作');
    assert.deepEqual(r.tags, ['灵感']);
    assert.equal(r.text, '写作');
  });

  it('时间:今天 得到当天零点', () => {
    const r = parseSearchQuery('时间:今天');
    const d = new Date(r.since);
    assert.equal(d.getHours(), 0);
    assert.equal(d.getMinutes(), 0);
  });

  it('时间:yyyy-mm-dd', () => {
    const r = parseSearchQuery('时间:2026-10-01');
    assert.equal(new Date(r.since).getMonth(), 9);
  });

  it('无法识别的条件被忽略，不崩', () => {
    const r = parseSearchQuery('时间:火星 标签: 正文');
    assert.equal(r.since, 0);
    assert.equal(r.text, '正文');
  });
});

describe('搜索语法：匹配', () => {
  const now = Date.now();
  const article = { tags: ['灵感', '待读'], updatedAt: now };

  it('标签全都要满足', () => {
    assert.ok(matchConditions(article, parseSearchQuery('标签:灵感')));
    assert.ok(matchConditions(article, parseSearchQuery('标签:灵感 标签:待读')));
    assert.ok(!matchConditions(article, parseSearchQuery('标签:灵感 标签:其他')));
  });

  it('时间过滤按 updatedAt', () => {
    const old = { tags: [], updatedAt: new Date('2020-01-01').getTime() };
    assert.ok(matchConditions(article, parseSearchQuery('时间:本月')));
    assert.ok(!matchConditions(old, parseSearchQuery('时间:本月')));
  });

  it('没有条件时恒真', () => {
    assert.ok(matchConditions({}, parseSearchQuery('')));
  });
});