import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 盘古之白中英文智能排版算法（与 WritingLab.tsx 保持完全一致）
 */
function panguFormat(text) {
  const placeholders = [];
  const stash = (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\u0000PANGU_PH_${idx}\u0000`;
  };

  let result = text;
  // 1. 保护多行代码块 ```...```
  result = result.replace(/```[\s\S]*?```/g, stash);
  // 2. 保护行内代码 `...`
  result = result.replace(/`[^`\n]+`/g, stash);
  // 3. 保护 Markdown 图片与链接 ![...](...) / [...](...)
  result = result.replace(/!?\[[^\]]*\]\([^)]*\)/g, stash);

  // 4. 逐行处理正文，保留行首缩进 ^[ \t]+
  result = result
    .split('\n')
    .map((line) => {
      const indentMatch = line.match(/^([ \t]+)(.*)$/);
      const indent = indentMatch ? indentMatch[1] : '';
      let body = indentMatch ? indentMatch[2] : line;

      // 中文与英文/数字之间加空格
      body = body.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
      body = body.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
      // 中文与百分号/数字
      body = body.replace(/([\u4e00-\u9fa5])([0-9]+%?)/g, '$1 $2');
      body = body.replace(/([0-9]+%?)([\u4e00-\u9fa5])/g, '$1 $2');
      // 修正多余水平空格（不影响行首缩进）
      body = body.replace(/[ \t]{2,}/g, ' ');

      return indent + body;
    })
    .join('\n');

  // 5. 还原受保护片段
  result = result.replace(/\u0000PANGU_PH_(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)] ?? '');
  return result;
}

describe('Pangu Text Formatting (盘古之白排版算法) Suite', () => {
  it('should insert space between Chinese and English words', () => {
    assert.equal(panguFormat('LongPost是优秀的长文发布平台'), 'LongPost 是优秀的长文发布平台');
    assert.equal(panguFormat('使用Markdown写作更加高效'), '使用 Markdown 写作更加高效');
  });

  it('should insert space between Chinese and digits / percentages', () => {
    assert.equal(panguFormat('今天阅读量增长了50%很棒'), '今天阅读量增长了 50% 很棒');
    assert.equal(panguFormat('共有100篇长文收录'), '共有 100 篇长文收录');
  });

  it('should preserve indentation at the beginning of lines', () => {
    const indented = '  - 列表项与English测试';
    assert.equal(panguFormat(indented), '  - 列表项与 English 测试');
  });

  it('should protect multiline code blocks from being corrupted', () => {
    const codeBlock = '这是一段中文说明：\n```javascript\nconst message = "中文与English混排";\nfunction test123() {}\n```\n结束测试';
    const formatted = panguFormat(codeBlock);
    assert.ok(formatted.includes('const message = "中文与English混排";'));
    assert.ok(formatted.includes('function test123() {}'));
  });

  it('should protect inline code snippets from modification', () => {
    const inline = '请在终端执行`npm run build`命令启动构建。';
    const formatted = panguFormat(inline);
    assert.equal(formatted, '请在终端执行`npm run build`命令启动构建。');
  });

  it('should protect markdown links and images from modification', () => {
    const link = '访问[LongPost官网](https://longpost.dev/about)获取更多信息。';
    const formatted = panguFormat(link);
    assert.equal(formatted, '访问[LongPost官网](https://longpost.dev/about)获取更多信息。');
  });
});
