/**
 * Chrome 剪藏本地桥的纯逻辑。
 *
 * 浏览器扩展 / 书签小工具通过 http://127.0.0.1:<port>/clip 把网页内容
 * 送进 LongPost。这里只做「判断与转换」，不碰网络和文件，方便单测。
 *
 * 三条安全底线：
 *   1. 必须带令牌 —— 网页也能向 localhost 发 POST，没有令牌就是任意网站
 *      都能往你的文章库里写东西；
 *   2. 一律限长 —— 避免一次塞进来一兆的正文把界面卡死；
 *   3. 只接受 http(s) 来源地址 —— file:// 与 javascript: 直接判无效。
 */

'use strict';

(function () {
  const MAX_TITLE = 200;
  const MAX_CONTENT = 200 * 1024;
  const MAX_URL = 2048;

  /** 令牌：32 字节随机十六进制 */
  function createToken(randomBytes) {
    const bytes = randomBytes(24);
    return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /** 恒定时间比较，避免用响应时间猜令牌 */
  function safeEqual(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    if (x.length !== y.length || x.length === 0) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
  }

  function isValidToken(provided, expected) {
    return safeEqual(provided, expected);
  }

  /** 只允许 http / https 的页面地址 */
  function isHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function trimTo(value, max) {
    const text = String(value == null ? '' : value);
    return text.length > max ? text.slice(0, max) : text;
  }

  /**
   * 规范化剪藏请求。
   * 返回 { ok, error?, clip? }，绝不抛异常 —— 这是网络入口。
   */
  function normalizeClipPayload(body) {
    if (!body || typeof body !== 'object') return { ok: false, error: '请求体不是对象' };

    const url = trimTo(body.url, MAX_URL).trim();
    if (url && !isHttpUrl(url)) return { ok: false, error: '只接受 http(s) 页面地址' };

    const title = trimTo(body.title, MAX_TITLE).trim() || '未命名剪藏';
    let content = trimTo(body.content, MAX_CONTENT).trim();

    if (!content && !url) return { ok: false, error: '既没有正文也没有链接' };

    // 书签小工具可能只给选区，正文为空时用选区兜底
    const selection = trimTo(body.selection, MAX_CONTENT).trim();
    if (!content) content = selection;

    return {
      ok: true,
      clip: {
        title: title,
        url: url || '',
        content: content,
        selection: selection,
        tags: normalizeTags(body.tags),
        capturedAt: body.capturedAt ? trimTo(body.capturedAt, 40) : new Date().toISOString(),
      },
    };
  }

  /** 标签：数组或逗号分隔，去重、限长、最多 8 个 */
  function normalizeTags(value) {
    var list = Array.isArray(value) ? value : String(value || '').split(/[,，\s]+/);
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var tag = String(list[i] || '').replace(/^#/, '').trim();
      if (!tag || tag.length > 20) continue;
      if (out.indexOf(tag) < 0) out.push(tag);
      if (out.length >= 8) break;
    }
    return out;
  }

  /**
   * 生成写入文章库的正文。
   * 来源信息放最前面：作者以后回看时，第一眼要知道这段字从哪来。
   */
  function buildClipMarkdown(clip) {
    const parts = [];
    if (clip.url) {
      parts.push('> 来源：<' + clip.url + '>');
      parts.push('');
    }
    if (clip.content) parts.push(clip.content);
    return parts.join('\n').trim();
  }

  const API = {
    MAX_TITLE: MAX_TITLE,
    MAX_CONTENT: MAX_CONTENT,
    createToken: createToken,
    safeEqual: safeEqual,
    isValidToken: isValidToken,
    isHttpUrl: isHttpUrl,
    normalizeTags: normalizeTags,
    normalizeClipPayload: normalizeClipPayload,
    buildClipMarkdown: buildClipMarkdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.LPClipBridge = API;
})();
