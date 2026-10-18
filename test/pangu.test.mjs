import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接测生产实现（shared/text/pangu.ts），不再抄一份到测试文件里
import { panguFormat } from '../shared/text/pangu.ts';

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
