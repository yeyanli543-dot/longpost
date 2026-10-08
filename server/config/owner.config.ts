/**
 * 站长（owner）引导配置。
 *
 * 通过环境变量 OWNER_EMAIL 指定站长的邮箱。命中该邮箱的账号会被自动提升为
 * admin（站长），不管它是以什么方式登录进来的：邮箱注册、Google OAuth、
 * 还是团队通行码。
 *
 * 为什么用环境变量而不是把邮箱写进代码：
 *  1. 站长身份属于部署配置，不该进入代码仓库（仓库是公开的）；
 *  2. 换站长时只需要改一个环境变量并重启，不必改代码、重新发版；
 *  3. 每次 /api/auth/me 都会重新判定一次，所以设置完无需重新登录即可生效。
 */

export const OWNER_EMAIL = (process.env.OWNER_EMAIL || '').trim().toLowerCase();

/**
 * 判断某个邮箱是否是站长邮箱。
 * 未配置 OWNER_EMAIL 时永远返回 false，不会误提升任何人。
 */
export function isOwnerEmail(email?: string | null): boolean {
  if (!OWNER_EMAIL) return false;
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}
