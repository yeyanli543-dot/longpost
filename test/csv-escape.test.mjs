import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * CSV 导出防注入转义算法（与 admin.service.ts 保持完全一致）
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

describe('CSV Export Formula Injection Protection Suite', () => {
  it('should return empty string for null and undefined', () => {
    assert.equal(escapeCsv(null), '');
    assert.equal(escapeCsv(undefined), '');
  });

  it('should prepend single quote to prevent DDE and formula execution', () => {
    // 常见的 Excel/WPS 公式执行注入载荷
    assert.equal(escapeCsv('=1+1'), "'=1+1");
    assert.equal(escapeCsv('@SUM(A1:B10)'), "'@SUM(A1:B10)");
    assert.equal(escapeCsv('+cmd|/c calc'), "'+cmd|/c calc");
    assert.equal(escapeCsv('-100'), "'-100");
    assert.equal(escapeCsv('\tcmd'), "'\tcmd");
  });

  it('should wrap fields containing commas, quotes, or newlines in double quotes', () => {
    assert.equal(escapeCsv('北京市,朝阳区'), '"北京市,朝阳区"');
    assert.equal(escapeCsv('说: "你好"'), '"说: ""你好"""');
    assert.equal(escapeCsv('第一行\n第二行'), '"第一行\n第二行"');
  });

  it('should handle formula prefix and comma simultaneously', () => {
    // 既是公式，又含逗号
    assert.equal(escapeCsv('=HYPERLINK("http://evil.com","Click")'), `"'=HYPERLINK(""http://evil.com"",""Click"")"`);
  });

  it('should leave regular safe plain text unchanged', () => {
    assert.equal(escapeCsv('user@example.com'), 'user@example.com');
    assert.equal(escapeCsv('LongPost Official'), 'LongPost Official');
  });
});
