import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateThrottle,
  registerFailure,
  registerSuccess,
  InMemoryThrottleStore,
  DEFAULT_THROTTLE_POLICY,
} from '../server/common/security/login-throttle.ts';

const T0 = 1_700_000_000_000;
const { maxFailures, windowMs, lockMs } = DEFAULT_THROTTLE_POLICY;

describe('登录失败节流', () => {
  it('未达阈值的失败仍可继续尝试', () => {
    let rec = evaluateThrottle(null, T0).record;
    for (let i = 0; i < maxFailures - 1; i++) {
      rec = registerFailure(rec, T0 + i * 1000);
      assert.equal(evaluateThrottle(rec, T0 + i * 1000).allowed, true);
    }
    assert.equal(rec.failures, maxFailures - 1);
  });

  it('达到阈值后锁定，并给出剩余等待时间', () => {
    let rec = null;
    for (let i = 0; i < maxFailures; i++) rec = registerFailure(rec, T0);
    assert.equal(rec.failures, maxFailures);

    const decision = evaluateThrottle(rec, T0 + 1000);
    assert.equal(decision.allowed, false);
    assert.ok(decision.retryAfterMs > 0 && decision.retryAfterMs <= lockMs);
  });

  it('锁定期满后自动放行并重新计数', () => {
    let rec = null;
    for (let i = 0; i < maxFailures; i++) rec = registerFailure(rec, T0);

    const afterLock = T0 + lockMs + 1;
    assert.equal(evaluateThrottle(rec, afterLock).allowed, true);
    const fresh = registerFailure(rec, afterLock);
    assert.equal(fresh.failures, 1, '锁过期后应从 1 重新计');
  });

  it('成功登录立即清零', () => {
    let rec = null;
    for (let i = 0; i < maxFailures - 1; i++) rec = registerFailure(rec, T0);
    rec = registerSuccess();
    assert.equal(rec.failures, 0);
    assert.equal(evaluateThrottle(rec, T0).allowed, true);
  });

  it('超出窗口期的旧失败不计入，避免"零散失败"累积成锁定', () => {
    let rec = null;
    for (let i = 0; i < maxFailures - 1; i++) rec = registerFailure(rec, T0);
    const muchLater = T0 + windowMs + 1000;
    const next = registerFailure(rec, muchLater);
    assert.equal(next.failures, 1);
  });

  it('内存存储有容量上限，不会被随机邮箱打爆', () => {
    const store = new InMemoryThrottleStore(3);
    for (let i = 0; i < 10; i++) {
      store.set('key-' + i, { failures: 1, firstAt: T0, lockedUntil: 0 });
    }
    assert.ok(store.size <= 3, '实际 ' + store.size);
  });

  it('清零记录不会留在存储里', () => {
    const store = new InMemoryThrottleStore(10);
    store.set('k', { failures: 2, firstAt: T0, lockedUntil: 0 });
    assert.equal(store.size, 1);
    store.set('k', registerSuccess());
    assert.equal(store.size, 0);
  });
});
