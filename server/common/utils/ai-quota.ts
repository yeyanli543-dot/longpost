/**
 * AI 每日额度计算（纯函数）
 *
 * 规则：按「用户 + 自然日」计数；跨天自动归零。
 * 只在使用**站点公共 Key** 时计数 —— 用户自带 Key 走自己的账单，不占额度。
 */

export interface QuotaRecord {
  /** 记账日期，YYYY-MM-DD */
  date: string;
  /** 当天已用次数 */
  count: number;
}

export interface QuotaDecision {
  /** 今天的日期 */
  date: string;
  /** 今天已用（跨天则为 0） */
  used: number;
  /** 剩余次数，0 表示已用尽 */
  remaining: number;
  /** 本次是否放行 */
  allowed: boolean;
}

/** 把日期规整成 YYYY-MM-DD（UTC，和服务端保持一致） */
export function toDateKey(value: Date = new Date()): string {
  return value.toISOString().slice(0, 10);
}

/**
 * 计算当前额度状态。
 * limit <= 0 视为关闭公共额度（一律不放行）。
 */
export function evaluateQuota(record: QuotaRecord | null, today: string, limit: number): QuotaDecision {
  const used = record && record.date === today ? Math.max(0, record.count) : 0;
  const safeLimit = Math.max(0, Math.floor(limit));
  const remaining = Math.max(0, safeLimit - used);
  return { date: today, used, remaining, allowed: safeLimit > 0 && remaining > 0 };
}

/** 消耗一次额度，返回消耗后的记录 */
export function consumeQuota(record: QuotaRecord | null, today: string): QuotaRecord {
  const used = record && record.date === today ? Math.max(0, record.count) : 0;
  return { date: today, count: used + 1 };
}
