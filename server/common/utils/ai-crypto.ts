/**
 * 用户自填 AI Key 的加解密
 *
 * 场景：用户把自己在 DeepSeek / Gemini 申请的 Key 托管到服务端，
 * 换来「换设备登录即用、不用每台机器重填」。这就要求服务端能还原明文去调用上游，
 * 因此不能只存哈希 —— 必须可逆加密。
 *
 * 做法：AES-256-GCM，密钥由服务端 secret（AI_KEY_SECRET，缺省回退 JWT_SECRET）
 * 经 scrypt 派生。密文格式 `v1.<iv>.<tag>.<ciphertext>`（均为 base64url），
 * 带版本前缀，将来换算法时能识别旧数据。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const SALT = 'longpost-ai-key-v1';

/** 由服务端 secret 派生 32 字节密钥 */
export function deriveKey(secret: string): Buffer {
  return scryptSync(secret || 'longpost-insecure-default', SALT, 32);
}

/** 加密明文，返回可入库的字符串 */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** 解密；格式不合法、被篡改、密钥不对，一律返回 null（调用方按「没有 Key」处理） */
export function decryptSecret(payload: string | null | undefined, secret: string): string | null {
  if (!payload) return null;
  const parts = String(payload).split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return plain || null;
  } catch {
    return null;
  }
}

/** 给前端看的掩码形式，比如 sk-ab…wxyz */
export function maskKey(plain: string | null | undefined): string {
  if (!plain) return '';
  const value = String(plain);
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '…' + value.slice(-4);
}

/** 常量时间比较，避免把「密钥对不对」变成计时侧信道（当前用于自检） */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
