/**
 * 长文 -> 社交切片
 *
 * 场景：一篇几千字的长文写完了，发到 X / 即刻 / 小红书还得再手工改一遍，
 * 大多数人到这一步就放弃了。这里把「提炼 + 改写」交给模型，产出三样东西：
 *   1. 三个抓人的标题（长短不一，供不同平台挑）
 *   2. 一条 140 字以内的核心短帖
 *   3. 一组 5 条以内的 Thread 切片
 *
 * 渲染层是无打包器的原生 JS，file:// 下 ES module 不可用，
 * 所以这里用 CommonJS + 全局挂载（window.LPSocialSlice）的写法。
 */

'use strict';

/** 提示词里最多塞多少原文，避免超长文把上下文撑爆 */
const MAX_CONTENT_CHARS = 6000;

/**
 * 截取正文用于提示词。
 * 长文按「开头 + 结尾」拼，因为结论通常在后半段，只取开头会丢掉核心观点。
 */
function snippetForPrompt(content, maxChars) {
  const limit = typeof maxChars === 'number' ? maxChars : MAX_CONTENT_CHARS;
  const text = String(content || '').trim();
  if (text.length <= limit) return text;

  const headSize = Math.floor(limit * 0.6);
  const tailSize = limit - headSize - 20;
  const head = text.slice(0, headSize);
  const tail = text.slice(-tailSize);
  return head + '\n\n……（中间省略）……\n\n' + tail;
}

function buildSocialSliceMessages(title, content, options) {
  const body = snippetForPrompt(content, (options && options.maxChars) || MAX_CONTENT_CHARS);

  return [
    {
      role: 'system',
      content:
        '你是一名中文内容运营，擅长把长文拆成适配各平台的短帖文案。' +
        '严格按用户给定的标记输出，不要额外解释、不要用代码块包裹、不要改变标记本身。',
    },
    {
      role: 'user',
      content:
        '以下是一篇长文，请为它生成引流用的社交文案。\n\n' +
        '标题：' + (title || '（未命名）') + '\n\n' +
        '正文：\n' + body + '\n\n' +
        '请严格按下面的格式输出，标记保持原样：\n\n' +
        '【标题】\n' +
        '1. 一个信息密度高的标题\n' +
        '2. 一个带悬念的标题\n' +
        '3. 一个口语化、适合同城/兴趣社群的标题\n\n' +
        '【短帖】\n' +
        '一段 140 字以内的核心观点，可直接发 X / 即刻；不要带话题标签。\n\n' +
        '【Thread】\n' +
        '5 条以内的分段观点，每条一行，以 1/ 2/ 3/ 开头，每条不超过 100 字。',
    },
  ];
}

/** 去掉 markdown 代码块包裹与多余空白 */
function clean(text) {
  return String(text || '')
    .replace(/^\s*```[a-z]*\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * 解析模型输出。
 * 对格式保持宽容：标记可能被写成 【标题】/## 标题/[标题]，都能识别。
 */
function parseSocialSlice(raw) {
  const text = clean(raw);
  const result = { titles: [], post: '', thread: [], raw: text };

  function marker(name) {
    return new RegExp(
      '(?:^|\\n)\\s*(?:【' + name + '】|#{1,3}\\s*' + name + '|\\[' + name + '\\])\\s*\\n',
      'i',
    );
  }

  const titlesRe = marker('标题');
  const postRe = marker('短帖');
  const threadRe = marker('Thread');

  const tIdx = text.search(titlesRe);
  const pIdx = text.search(postRe);
  const thIdx = text.search(threadRe);

  if (tIdx >= 0 && pIdx > tIdx) {
    const block = text.slice(tIdx, pIdx).replace(titlesRe, '');
    result.titles = block
      .split(/\r?\n/)
      .map(function (line) {
        return line.replace(/^\s*(?:\d+[.、)]|[-*])\s*/, '').trim();
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  if (pIdx >= 0) {
    const end = thIdx > pIdx ? thIdx : text.length;
    result.post = text.slice(pIdx, end).replace(postRe, '').trim();
  }

  if (thIdx >= 0) {
    const block = text.slice(thIdx).replace(threadRe, '');
    result.thread = block
      .split(/\r?\n/)
      .map(function (line) {
        return line
          .trim()
          .replace(/^(?:\d+[./)、]|[-*])\s*/, '')
          .trim();
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  // 模型没按格式来时，至少把内容当成短帖，别让用户面对空白
  if (!result.post && !result.titles.length && !result.thread.length) {
    result.post = text;
  }

  return result;
}

const API = {
  MAX_CONTENT_CHARS: MAX_CONTENT_CHARS,
  snippetForPrompt: snippetForPrompt,
  buildSocialSliceMessages: buildSocialSliceMessages,
  parseSocialSlice: parseSocialSlice,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.LPSocialSlice = API;
