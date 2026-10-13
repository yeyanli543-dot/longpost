import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 热门时间线加权得分算法与复合游标拆解逻辑 (posts.hot-score)
 */
export function computeHotScore(data: {
  likeCount?: number | null;
  commentCount?: number | null;
  repostCount?: number | null;
  bookmarkCount?: number | null;
}): number {
  return (
    (data.likeCount ?? 0) * 3 +
    (data.commentCount ?? 0) * 5 +
    (data.repostCount ?? 0) * 4 +
    (data.bookmarkCount ?? 0) * 2
  );
}

export function encodeHotCursor(score: number, date: Date): string {
  return `hot:${score}:${date.toISOString()}`;
}

export function parseHotCursor(cursor?: string | null): { score: number; date: Date } | null {
  if (!cursor || !cursor.startsWith('hot:')) return null;
  const parts = cursor.split(':');
  const score = Number(parts[1]);
  const isoStr = parts.slice(2).join(':');
  if (isNaN(score) || !isoStr) return null;
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return null;
  return { score, date };
}

describe('Hot Score & Cursor Pagination Specification', () => {
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
    assert.equal(decoded?.score, 120);
    assert.equal(decoded?.date.toISOString(), '2026-10-13T09:30:00.123Z');
  });

  it('should gracefully return null for malformed cursors', () => {
    assert.equal(parseHotCursor(''), null);
    assert.equal(parseHotCursor('invalid-cursor'), null);
    assert.equal(parseHotCursor('hot:abc:invalid-date'), null);
    assert.equal(parseHotCursor('hot:120'), null);
  });
});
