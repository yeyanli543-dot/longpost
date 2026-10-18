/**
 * Access Token 载荷校验
 *
 * 守卫里原本只有一句 `!payload || payload.type === 'refresh'`：
 * 一个没有 `sub` 的令牌会侥幸通过，靠下游查库失败才变成 401 —— 语义模糊且多一次 DB 往返。
 * 这里把它显式化，同时便于单测覆盖"refresh 令牌 / 缺 sub / 正常令牌"三种情况。
 */

export interface AccessTokenPayloadLike {
  sub?: unknown;
  type?: unknown;
}

/** 该载荷是否可作为 Access Token 使用 */
export function isAccessTokenPayloadUsable(payload: AccessTokenPayloadLike | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return false;
  // refresh token 只能用于换发，不允许访问业务接口
  if (payload.type === 'refresh') return false;
  return true;
}
