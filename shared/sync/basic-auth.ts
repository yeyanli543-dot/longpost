/**
 * HTTP Basic Authentication 认证头生成（RFC 7617）
 *
 * 抽成纯函数放在 shared/ 里的原因：
 * 1. WebDAV 客户端在浏览器、Electron 主进程、单测环境三处都要用；
 * 2. 原先这段逻辑写在 WebdavClient 的私有方法里，测试只能照抄一遍再断言，
 *    抄的版本永远绿，线上改坏了也发现不了。
 */

/**
 * 生成 `Basic <base64>` 形式的认证头。
 *
 * 账号密码可能包含中文（部分自建 WebDAV 用中文用户名），
 * 因此先按 UTF-8 编码再做 base64，而不是直接抛给 btoa（遇到多字节字符会抛 InvalidCharacterError）。
 */
export function buildBasicAuthHeader(username: string, password: string): string {
  const raw = `${username}:${password}`;

  // Node 环境优先用 Buffer，语义最直白
  if (typeof Buffer !== 'undefined') {
    return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
  }

  // 浏览器环境：先 UTF-8 编码成字节，再逐字节取字符交给 btoa
  try {
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `Basic ${btoa(binary)}`;
  } catch {
    return `Basic ${btoa(raw)}`;
  }
}
