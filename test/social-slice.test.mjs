import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 渲染层是无打包器的原生 JS，共享模块以 CommonJS 形式放在 desktop/lib/ 下
const {
  buildSocialSliceMessages,
  parseSocialSlice,
  snippetForPrompt,
  MAX_CONTENT_CHARS,
} = require('../desktop/lib/social-slice.js');

describe('长文转短帖：提示词', () => {
  it('包含标题与正文，并要求固定标记', () => {
    const msgs = buildSocialSliceMessages('我的长文', '正文内容');
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'system');
    assert.ok(msgs[1].content.includes('我的长文'));
    assert.ok(msgs[1].content.includes('正文内容'));
    assert.ok(msgs[1].content.includes('【标题】'));
    assert.ok(msgs[1].content.includes('【短帖】'));
    assert.ok(msgs[1].content.includes('【Thread】'));
  });

  it('标题为空时有兜底，不会产出 "标题：" 的空壳', () => {
    const msgs = buildSocialSliceMessages('', '正文');
    assert.ok(msgs[1].content.includes('（未命名）'));
  });

  it('超长正文按头尾截断，并标注省略', () => {
    const long = 'A'.repeat(MAX_CONTENT_CHARS) + 'B'.repeat(2000) + '结尾结论';
    const snippet = snippetForPrompt(long);
    assert.ok(snippet.length <= MAX_CONTENT_CHARS + 40, '实际 ' + snippet.length);
    assert.ok(snippet.includes('中间省略'));
    assert.ok(snippet.includes('结尾结论'), '结尾要保留，结论通常在后半段');
  });

  it('短正文原样保留，不做截断', () => {
    assert.equal(snippetForPrompt('  短正文  '), '短正文');
  });
});

describe('长文转短帖：结果解析', () => {
  const raw = [
    '【标题】',
    '1. 为什么你的长文没人看',
    '2. 写了三年，我才明白这件事',
    '3. 长文没人看，问题可能不在内容',
    '',
    '【短帖】',
    '大部分人放弃写作，不是因为写得不好，而是因为写完没人看。',
    '',
    '【Thread】',
    '1/ 写了没人看，是产品问题不是内容问题。',
    '2/ 分发链路缺一环，等于白发。',
    '3/ 先把标题练好。',
  ].join('\n');

  it('三段都能正确切分', () => {
    const r = parseSocialSlice(raw);
    assert.equal(r.titles.length, 3);
    assert.equal(r.titles[0], '为什么你的长文没人看');
    assert.ok(r.post.startsWith('大部分人放弃写作'));
    assert.equal(r.thread.length, 3);
    assert.equal(r.thread[0], '写了没人看，是产品问题不是内容问题。');
  });

  it('兼容 markdown 标题与方括号写法', () => {
    const alt = '## 标题\n1. 甲\n\n## 短帖\n乙\n\n## Thread\n1/ 丙';
    const r = parseSocialSlice(alt);
    assert.deepEqual(r.titles, ['甲']);
    assert.equal(r.post, '乙');
    assert.deepEqual(r.thread, ['丙']);
  });

  it('剥掉模型误加的代码块包裹', () => {
    const r = parseSocialSlice('\`\`\`markdown\n【短帖】\n内容\n\`\`\`');
    assert.equal(r.post, '内容');
  });

  it('模型完全不听格式时，至少把原文当短帖返回', () => {
    const r = parseSocialSlice('就是一段普通文字');
    assert.equal(r.post, '就是一段普通文字');
    assert.equal(r.titles.length, 0);
  });
});
