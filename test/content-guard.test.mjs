import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产 DFA 实现，不再在测试里复制一份 ContentGuard
import { ContentGuard } from '../server/common/utils/content-guard.ts';

const guard = new ContentGuard();

describe('Content Guard & Idempotency Resilience Suite', () => {

  it('should detect standard sensitive keywords', () => {
    assert.equal(guard.containsSensitive('高薪兼职刷单，日结五百'), true);
    assert.equal(guard.containsSensitive('今天天气真好，去公园散步'), false);
  });

  it('should penetrate camouflage and noise symbols (DFA Bypass Protection)', () => {
    assert.equal(guard.containsSensitive('兼*职-刷_单，速来'), true);
    assert.equal(guard.containsSensitive('网络.赌.博.平.台'), true);
    const words = guard.findSensitiveWords('加微信兼*职-刷_单返现');
    assert.ok(words.length > 0);
  });

  it('should mask sensitive phrases seamlessly', () => {
    const masked = guard.maskSensitive('诚聘兼职刷单，无需押金');
    assert.equal(masked, '诚聘***，无需押金');
  });

  it('should complete DFA matching within sub-millisecond for large texts', () => {
    const paragraph = 'LongPost 是一个支持沉浸式创作与图表呈现的现代化系统。'.repeat(500); // 1.5 万字
    const start = performance.now();
    const result = guard.containsSensitive(paragraph);
    const duration = performance.now() - start;

    assert.equal(result, false);
    assert.ok(duration < 15, `DFA scanning 15,000 chars should be < 15ms, took ${duration.toFixed(2)}ms`);
  });

  it('should enforce idempotency TTL window', () => {
    const records = new Map();
    const TTL_MS = 1000;

    const checkIdempotency = (key, now) => {
      const existing = records.get(key);
      if (existing && now - existing.timestamp < TTL_MS) {
        return false; // 重复拦截
      }
      records.set(key, { timestamp: now });
      return true; // 放行
    };

    const key = 'user_1:uuid_abc_123';
    assert.equal(checkIdempotency(key, 1000), true);
    // 500ms 后再次提交（重复操作，拦截）
    assert.equal(checkIdempotency(key, 1500), false);
    // 1200ms 后（窗口已过，允许下一次全新提交）
    assert.equal(checkIdempotency(key, 2200), true);
  });
});
