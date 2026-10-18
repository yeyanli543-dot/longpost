import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

// 直接 import 生产实现
import {
  ACCESS_CODE_CHARS,
  ACCESS_CODE_LENGTH,
  generateAccessCode,
  isValidAccessCode,
} from '../server/common/utils/access-code.ts';
import { isTokenVersionMismatched } from '../server/common/utils/token-version.ts';

describe('Security Architecture & Token Version Suite', () => {
  it('should generate high-entropy 16-char access code without ambiguous characters', () => {
    const code = generateAccessCode();
    assert.equal(code.length, ACCESS_CODE_LENGTH);
    assert.equal(isValidAccessCode(code), true);
    assert.doesNotMatch(code, /[01IO]/, '不得包含易混淆字符 0/1/I/O');
    for (const ch of code) {
      assert.ok(ACCESS_CODE_CHARS.includes(ch), `字符 ${ch} 不在允许的字符集内`);
    }

    // 连续生成的通行码不应重复（32^16 空间下重复即视为随机源异常）
    const batch = new Set(Array.from({ length: 200 }, () => generateAccessCode()));
    assert.equal(batch.size, 200);
  });

  it('自定义长度与非法输入必须被正确处理', () => {
    assert.equal(generateAccessCode(8).length, 8);
    assert.equal(isValidAccessCode('ABC', 16), false);
    assert.equal(isValidAccessCode('ABCDEFGH00000000'), false, '含 0 必须判定为非法');
  });

  it('should correctly reject mismatched tokenVersion (JWT Instant Revocation)', () => {
    const activeUser = { id: 'user-uuid-1', tokenVersion: 2, isActive: true, isBanned: false };
    const staleToken = { sub: 'user-uuid-1', tokenVersion: 1 };
    const freshToken = { sub: 'user-uuid-1', tokenVersion: 2 };

    assert.equal(isTokenVersionMismatched(staleToken, activeUser), true, '旧 token 必须被吊销');
    assert.equal(isTokenVersionMismatched(freshToken, activeUser), false, '当前 token 必须放行');

    // 兼容历史数据：任一端没有 tokenVersion 时不做判定
    assert.equal(isTokenVersionMismatched({ sub: 'x' }, activeUser), false);
    assert.equal(isTokenVersionMismatched(freshToken, { id: 'x' }), false);
    assert.equal(isTokenVersionMismatched(null, activeUser), false);
  });

  it('should compute brute-force window and respect latest successful login timestamp', () => {
    const now = Date.now();
    const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);

    const logs = [
      { success: false, createdAt: new Date(now - 10 * 60 * 1000) },
      { success: false, createdAt: new Date(now - 9 * 60 * 1000) },
      { success: true, createdAt: new Date(now - 8 * 60 * 1000) }, // Successful login!
      { success: false, createdAt: new Date(now - 5 * 60 * 1000) },
      { success: false, createdAt: new Date(now - 2 * 60 * 1000) },
    ];

    const lastSuccess = logs
      .filter((l) => l.success)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const sinceTime =
      lastSuccess && lastSuccess.createdAt > fifteenMinutesAgo
        ? lastSuccess.createdAt
        : fifteenMinutesAgo;

    const postSuccessFailures = logs.filter(
      (l) => !l.success && l.createdAt >= sinceTime,
    );

    // Prior failures before success must NOT lock the user
    assert.equal(postSuccessFailures.length, 2);
    assert.equal(postSuccessFailures.length >= 5, false);
  });

  it('should correctly hash and verify passwords using bcrypt', async () => {
    const plain = 'SecurePassword123!';
    const hash = await bcrypt.hash(plain, 10);
    assert.notEqual(hash, plain);

    const isValid = await bcrypt.compare(plain, hash);
    assert.equal(isValid, true);

    const isInvalid = await bcrypt.compare('WrongPassword', hash);
    assert.equal(isInvalid, false);
  });
});
