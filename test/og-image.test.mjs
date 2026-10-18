import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOgSvg,
  wrapTitle,
  escapeXml,
  OG_WIDTH,
  OG_HEIGHT,
  DEFAULT_FONT_STACK,
} from '../server/common/utils/og-image.ts';

describe('OG 分享图：标题折行', () => {
  it('短标题不折行', () => {
    assert.deepEqual(wrapTitle('短标题', 17, 3), ['短标题']);
  });

  it('长标题按字符宽度折行', () => {
    const lines = wrapTitle('写了三年长文我才明白没人看的真正原因到底是什么', 10, 3);
    assert.ok(lines.length <= 3);
    for (const line of lines.slice(0, -1)) {
      assert.ok([...line].length <= 10, '超宽: ' + line);
    }
  });

  it('英文按 0.55 宽度计，一行能装更多字符', () => {
    const en = wrapTitle('a'.repeat(40), 10, 3);
    assert.equal(en.length, 3);
    // 每行约 18 个 ASCII 字符
    assert.ok([...en[0]].length >= 15);
  });

  it('超过最大行数时最后一行补省略号', () => {
    const lines = wrapTitle('一'.repeat(80), 10, 3);
    assert.equal(lines.length, 3);
    assert.ok(lines[2].endsWith('…'));
  });

  it('空标题返回空数组，不产生空行', () => {
    assert.deepEqual(wrapTitle('   '), []);
  });
});

describe('OG 分享图：SVG 生成', () => {
  it('尺寸与 viewBox 一致', () => {
    const svg = buildOgSvg({ title: '标题' });
    assert.ok(svg.includes('width="' + OG_WIDTH + '"'));
    assert.ok(svg.includes('height="' + OG_HEIGHT + '"'));
    assert.ok(svg.includes('viewBox="0 0 ' + OG_WIDTH + ' ' + OG_HEIGHT + '"'));
  });

  it('标题里的尖括号不会破坏 XML', () => {
    const svg = buildOgSvg({ title: '<script>alert(1)</script>' });
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
  });

  it('作者与日期合并成一行元信息', () => {
    const svg = buildOgSvg({ title: 'T', authorName: 'Alex', date: '2026-10-18' });
    assert.ok(svg.includes('Alex · 2026-10-18'));
  });

  it('没有作者和日期时不留空文本节点', () => {
    const svg = buildOgSvg({ title: 'T' });
    assert.ok(!svg.includes('fill="#8b95a6"'));
  });

  it('用了自定义字体栈', () => {
    const old = process.env.OG_FONT;
    process.env.OG_FONT = 'My Font';
    const svg = buildOgSvg({ title: 'T' });
    assert.ok(svg.includes('My Font'));
    if (old === undefined) delete process.env.OG_FONT;
    else process.env.OG_FONT = old;
  });
});

describe('OG 分享图：转义', () => {
  it('五个 XML 特殊字符全覆盖', () => {
    const raw = '&<>"' + String.fromCharCode(39);
    assert.equal(escapeXml(raw), '&amp;&lt;&gt;&quot;&apos;');
  });

  it('默认字体栈包含中文字体', () => {
    assert.ok(DEFAULT_FONT_STACK.includes('Noto Sans CJK SC'));
  });
});
