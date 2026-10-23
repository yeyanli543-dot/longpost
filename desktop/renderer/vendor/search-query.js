/**
 * 搜索语法解析（纯函数，桌面/手机共用，可单测）。
 *
 *   标签:灵感 时间:本周 关键词
 *
 * 时间支持：今天 / 本周 / 本月 / 今年 / YYYY-MM-DD
 * 多个「标签:」之间是「并且」关系。
 */
(function (root) {
  'use strict';

  function startOf(range, now) {
    const d = now || new Date();
    if (range === '今天' || range === 'today') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (range === '本周' || range === 'week') {
      const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      return monday.getTime();
    }
    if (range === '本月' || range === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    if (range === '今年' || range === 'year') return new Date(d.getFullYear(), 0, 1).getTime();
    if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
      const t = new Date(range + 'T00:00:00').getTime();
      return Number.isNaN(t) ? 0 : t;
    }
    return 0;
  }

  function parseSearchQuery(raw) {
    const text = String(raw == null ? '' : raw).trim();
    const tags = [];
    const words = [];
    let since = 0;

    for (const token of text.split(/\s+/)) {
      if (!token) continue;

      const tag = token.match(/^(?:标签|tag):(.+)$/i);
      if (tag) {
        tags.push(tag[1].toLowerCase());
        continue;
      }

      const time = token.match(/^(?:时间|time):(.+)$/i);
      if (time) {
        const value = startOf(time[1], new Date());
        if (value) since = value;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(time[1])) since = new Date(time[1] + 'T00:00:00').getTime();
        continue;
      }

      // 写了「标签:」却没给值：当作没写，不要变成关键词
      if (/^(标签|tag|时间|time):/i.test(token)) continue;

      words.push(token);
    }

    return { text: words.join(' ').toLowerCase(), tags: tags, since: since };
  }

  /** 一条文章是否满足标签与时间条件 */
  function matchConditions(article, parsed) {
    const a = article || {};
    if (parsed.tags && parsed.tags.length) {
      const tags = (a.tags || []).map((t) => String(t).toLowerCase());
      for (const tag of parsed.tags) if (tags.indexOf(tag) === -1) return false;
    }
    if (parsed.since) {
      const when = a.updatedAt || a.createdAt || 0;
      if (when < parsed.since) return false;
    }
    return true;
  }

  const api = { parseSearchQuery: parseSearchQuery, matchConditions: matchConditions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LPQuery = api;
})(typeof window !== 'undefined' ? window : globalThis);
