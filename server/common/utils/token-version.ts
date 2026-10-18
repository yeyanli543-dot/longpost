/**
 * JWT tokenVersion 校验（即时吊销）
 *
 * 用户改密码 / 被踢下线时只需把 app_users.tokenVersion 加一，
 * 所有旧 token 立刻失效 —— 不需要维护黑名单表，也不依赖 Redis。
 *
 * 单独抽成纯函数的原因：这段判断写在守卫里，测试只能照抄一份逻辑，
 * 抄的版本一旦和线上不一致，"旧 token 还能不能用"这种致命问题永远测不出来。
 */

export interface TokenVersionPayload {
  tokenVersion?: number;
}

export interface TokenVersionUser {
  tokenVersion?: number;
}

/**
 * 判断 token 是否应被视为已吊销。
 *
 * 只有两端都携带 tokenVersion 时才比较；任一端缺失则视为兼容旧数据、放行。
 */
export function isTokenVersionMismatched(
  payload: TokenVersionPayload | null | undefined,
  user: TokenVersionUser | null | undefined,
): boolean {
  if (!payload || !user) return false;
  if (payload.tokenVersion === undefined || user.tokenVersion === undefined) return false;
  return payload.tokenVersion !== user.tokenVersion;
}
