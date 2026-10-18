/**
 * CSV 导出转义（防止公式注入 / DDE）
 *
 * 安全背景：Excel、WPS、Numbers 打开 CSV 时会把以 `=` `+` `-` `@` 开头的单元格
 * 当作公式执行；`\t` 与 `\r` 开头还能拼接出额外命令。后台导出用户列表时若直接拼接，
 * 一个精心构造的用户名就能在管理员打开表格时触发 DDE。
 *
 * 处理策略：危险前缀加单引号（表格软件会按纯文本处理），
 * 含逗号/引号/换行的字段按 RFC 4180 用双引号包裹并把内部引号翻倍。
 */

/** 需要预防的公式起始字符 */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/** 转义单个 CSV 单元格 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (FORMULA_PREFIX_RE.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 把一行单元格拼成 CSV 行（不含换行符） */
export function toCsvRow(values: readonly unknown[]): string {
  return values.map((v) => escapeCsvValue(v)).join(',');
}
