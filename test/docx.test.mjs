import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildDocx, markdownToDocumentXml, escapeXml } = require('../desktop/lib/docx.js');
const { zipStore, crc32 } = require('../desktop/lib/zip.js');

describe('Word 导出：zip 容器', () => {
  it('以 PK 开头，并包含 docx 必需部件', () => {
    const buf = buildDocx({ title: '测试', markdown: '# 标题\n\n正文' });
    assert.equal(buf.slice(0, 2).toString(), 'PK');
    const text = buf.toString('latin1');
    for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', '_rels/.rels']) {
      assert.ok(text.includes(part), '缺少 ' + part);
    }
  });

  it('CRC32 与已知值一致', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  });
});

describe('Word 导出：Markdown 结构', () => {
  it('标题映射到 Heading 样式', () => {
    const { xml } = markdownToDocumentXml('# 一级\n\n## 二级\n\n### 三级');
    assert.ok(xml.includes('w:val="Heading1"'));
    assert.ok(xml.includes('w:val="Heading2"'));
    assert.ok(xml.includes('w:val="Heading3"'));
  });

  it('列表、引用、代码块各归各的样式', () => {
    const md = '- 项\n\n1. 第一\n\n> 引用\n\n```\ncode\n```';
    const { xml } = markdownToDocumentXml(md);
    assert.ok(xml.includes('ListBullet'));
    assert.ok(xml.includes('ListNumber'));
    assert.ok(xml.includes('Quote'));
    assert.ok(xml.includes('CodeBlock'));
  });

  it('加粗与行内代码写成 run 属性', () => {
    const q = String.fromCharCode(96);
    const { xml } = markdownToDocumentXml('普通 **粗** 和 ' + q + 'code' + q + ' 文字');
    assert.ok(xml.includes('<w:b/>'));
    assert.ok(xml.includes('Consolas'));
  });

  it('XML 特殊字符被转义', () => {
    assert.equal(escapeXml('a<b&c'), 'a&lt;b&amp;c');
    const { xml } = markdownToDocumentXml('5 < 6 & 7 > 4');
    assert.ok(xml.includes('&lt;'));
    assert.ok(xml.includes('&amp;'));
  });
});

describe('Word 导出：边界', () => {
  it('空内容也能生成合法文件', () => {
    const buf = buildDocx({ title: '', markdown: '' });
    assert.equal(buf.slice(0, 2).toString(), 'PK');
  });

  it('未闭合的代码围栏不吞掉后续内容', () => {
    const { xml } = markdownToDocumentXml('```\n未闭合');
    assert.ok(xml.includes('未闭合'));
  });
});