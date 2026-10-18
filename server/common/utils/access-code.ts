/**
 * 通行码 / 邀请码生成
 *
 * 字符集刻意剔除了 0/O、1/I/L 这类肉眼难以区分的字符，
 * 因为通行码是要用户手抄或口述的。
 * 使用 crypto.randomInt 而不是 Math.random：后者是可预测的伪随机，
 * 用于访问凭证等于把门锁换成纸糊的。
 */

import { randomInt } from 'node:crypto';

/** 去掉易混淆字符（0 O 1 I L）后的 32 字符集 */
export const ACCESS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 默认长度 */
export const ACCESS_CODE_LENGTH = 16;

/** 生成一个指定长度的随机通行码 */
export function generateAccessCode(length: number = ACCESS_CODE_LENGTH): string {
  const safeLength = Math.max(1, Math.floor(length));
  let result = '';
  for (let i = 0; i < safeLength; i += 1) {
    result += ACCESS_CODE_CHARS[randomInt(0, ACCESS_CODE_CHARS.length)];
  }
  return result;
}

/** 校验字符串是否是合法通行码格式（长度 + 字符集） */
export function isValidAccessCode(code: string, length: number = ACCESS_CODE_LENGTH): boolean {
  if (!code || code.length !== length) return false;
  for (const ch of code) {
    if (!ACCESS_CODE_CHARS.includes(ch)) return false;
  }
  return true;
}
