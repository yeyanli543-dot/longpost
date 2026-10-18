/**
 * 出站请求目标校验（SSRF 防护）
 *
 * 场景：服务端要替浏览器代理访问用户填写的 WebDAV 地址。
 * 如果没有这个守卫，任何人都能让服务器去请求 http://127.0.0.1:xxxx、
 * http://169.254.169.254/（云厂商元数据）或 http://192.168.x.x，把内网服务变成跳板。
 *
 * 三道防线：
 * 1. 协议白名单：只允许 http/https；
 * 2. 主机名黑名单：拒绝 localhost / *.local / *.internal 等保留域名；
 * 3. 解析期校验：连接时用自己的 lookup 回调逐条检查 DNS 结果，
 *    命中内网段直接失败 —— 这样即使域名在"检查完"和"连上去"之间改了解析结果
 *    （DNS rebinding），也拦得住。
 *
 * 本模块刻意不依赖 @nestjs/*，保证可以被 node:test 直接 import 做真单测。
 */

import * as net from 'node:net';
import { lookup as dnsLookup } from 'node:dns';

/** 允许的协议 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** 禁止解析的主机名后缀 */
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

/** 禁止的主机名 */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);

/**
 * 判断一个 IP 字面量是否属于内网 / 保留 / 多云元数据网段。
 *
 * 覆盖 IPv4 全部私有与特殊用途网段，以及 IPv6 的未指定、环回、ULA、链路本地、
 * IPv4-mapped（::ffff:127.0.0.1 这种绕过写法）与 NAT64 前缀。
 */
export function isPrivateIp(input: string): boolean {
  if (!input) return true;
  const ip = input.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped IPv6：::ffff:127.0.0.1 → 127.0.0.1
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    // ::ffff:7f00:1 这种十六进制压缩写法，按十六进制解析出 IPv4
    const hexMapped = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      const v4 = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
      return isPrivateIp(v4);
    }
  }

  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0) return true; // 0.0.0.0/8 本网络
    if (a === 10) return true; // 10.0.0.0/8 私有
    if (a === 127) return true; // 127.0.0.0/8 环回
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 链路本地 & 云元数据
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 私有
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 私有
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF 协议保留
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 基准测试
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 文档保留
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 文档保留
    if (a >= 224) return true; // 224.0.0.0/4 组播 + 240.0.0.0/4 保留
    return false;
  }

  if (net.isIPv6(ip)) {
    // 未指定 / 环回
    if (ip === '::' || ip === '::1') return true;
    // ULA fc00::/7、链路本地 fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(ip)) return true;
    // NAT64 well-known prefix 64:ff9b::/96，内嵌 IPv4 需再校验
    if (ip.startsWith('64:ff9b::')) {
      const tail = ip.slice('64:ff9b::'.length);
      if (net.isIPv4(tail)) return isPrivateIp(tail);
    }
    return false;
  }

  // 既不是合法 IPv4 也不是 IPv6，按危险处理
  return true;
}

/** 主机名层面是否可以放行（不含 DNS 解析） */
export function isBlockedHostname(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // 纯数字/十六进制形式的 IP 变体（如 0x7f.1、2130706433）一律按 IP 处理
  if (net.isIP(host)) return isPrivateIp(host);
  return false;
}

export interface OutboundUrlCheck {
  ok: boolean;
  /** 失败原因；ok 为 true 时为 undefined */
  reason?: string;
  url?: URL;
}

/**
 * 纯同步校验：协议 + 主机名。不发起 DNS 查询，方便单测与快速失败。
 */
export function checkOutboundUrl(rawUrl: string): OutboundUrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: '目标地址不是合法的 URL' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: '安全拦截：仅允许 HTTP 与 HTTPS 协议' };
  }

  // 带账号密码的 URL 一律拒绝，避免凭据被写进日志
  if (url.username || url.password) {
    return { ok: false, reason: '安全拦截：URL 中不允许内嵌账号密码' };
  }

  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: '安全拦截：禁止访问本地、内网或保留域名 (SSRF 防护)' };
  }

  return { ok: true, url };
}

/**
 * DNS 解析 + 内网判定。返回解析出的地址列表供调用方固定使用。
 */
export async function resolvePublicHost(
  hostname: string,
): Promise<{ ok: boolean; reason?: string; addresses: string[] }> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    return isPrivateIp(host)
      ? { ok: false, reason: '安全拦截：禁止访问内网或保留 IP 地址 (SSRF 防护)', addresses: [] }
      : { ok: true, addresses: [host] };
  }

  const records = await new Promise<Array<{ address: string }>>((resolve, reject) => {
    dnsLookup(host, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses as Array<{ address: string }>);
    });
  }).catch(() => [] as Array<{ address: string }>);

  if (!records.length) {
    return { ok: false, reason: '无法解析目标主机的 DNS 记录', addresses: [] };
  }

  const blocked = records.find((r) => isPrivateIp(r.address));
  if (blocked) {
    return {
      ok: false,
      reason: `安全拦截：目标域名解析到内网地址 ${blocked.address} (SSRF 防护)`,
      addresses: records.map((r) => r.address),
    };
  }

  return { ok: true, addresses: records.map((r) => r.address) };
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | any[],
  family?: number,
) => void;

/**
 * 交给 http.request 的 lookup 回调：解析到内网地址时直接让连接失败。
 *
 * 这是防 DNS rebinding 的关键 —— 校验和连接用的是同一次解析结果。
 */
export function createGuardedLookup() {
  return function guardedLookup(
    hostname: string,
    options: any,
    callback: LookupCallback,
  ): void {
    dnsLookup(hostname, { ...options, all: true }, (err: NodeJS.ErrnoException | null, addresses: any) => {
      if (err) {
        callback(err, '');
        return;
      }
      const list: Array<{ address: string; family: number }> = Array.isArray(addresses)
        ? addresses
        : [{ address: addresses as unknown as string, family: 4 }];

      const blocked = list.find((entry) => isPrivateIp(entry.address));
      if (blocked) {
        const guardErr: NodeJS.ErrnoException = new Error(
          '安全拦截：目标域名解析到内网地址 (SSRF 防护)',
        );
        guardErr.code = 'ESSRFBLOCKED';
        callback(guardErr, '');
        return;
      }

      if (!list.length) {
        callback(new Error('DNS 无可用记录'), '');
        return;
      }

      if (options && options.all) {
        callback(null, list);
      } else {
        callback(null, list[0].address, list[0].family);
      }
    });
  };
}
