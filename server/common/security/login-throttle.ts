/**
 * 登录失败节流（防密码爆破）
 *
 * 之前 `/api/auth/login` 完全没有限制：任何人都能用脚本无限猜密码，
 * bcrypt 每轮 100ms 的代价只是拖慢自己，服务端照样被刷。
 *
 * 策略（按「IP + 邮箱」组合计数，避免误伤同一出口 IP 的其他用户）：
 *   - 窗口期内失败 N 次 -> 锁定 T 分钟
 *   - 登录成功立即清零
 *   - 记录只保留最近窗口期内的，内存有上限，防止被随机邮箱打爆
 *
 * 纯函数 + 内存表：单实例部署（PM2 配置即如此）足够；
 * 将来上多实例时把 Map 换成 Redis 即可，判定逻辑不用改。
 */

export interface ThrottlePolicy {
  /** 触发锁定所需的失败次数 */
  maxFailures: number;
  /** 计数窗口（毫秒），超过窗口的旧失败不计入 */
  windowMs: number;
  /** 锁定时长（毫秒） */
  lockMs: number;
}

export const DEFAULT_THROTTLE_POLICY: ThrottlePolicy = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
};

export interface AttemptRecord {
  /** 窗口内的失败次数 */
  failures: number;
  /** 窗口起点 */
  firstAt: number;
  /** 锁到什么时候（0 表示未锁定） */
  lockedUntil: number;
}

export interface ThrottleDecision {
  allowed: boolean;
  /** 还要等多久（毫秒），allowed=false 时有意义 */
  retryAfterMs: number;
  record: AttemptRecord;
}

const EMPTY: AttemptRecord = { failures: 0, firstAt: 0, lockedUntil: 0 };

/** 判断当前是否放行 */
export function evaluateThrottle(
  record: AttemptRecord | null | undefined,
  now: number,
  policy: ThrottlePolicy = DEFAULT_THROTTLE_POLICY,
): ThrottleDecision {
  const rec = record ?? EMPTY;

  if (rec.lockedUntil > now) {
    return { allowed: false, retryAfterMs: rec.lockedUntil - now, record: rec };
  }

  // 锁已过期或窗口已滑出，都要重新计数
  const expired = rec.lockedUntil !== 0 && rec.lockedUntil <= now;
  const outsideWindow = rec.firstAt !== 0 && now - rec.firstAt > policy.windowMs;
  if (expired || outsideWindow) {
    return { allowed: true, retryAfterMs: 0, record: { failures: 0, firstAt: 0, lockedUntil: 0 } };
  }

  return { allowed: true, retryAfterMs: 0, record: rec };
}

/** 记一次失败，返回新记录（可能进入锁定） */
export function registerFailure(
  record: AttemptRecord | null | undefined,
  now: number,
  policy: ThrottlePolicy = DEFAULT_THROTTLE_POLICY,
): AttemptRecord {
  const rec = record ?? EMPTY;
  const fresh = rec.firstAt === 0 || now - rec.firstAt > policy.windowMs || (rec.lockedUntil !== 0 && rec.lockedUntil <= now);
  const base = fresh ? { failures: 0, firstAt: now, lockedUntil: 0 } : rec;
  const failures = base.failures + 1;

  if (failures >= policy.maxFailures) {
    return { failures, firstAt: base.firstAt, lockedUntil: now + policy.lockMs };
  }
  return { failures, firstAt: base.firstAt, lockedUntil: 0 };
}

/** 登录成功 -> 清零 */
export function registerSuccess(): AttemptRecord {
  return { failures: 0, firstAt: 0, lockedUntil: 0 };
}

/**
 * 进程内存储。带容量上限：随机邮箱攻击不能把内存撑爆。
 */
export class InMemoryThrottleStore {
  private readonly map = new Map<string, AttemptRecord>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  get(key: string): AttemptRecord | undefined {
    const rec = this.map.get(key);
    if (!rec) return undefined;
    // 已过期的记录顺手清掉
    if (rec.lockedUntil !== 0 && rec.lockedUntil + 60_000 < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return rec;
  }

  set(key: string, record: AttemptRecord): void {
    if (record.failures === 0 && record.lockedUntil === 0) {
      this.map.delete(key);
      return;
    }
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      // 简单淘汰：删掉最早插入的一条
      const first = this.map.keys().next();
      if (!first.done) this.map.delete(first.value);
    }
    this.map.set(key, record);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
