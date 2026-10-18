import test from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产实现（CRC-32、XHTML 清洗、幻灯片切分），不再抄写算法
import { computeCrc32, sanitizeToXHtml } from '../client/src/lib/export/epub-builder.ts';
import { splitSlides } from '../shared/text/slides.ts';

// ============================================================================
// 测试套件：EPUB 3.0 打包、XHTML 1.1 闭合清洗与 Marp 幻灯片词法切分
// ============================================================================

test('EPUB 3.0 & Pure ZIP Architecture Suite', async (t) => {
  await t.test('纯算法 CRC-32 校验和与标准 ASCII 字符串匹配', () => {
    const encoder = new TextEncoder();
    // 标准 CRC-32 for "123456789" is 0xCBF43926 (3421780262)
    assert.equal(computeCrc32(encoder.encode('123456789')), 0xcbf43926);

    const mimeCrc = computeCrc32(encoder.encode('application/epub+zip'));
    assert.ok(typeof mimeCrc === 'number' && mimeCrc > 0);
  });

  await t.test('XHTML 1.1 清洗器必须严格自闭合 void 元素并转义裸 &', () => {
    const dirtyHtml = '<p>研发 & 创新</p><img src="pic.jpg"><br><hr><a href="/?a=1&b=2">链接</a>';
    const cleanXhtml = sanitizeToXHtml(dirtyHtml);

    assert.ok(cleanXhtml.includes('<p>研发 &amp; 创新</p>'), '裸 & 必须被转义为 &amp;');
    assert.ok(cleanXhtml.includes('<img src="pic.jpg" />'), '未闭合的 <img> 必须转为 <img />');
    assert.ok(cleanXhtml.includes('<br />'), '未闭合的 <br> 必须转为 <br />');
    assert.ok(cleanXhtml.includes('<hr />'), '未闭合的 <hr> 必须转为 <hr />');
    assert.ok(cleanXhtml.includes('href="/?a=1&amp;b=2"'), 'URL 中的裸 & 也必须符合 XHTML 标准');
  });

  await t.test('XHTML 清洗器必须剔除非法 XML 控制字符', () => {
    const dirty = '<p>正常\u0001文字\u0008</p>';
    const clean = sanitizeToXHtml(dirty);
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean), '非法控制字符必须被移除');
    assert.ok(clean.includes('正常文字'));
  });

  await t.test('Marp 幻灯片切分算法严格排除 Frontmatter 与代码块内部的 ---', () => {
    const sampleDoc = `---
title: "年度战略汇报"
author: "LongPost"
---

# 第一页：核心战略

这是开篇页正文内容。

---

# 第二页：系统架构

\`\`\`yaml
# 代码块内部的横线严禁被误切
apiVersion: apps/v1
kind: Deployment
---
metadata:
  name: demo-app
\`\`\`

代码块展示完成。

---

# 第三页：数据与致谢

| 季度 | 目标 | 达成 |
|---|---|---|
| Q1 | 100 | 120 |

感谢聆听！`;

    const slides = splitSlides(sampleDoc);

    assert.equal(slides.length, 3, '文档应准确被切分为 3 页幻灯片');
    assert.ok(slides[0].includes('# 第一页：核心战略'), '第 1 页应包含第一章标题');
    assert.ok(!slides[0].includes('author: "LongPost"'), '第 1 页必须剔除 YAML Frontmatter');
    assert.ok(slides[1].includes('# 第二页：系统架构'), '第 2 页应包含第二章标题');
    assert.ok(slides[1].includes('kind: Deployment\n---\nmetadata:'), '代码块内部的 --- 必须完整保留不被切断');
    assert.ok(slides[2].includes('# 第三页：数据与致谢'), '第 3 页应包含第三章标题');
  });

  await t.test('空文档回落到占位页而不是抛异常', () => {
    assert.deepEqual(splitSlides(''), ['# 演示文稿\n\n暂无内容']);
    assert.deepEqual(splitSlides('   '), ['# 演示文稿\n\n暂无内容']);
  });
});
