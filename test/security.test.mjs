import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

describe('Security Architecture & Token Version Suite', () => {
  it('should generate high-entropy 16-char access code without ambiguous characters', () => {
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const generateCode = () => {
      let result = '';
      for (let i = 0; i < 16; i++) {
        const idx = Math.floor(Math.random() * CODE_CHARS.length);
        result += CODE_CHARS[idx];
      }
      return result;
    };

    const code = generateCode();
    assert.equal(code.length, 16);
    assert.match(code, /^[A-Z2-9]{16}$/);
    assert.doesNotMatch(code, /[01IO]/); // Excludes ambiguous digits/letters
  });

  it('should correctly reject mismatched tokenVersion (JWT Instant Revocation)', () => {
    const activeUser = {
      id: 'user-uuid-1',
      tokenVersion: 2, // Password was changed, incrementing version to 2
      isActive: true,
      isBanned: false,
    };

    const staleTokenPayload = {
      sub: 'user-uuid-1',
      tokenVersion: 1, // Issued before password change
    };

    const isTokenRevoked = (payload, user) => {
      if (
        payload.tokenVersion !== undefined &&
        user.tokenVersion !== undefined &&
        payload.tokenVersion !== user.tokenVersion
      ) {
        return true;
      }
      return false;
    };

    assert.equal(isTokenRevoked(staleTokenPayload, activeUser), true);

    const freshTokenPayload = {
      sub: 'user-uuid-1',
      tokenVersion: 2,
    };
    assert.equal(isTokenRevoked(freshTokenPayload, activeUser), false);
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
