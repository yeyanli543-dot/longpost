import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产代码（Node 24 原生擦除类型），不再在测试里复制一份实现。
// 以前这里是把 isPrivateIp 抄一遍再测，即使生产代码没接上守卫，测试照样全绿。
import {
  isPrivateIp,
  isBlockedHostname,
  checkOutboundUrl,
  resolvePublicHost,
  createGuardedLookup,
} from '../server/common/security/outbound-host-guard.ts';

describe('WebDAV SSRF Private IP Filter Suite', () => {
  it('应当严密拦截所有 IPv4-mapped IPv6 内网地址', () => {
    assert.equal(isPrivateIp('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateIp('::ffff:169.254.169.254'), true);
    assert.equal(isPrivateIp('::ffff:192.168.1.1'), true);
    // 十六进制压缩写法 ::ffff:7f00:1 == 127.0.0.1
    assert.equal(isPrivateIp('::ffff:7f00:1'), true);
  });

  it('应当拦截 100.64.0.0/10 CGNAT 地址与 198.18.0.0/15 基准测试地址', () => {
    assert.equal(isPrivateIp('100.64.0.1'), true);
    assert.equal(isPrivateIp('100.127.255.255'), true);
    assert.equal(isPrivateIp('198.18.0.1'), true);
    assert.equal(isPrivateIp('198.19.0.1'), true);
  });

  it('应当拦截 0.0.0.0/8 与经典内网私有地址', () => {
    assert.equal(isPrivateIp('0.0.0.0'), true);
    assert.equal(isPrivateIp('10.255.255.255'), true);
    assert.equal(isPrivateIp('172.20.0.1'), true);
    assert.equal(isPrivateIp('192.168.0.1'), true);
  });

  it('应当拦截 IPv6 未指定与 ULA/链路本地地址', () => {
    assert.equal(isPrivateIp('::'), true);
    assert.equal(isPrivateIp('::1'), true);
    assert.equal(isPrivateIp('fc00::1'), true);
    assert.equal(isPrivateIp('fd12:3456::1'), true);
    assert.equal(isPrivateIp('fe80::abcd'), true);
  });

  it('应当放行正常的公网公有 IP', () => {
    assert.equal(isPrivateIp('8.8.8.8'), false);
    assert.equal(isPrivateIp('1.1.1.1'), false);
    assert.equal(isPrivateIp('223.5.5.5'), false);
  });

  it('无法识别的字符串按危险处理', () => {
    assert.equal(isPrivateIp('not-an-ip'), true);
    assert.equal(isPrivateIp(''), true);
  });
});

describe('SSRF 主机名黑名单', () => {
  it('拦截 localhost / .local / .internal / 元数据域名', () => {
    assert.equal(isBlockedHostname('localhost'), true);
    assert.equal(isBlockedHostname('LOCALHOST.'), true);
    assert.equal(isBlockedHostname('printer.local'), true);
    assert.equal(isBlockedHostname('metadata.google.internal'), true);
    assert.equal(isBlockedHostname('metadata'), true);
  });

  it('IP 字面量直接走内网判定', () => {
    assert.equal(isBlockedHostname('127.0.0.1'), true);
    assert.equal(isBlockedHostname('169.254.169.254'), true);
    assert.equal(isBlockedHostname('8.8.8.8'), false);
  });

  it('放行普通公网域名', () => {
    assert.equal(isBlockedHostname('dav.jianguoyun.com'), false);
    assert.equal(isBlockedHostname('example.com'), false);
  });
});

describe('checkOutboundUrl 协议与地址校验', () => {
  it('拒绝非 HTTP(S) 协议', () => {
    assert.equal(checkOutboundUrl('file:///etc/passwd').ok, false);
    assert.equal(checkOutboundUrl('gopher://example.com').ok, false);
    assert.equal(checkOutboundUrl('ftp://example.com').ok, false);
  });

  it('拒绝内网与环回地址', () => {
    assert.equal(checkOutboundUrl('http://127.0.0.1:8080/dav').ok, false);
    assert.equal(checkOutboundUrl('http://169.254.169.254/latest/meta-data').ok, false);
    assert.equal(checkOutboundUrl('http://192.168.1.10/dav').ok, false);
    assert.equal(checkOutboundUrl('http://[::1]:8080/').ok, false);
  });

  it('拒绝 URL 中内嵌账号密码', () => {
    assert.equal(checkOutboundUrl('https://user:pass@example.com/dav').ok, false);
  });

  it('拒绝非法 URL', () => {
    assert.equal(checkOutboundUrl('not a url').ok, false);
    assert.equal(checkOutboundUrl('').ok, false);
  });

  it('放行正常公网 WebDAV 地址', () => {
    const result = checkOutboundUrl('https://dav.jianguoyun.com/dav/');
    assert.equal(result.ok, true);
    assert.equal(result.url.hostname, 'dav.jianguoyun.com');
  });
});

describe('resolvePublicHost DNS 解析期防护', () => {
  it('IP 字面量不查询 DNS，直接按内网规则判定', async () => {
    const privateResult = await resolvePublicHost('10.0.0.5');
    assert.equal(privateResult.ok, false);
    assert.deepEqual(privateResult.addresses, []);

    const publicResult = await resolvePublicHost('8.8.8.8');
    assert.equal(publicResult.ok, true);
    assert.deepEqual(publicResult.addresses, ['8.8.8.8']);
  });

  it('无法解析的域名返回 ok=false 而不是抛异常', async () => {
    const result = await resolvePublicHost('this-host-should-not-resolve.invalid');
    assert.equal(result.ok, false);
  });
});

describe('createGuardedLookup 连接期 DNS 复核（防 DNS rebinding）', () => {
  const callLookup = (hostname) =>
    new Promise((resolve) => {
      const lookup = createGuardedLookup();
      lookup(hostname, { family: 0 }, (err, address) => {
        resolve({ err, address });
      });
    });

  it('解析到内网主机时以 ESSRFBLOCKED 失败', async () => {
    const { err } = await callLookup('localhost');
    assert.ok(err, '必须返回错误而不是正常地址');
    assert.equal(err.code, 'ESSRFBLOCKED');
  });

  it('解析到公网主机时返回真实地址', async () => {
    const { err, address } = await callLookup('example.com');
    assert.equal(err, null);
    assert.ok(typeof address === 'string' && address.length > 0);
  });
});
