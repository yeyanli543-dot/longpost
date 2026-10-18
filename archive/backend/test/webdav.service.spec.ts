import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WebDavService } from '../src/webdav/webdav.service';
import { ForbiddenException } from '@nestjs/common';

describe('WebDavService SSRF Protection Suite', () => {
  const service = new WebDavService();

  it('验证 isPrivateIp 能识别所有内网与保留 IP 地址', () => {
    // IPv4-mapped IPv6
    assert.strictEqual(service.isPrivateIp('::ffff:127.0.0.1'), true);
    assert.strictEqual(service.isPrivateIp('::ffff:169.254.169.254'), true);
    assert.strictEqual(service.isPrivateIp('::ffff:192.168.1.1'), true);

    // CGNAT
    assert.strictEqual(service.isPrivateIp('100.64.0.1'), true);
    assert.strictEqual(service.isPrivateIp('100.127.255.255'), true);

    // Benchmark
    assert.strictEqual(service.isPrivateIp('198.18.0.1'), true);
    assert.strictEqual(service.isPrivateIp('198.19.255.255'), true);

    // 0.0.0.0/8
    assert.strictEqual(service.isPrivateIp('0.0.0.0'), true);
    assert.strictEqual(service.isPrivateIp('0.1.2.3'), true);

    // Standard RFC1918 Private
    assert.strictEqual(service.isPrivateIp('10.0.0.1'), true);
    assert.strictEqual(service.isPrivateIp('172.16.0.1'), true);
    assert.strictEqual(service.isPrivateIp('192.168.0.1'), true);

    // IPv6
    assert.strictEqual(service.isPrivateIp('::'), true);
    assert.strictEqual(service.isPrivateIp('::1'), true);
    assert.strictEqual(service.isPrivateIp('fc00::1'), true);
    assert.strictEqual(service.isPrivateIp('fd00::1'), true);
    assert.strictEqual(service.isPrivateIp('fe80::1'), true);

    // Public IP
    assert.strictEqual(service.isPrivateIp('8.8.8.8'), false);
    assert.strictEqual(service.isPrivateIp('1.1.1.1'), false);
    assert.strictEqual(service.isPrivateIp('114.114.114.114'), false);
  });

  it('验证 validateAndResolveUrl 拦截私有 IP 并抛出 ForbiddenException', async () => {
    const dangerousUrls = [
      'http://127.0.0.1:8080/dav',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/dav',
      'http://[::ffff:127.0.0.1]/dav',
      'http://[::1]/dav',
      'http://localhost:3000/dav',
    ];

    for (const rawUrl of dangerousUrls) {
      await assert.rejects(
        async () => {
          await service.validateAndResolveUrl(rawUrl);
        },
        (err: any) => {
          return err instanceof ForbiddenException;
        },
        `URL ${rawUrl} 应当被 SSRF 防护拦截并抛出 ForbiddenException`
      );
    }
  });
});
