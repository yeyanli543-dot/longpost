import { Injectable, BadRequestException, ForbiddenException, BadGatewayException } from '@nestjs/common';
import { WebDavProxyDto } from './dto/webdav-proxy.dto';
import * as dns from 'dns/promises';
import * as net from 'net';

@Injectable()
export class WebDavService {
  isPrivateIp(ip: string): boolean {
    const cleanIp = ip.trim().toLowerCase();

    if (cleanIp.startsWith('::ffff:')) {
      const mappedIpv4 = cleanIp.slice(7);
      if (net.isIPv4(mappedIpv4)) {
        return this.isPrivateIp(mappedIpv4);
      }
    }

    if (net.isIPv4(cleanIp)) {
      const parts = cleanIp.split('.').map(Number);
      const [a, b] = parts;
      if (a === 0) return true; // 0.0.0.0/8
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 127) return true; // 127.0.0.0/8 Loopback
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local & Cloud Metadata
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
      if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
      if (a >= 224) return true; // Multicast & Reserved
      return false;
    }

    if (net.isIPv6(cleanIp)) {
      if (
        cleanIp === '::' ||
        cleanIp === '::1' ||
        cleanIp.startsWith('fc') ||
        cleanIp.startsWith('fd') ||
        cleanIp.startsWith('fe80:')
      ) {
        return true;
      }
    }
    return false;
  }

  async validateAndResolveUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('WebDAV URL 格式不合法');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new BadRequestException('仅支持 HTTP/HTTPS 协议的 WebDAV 地址');
    }

    const hostname = url.hostname.replace(/^[\[\]]$/g, '');
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new ForbiddenException('禁止访问本地或内网保留域名 (SSRF 防护)');
    }

    if (net.isIP(hostname)) {
      if (this.isPrivateIp(hostname)) {
        throw new ForbiddenException('禁止访问内网或保留 IP 地址 (SSRF 防护)');
      }
      return url;
    }

    try {
      const records = await dns.lookup(hostname, { all: true });
      if (!records.length) {
        throw new BadRequestException('无法解析目标 WebDAV 域名');
      }
      for (const r of records) {
        if (this.isPrivateIp(r.address)) {
          throw new ForbiddenException(`目标域名解析到受限内网地址 (SSRF 防护)`);
        }
      }
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof BadRequestException) throw err;
      throw new BadGatewayException('DNS 解析目标 WebDAV 服务器失败');
    }

    return url;
  }

  private buildBasicAuth(username: string, password: string): string {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  async testConnection(dto: WebDavProxyDto) {
    const url = await this.validateAndResolveUrl(dto.endpoint);
    const res = await fetch(url.toString(), {
      method: 'PROPFIND',
      headers: {
        Authorization: this.buildBasicAuth(dto.username, dto.password),
        Depth: '0'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok && res.status !== 207) {
      throw new BadGatewayException(`WebDAV 连接失败: HTTP ${res.status}`);
    }
    return { ok: true, status: res.status };
  }

  async uploadBackup(dto: WebDavProxyDto) {
    const baseUrl = await this.validateAndResolveUrl(dto.endpoint);
    const filename = (dto.filename || 'longpost-backup.json').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetUrl = new URL(filename, baseUrl.toString().endsWith('/') ? baseUrl.toString() : `${baseUrl.toString()}/`);

    const res = await fetch(targetUrl.toString(), {
      method: 'PUT',
      headers: {
        Authorization: this.buildBasicAuth(dto.username, dto.password),
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: dto.payload || '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      throw new BadGatewayException(`WebDAV 备份上传失败: HTTP ${res.status}`);
    }
    return { ok: true, status: res.status, filename };
  }

  async downloadBackup(dto: WebDavProxyDto) {
    const baseUrl = await this.validateAndResolveUrl(dto.endpoint);
    const filename = (dto.filename || 'longpost-backup.json').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetUrl = new URL(filename, baseUrl.toString().endsWith('/') ? baseUrl.toString() : `${baseUrl.toString()}/`);

    const res = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: this.buildBasicAuth(dto.username, dto.password),
        Accept: 'application/json'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      throw new BadGatewayException(`WebDAV 备份拉取失败: HTTP ${res.status}`);
    }
    const text = await res.text();
    return { ok: true, status: res.status, payload: text };
  }
}
