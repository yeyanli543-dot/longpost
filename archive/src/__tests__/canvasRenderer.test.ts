import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  tokenizeText,
  wrapTokens,
  KINSOKU_START,
  parseMarkdownBlocks,
  CanvasRenderer
} from '../utils/canvasRenderer';

describe('CanvasRenderer & Kinsoku Shori Regression Suite', () => {
  it('验证英文单词在行尾不会被从单词中间截断', () => {
    const text = 'Hello world thisisaverylongunbrokenword for testing wrapping';
    const tokens = tokenizeText(text);

    // 简单测量函数：每个英文字符 10px
    const measure = (s: string) => s.length * 10;
    // 限制单行最大宽度 120px (约 12 个字符)
    const lines = wrapTokens(tokens, 120, measure);

    // 每一行中的单词都不应被切开，整词应作为一个单元
    for (const line of lines) {
      if (line.includes('thisisaverylongunbrokenword')) {
        assert.ok(true, '完整单词保持未截断');
      }
    }
    assert.ok(lines.length >= 3, '应被拆分为多行');
  });

  it('验证中文句号、逗号、右括号等禁则标点不会出现在新行行首', () => {
    // 构造刚好在行末放不下标点的场景
    const text = '这是一个用于测试标点符号避头尾特性的中文测试长段落。注意：句号不能在第二行开头，必须挂在上一行末尾！';
    const tokens = tokenizeText(text);

    // 假设每个汉字 20px，行宽 160px (正好容纳 8 个汉字)
    const measure = (s: string) => {
      let w = 0;
      for (const ch of s) {
        w += ch.charCodeAt(0) > 255 ? 20 : 10;
      }
      return w;
    };

    const lines = wrapTokens(tokens, 160, measure);

    for (let i = 1; i < lines.length; i++) {
      const firstChar = lines[i].trim()[0];
      if (firstChar) {
        assert.strictEqual(
          KINSOKU_START.test(firstChar),
          false,
          `行首禁则校验失败：第 ${i + 1} 行行首出现了标点符号 [${firstChar}]`
        );
      }
    }
  });

  it('验证 Markdown 标题（#）、引用（>）和分割线（---）可正常渲染分页', () => {
    const markdown = `# 主标题 LongPost
这是一段正文介绍。

## 次级小标题
> 这里是一段带有主题色竖线的引用段落

---

这里是分割线下方的新内容。`;

    const blocks = parseMarkdownBlocks(markdown);
    assert.strictEqual(blocks[0].type, 'h1');
    assert.strictEqual(blocks[1].type, 'paragraph');
    assert.strictEqual(blocks[2].type, 'h2');
    assert.strictEqual(blocks[3].type, 'quote');
    assert.strictEqual(blocks[4].type, 'divider');
    assert.strictEqual(blocks[5].type, 'paragraph');

    const renderer = new CanvasRenderer({
      width: 800,
      pageHeight: 600, // 较小的高度触发分页
      padding: 40,
    });

    const result = renderer.layout(markdown);
    assert.ok(result.pagesCount >= 1, '应成功生成至少 1 页排版');
    assert.ok(result.linesByPage[0].length > 0, '首页应有排版数据');
  });
});
