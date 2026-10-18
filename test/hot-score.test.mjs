import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产实现（服务端热门排序与前端游标过滤共用同一份逻辑）
import {
  computeHotScore,
  encodeHotCursor,
  parseHotCursor,
  filterByHotCursor,
} from '../server/common/utils/hot-score.ts';

describe('Hot Score & Keyset Cursor Pagination Suite', () => {
  it('should accurately compute weighted engagement score', () => {
    const post = {
      likeCount: 10,     // 10 * 3 = 30
      commentCount: 4,   // 4 * 5 = 20
      repostCount: 2,    // 2 * 4 = 8
      bookmarkCount: 5,  // 5 * 2 = 10
    };
    const score = computeHotScore(post);
    assert.equal(score, 68);
  });

  it('should treat missing or null counters as 0', () => {
    const minimal = { likeCount: 3 };
    assert.equal(computeHotScore(minimal), 9);
    assert.equal(computeHotScore({}), 0);
  });

  it('should encode and decode hot cursor without timezone or precision corruption', () => {
    const testDate = new Date('2026-10-13T09:30:00.123Z');
    const cursor = encodeHotCursor(120, testDate);
    assert.equal(cursor, 'hot:120:2026-10-13T09:30:00.123Z');

    const decoded = parseHotCursor(cursor);
    assert.ok(decoded);
    assert.equal(decoded.score, 120);
    assert.equal(decoded.date.toISOString(), '2026-10-13T09:30:00.123Z');
  });

  it('should gracefully return null for malformed cursors', () => {
    assert.equal(parseHotCursor(''), null);
    assert.equal(parseHotCursor('invalid-cursor'), null);
    assert.equal(parseHotCursor('hot:abc:invalid-date'), null);
    assert.equal(parseHotCursor('hot:120'), null);
  });

  it('should enforce strict monotonic pagination using compound keyset (score, createdAt)', () => {
    const d1 = new Date('2026-10-13T10:00:00Z');
    const d2 = new Date('2026-10-13T09:00:00Z');
    const d3 = new Date('2026-10-13T08:00:00Z');

    const items = [
      { id: '1', likeCount: 10, commentCount: 0, repostCount: 0, bookmarkCount: 0, createdAt: d1 }, // 30
      { id: '2', likeCount: 10, commentCount: 0, repostCount: 0, bookmarkCount: 0, createdAt: d2 }, // 30
      { id: '3', likeCount: 5, commentCount: 0, repostCount: 0, bookmarkCount: 0, createdAt: d3 },  // 15
    ];

    // 分页：以第一项为游标取后续内容
    const cursor = encodeHotCursor(computeHotScore(items[0]), items[0].createdAt);
    const nextPage = filterByHotCursor(items, cursor);

    assert.equal(nextPage.length, 2);
    assert.equal(nextPage[0].id, '2');
    assert.equal(nextPage[1].id, '3');
  });
});
