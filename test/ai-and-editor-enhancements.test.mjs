import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 全部直接 import 生产实现
import { tokenizeText } from '../client/src/lib/ai/local-rag.ts';
import {
  parseMarkdownTable,
  serializeMarkdownTable,
  splitTableRow,
} from '../shared/text/markdown-table.ts';
import { extractHeadings } from '../shared/text/headings.ts';
import { parseHeadingSections } from '../client/src/components/editor/wysiwyg/HeadingFoldPlugin.ts';

describe('Local RAG & Chinese Bigram Tokenizer Suite', () => {
  it('正确实现中文双字 Bigram 窗口切词与英文单词提取，并有效过滤停用词', () => {
    const text = 'LongPost 是一个支持深度写作与 WebDAV 同步的现代长文平台';
    const tokens = tokenizeText(text);

    assert.ok(tokens.includes('longpost'), '包含英文单词 longpost');
    assert.ok(tokens.includes('webdav'), '包含英文单词 webdav');
    assert.ok(tokens.includes('支持'), '包含中文 Bigram 支持');
    assert.ok(tokens.includes('深度'), '包含中文 Bigram 深度');
    assert.ok(tokens.includes('写作'), '包含中文 Bigram 写作');
    assert.ok(tokens.includes('现代'), '包含中文 Bigram 现代');
    assert.ok(!tokens.includes('的'), '成功过滤停用词 "的"');
    assert.ok(!tokens.includes('是'), '成功过滤停用词 "是"');
  });

  it('针对短语和中英混排能够输出高区分度索引词', () => {
    const tokens = tokenizeText('AI 润色与智能续写');
    assert.ok(tokens.includes('ai'));
    assert.ok(tokens.includes('润色'));
    assert.ok(tokens.includes('智能'));
    assert.ok(tokens.includes('续写'));
  });

  it('空输入返回空数组而不是抛异常', () => {
    assert.deepEqual(tokenizeText(''), []);
    assert.deepEqual(tokenizeText(undefined), []);
  });
});

describe('Table Grid Visual Editor & Serialization Suite', () => {
  it('能够将标准 Markdown 表格准确反序列化为表头、对齐方式与二维单元格', () => {
    const md = [
      '| 特性 | 支持状态 | 备注 |',
      '| :--- | :---: | ---: |',
      '| 本地 RAG | 已就绪 | 毫秒级 |',
      '| 演说模式 | 已就绪 | Marp 风格 |',
    ].join('\n');

    const parsed = parseMarkdownTable(md);
    assert.deepEqual(parsed.headers, ['特性', '支持状态', '备注']);
    assert.deepEqual(parsed.alignments, ['left', 'center', 'right']);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0][0], '本地 RAG');
    assert.equal(parsed.rows[1][2], 'Marp 风格');
  });

  it('序列化能够保持等宽补齐与严格的 Markdown 语法规范', () => {
    const serialized = serializeMarkdownTable({
      headers: ['模块', '状态'],
      alignments: ['left', 'center'],
      rows: [
        ['AI 协同', '已完成'],
        ['WebDAV', '已测试'],
      ],
    });
    const lines = serialized.trimEnd().split('\n');

    assert.equal(lines.length, 4);
    assert.ok(lines[0].startsWith('| 模块'));
    assert.ok(/^\| :?-+:? \| :?-+:? \|$/.test(lines[1]), '第二行必须是合法对齐分隔行');
    assert.ok(lines[2].includes('已完成'));
  });

  it('解析 -> 序列化 -> 再解析 应当幂等', () => {
    const md = [
      '| 模块 | 状态 |',
      '| :--- | :---: |',
      '| AI 协同 | 已完成 |',
    ].join('\n');

    const once = serializeMarkdownTable(parseMarkdownTable(md));
    const twice = serializeMarkdownTable(parseMarkdownTable(once));
    assert.equal(once, twice, '二次序列化结果必须稳定');
  });

  it('表格切分器 splitTableRow 能够保护转义竖线与行内代码反引号', () => {
    const testLine = '| 命令 | 语法 `cat a | grep b` | 说明：包含 \\| 转义 |';
    const cells = splitTableRow(testLine);
    assert.equal(cells.length, 3);
    assert.equal(cells[0], '命令');
    assert.equal(cells[1], '语法 `cat a | grep b`');
    assert.equal(cells[2], '说明：包含 \\| 转义');
  });
});

describe('Document Outline & IME Safe Guard Suite', () => {
  it('正确提取 H1 至 H4 标题，并严格跳过代码块内部的假标题', () => {
    const doc = [
      '# 第一章 架构总览',
      '这是一段介绍。',
      '## 1.1 核心机制',
      '```typescript',
      '// # 这里是注释，不是标题',
      'const x = 1;',
      '```',
      '### 1.1.1 详细说明',
    ].join('\n');

    const headings = extractHeadings(doc);
    assert.equal(headings.length, 3, '代码块内的 # 不能被当成标题');
    assert.equal(headings[0].text, '第一章 架构总览');
    assert.equal(headings[0].level, 1);
    assert.equal(headings[1].text, '1.1 核心机制');
    assert.equal(headings[1].level, 2);
    assert.equal(headings[2].text, '1.1.1 详细说明');
    assert.equal(headings[2].level, 3);
  });

  it('大纲的字符偏移必须能精确定位回原文', () => {
    const doc = ['前言', '', '## 目标', '正文'].join('\n');
    const [heading] = extractHeadings(doc);
    assert.equal(doc.slice(heading.charIndex).startsWith('## 目标'), true);
  });

  it('HeadingFoldPlugin 正确识别章节折叠区间并计算隐藏字数', () => {
    const doc = [
      '# 顶级章节',
      '这里是一段正文内容，共十五个字左右。',
      '## 子章节',
      '子章节内容。',
      '# 另一个顶级章节',
    ].join('\n');

    const sections = parseHeadingSections(doc);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, '顶级章节');
    assert.equal(sections[0].level, 1);
    assert.equal(sections[0].endLine, 3, '第一章应覆盖到子章节内容');
    assert.ok(sections[0].hiddenCharCount > 0);
  });

  it('折叠状态只影响 isFolded，不改变章节边界', () => {
    const doc = ['# A', '正文 A', '# B', '正文 B'].join('\n');
    const folded = parseHeadingSections(doc, new Set(['heading-0-1']));
    const plain = parseHeadingSections(doc);
    assert.deepEqual(
      folded.map((s) => [s.startLine, s.endLine]),
      plain.map((s) => [s.startLine, s.endLine]),
    );
    assert.equal(folded[0].isFolded, true);
  });
});
