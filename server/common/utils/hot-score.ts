/**
 * 热门时间线（Hot Timeline）加权得分与复合游标
 *
 * 权重设计：评论 > 转发 > 点赞 > 收藏，对应"讨论价值 > 传播广度 > 轻量认同 > 稍后回看"。
 * 复合游标 `hot:<score>:<ISO 时间>` 保证同分内容仍按时间严格单调，
 * 翻页不会因为分数相同而重复或漏项（keyset pagination）。
 */

export interface HotScoreCounters {
  likeCount?: number | null;
  commentCount?: number | null;
  repostCount?: number | null;
  bookmarkCount?: number | null;
}

/** 计算加权热度分 */
export function computeHotScore(input: HotScoreCounters | null | undefined): number {
  if (!input) return 0;
  return (
    (input.likeCount ?? 0) * 3 +
    (input.commentCount ?? 0) * 5 +
    (input.repostCount ?? 0) * 4 +
    (input.bookmarkCount ?? 0) * 2
  );
}

/** 生成复合游标 */
export function encodeHotCursor(score: number, date: Date): string {
  return `hot:${score}:${date.toISOString()}`;
}

/** 解析复合游标，格式非法一律返回 null（由调用方降级为首页） */
export function parseHotCursor(cursor: string | null | undefined): { score: number; date: Date } | null {
  if (!cursor || !cursor.startsWith('hot:')) return null;
  const parts = cursor.split(':');
  const score = Number(parts[1]);
  const isoStr = parts.slice(2).join(':');
  if (Number.isNaN(score) || !isoStr) return null;
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return null;
  return { score, date };
}

/**
 * 按游标过滤出"排在游标之后"的条目。
 * 规则：分数更低，或分数相同但时间更早。
 */
export function filterByHotCursor<
  T extends HotScoreCounters & { createdAt: Date },
>(items: T[], cursor: string | null | undefined): T[] {
  const parsed = parseHotCursor(cursor);
  if (!parsed) return items;
  return items.filter((item) => {
    const itemScore = computeHotScore(item);
    if (itemScore < parsed.score) return true;
    if (itemScore === parsed.score && item.createdAt.getTime() < parsed.date.getTime()) return true;
    return false;
  });
}
