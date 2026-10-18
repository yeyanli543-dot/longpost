import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import * as http from 'node:http';
import * as https from 'node:https';
import { WebdavProxyDto } from './dto/webdav-proxy.dto';
import {
  checkOutboundUrl,
  createGuardedLookup,
  resolvePublicHost,
} from '../../common/security/outbound-host-guard';

export interface WebdavProxyResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: string;
  error?: string;
}

/** 单次中继允许读取的最大响应体（32MB），防止恶意节点把内存打满 */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** 连接超时（毫秒） */
const REQUEST_TIMEOUT_MS = 30_000;

@Controller('api/sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  /**
   * 浏览器里不可能直接发 PROPFIND（CORS 预检会拦），
   * 所以由服务端代为中继。既然服务端要替任何人发出请求，
   * 就必须先过 SSRF 守卫：协议白名单 + 主机名黑名单 + DNS 解析期内网拦截。
   */
  @Post('webdav-proxy')
  @HttpCode(HttpStatus.OK)
  async proxyWebdav(@Body() dto: WebdavProxyDto): Promise<WebdavProxyResponse> {
    const { url, method = 'GET', headers = {}, body = null } = dto;

    if (!url || typeof url !== 'string') {
      return this.fail(400, 'Bad Request', '缺少有效的目标 URL');
    }

    // 第一道：协议与主机名的同步校验，不产生任何网络 IO
    const check = checkOutboundUrl(url);
    if (!check.ok || !check.url) {
      this.logger.warn(`已拦截 WebDAV 中继请求: ${check.reason} (target=${url})`);
      return this.fail(403, 'Forbidden', check.reason || '目标地址不被允许');
    }

    // 第二道：解析域名，确保没有任何一条 A/AAAA 记录落在内网
    const resolved = await resolvePublicHost(check.url.hostname);
    if (!resolved.ok) {
      this.logger.warn(`已拦截 WebDAV 中继请求: ${resolved.reason} (target=${url})`);
      return this.fail(403, 'Forbidden', resolved.reason || '目标地址不被允许');
    }

    return this.forward(check.url, method, headers, body);
  }

  private fail(status: number, statusText: string, error: string): WebdavProxyResponse {
    return { ok: false, status, statusText, headers: {}, data: '', error };
  }

  /**
   * 实际发起中继请求。连接时的 DNS 解析走 createGuardedLookup()，
   * 与校验用的是同一份解析逻辑，因此 DNS rebinding 也无法绕过。
   */
  private forward(
    parsed: URL,
    method: string | undefined,
    headers: Record<string, string>,
    body: string | null | undefined,
  ): Promise<WebdavProxyResponse> {
    return new Promise<WebdavProxyResponse>((resolve) => {
      try {
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const reqHeaders: Record<string, string | number> = { ...headers };
        let payloadBuffer: Buffer | null = null;

        if (body !== null && body !== undefined) {
          payloadBuffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body as any);
          if (!reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
            reqHeaders['Content-Length'] = payloadBuffer.length;
          }
        }

        // 移除可能引起冲突或绕过校验的请求头
        delete reqHeaders['host'];
        delete reqHeaders['Host'];
        delete reqHeaders['content-length'];
        delete reqHeaders['Content-Length'];

        const options: https.RequestOptions = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: (method || 'GET').toUpperCase(),
          headers: reqHeaders,
          timeout: REQUEST_TIMEOUT_MS,
          lookup: createGuardedLookup() as any,
        };

        if (payloadBuffer) {
          (options.headers as Record<string, number>)['Content-Length'] = payloadBuffer.length;
        }

        const req = client.request(options, (res) => {
          const chunks: Buffer[] = [];
          let received = 0;
          let settled = false;

          const finish = (error: string) => {
            if (settled) return;
            settled = true;
            resolve(this.fail(502, 'Bad Gateway', error));
          };

          res.on('data', (chunk) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            received += buf.length;
            if (received > MAX_RESPONSE_BYTES) {
              req.destroy();
              finish(`远端响应超过 ${MAX_RESPONSE_BYTES / 1024 / 1024}MB 上限，已中止`);
              return;
            }
            chunks.push(buf);
          });

          res.on('end', () => {
            if (settled) return;
            settled = true;
            const text = Buffer.concat(chunks).toString('utf8');
            const resHeaders: Record<string, string> = {};
            Object.entries(res.headers).forEach(([k, v]) => {
              if (v !== undefined) {
                resHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
              }
            });

            const statusCode = res.statusCode || 200;
            resolve({
              ok: statusCode >= 200 && statusCode < 300,
              status: statusCode,
              statusText: res.statusMessage || '',
              headers: resHeaders,
              data: text,
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error(`WebDAV 远程连接超时 (${REQUEST_TIMEOUT_MS / 1000}s)`));
        });

        req.on('error', (err) => {
          // 被 SSRF 守卫拦下的连接会带上 ESSRFBLOCKED
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ESSRFBLOCKED') {
            this.logger.warn(`连接阶段拦截内网地址: ${parsed.hostname}`);
            resolve(this.fail(403, 'Forbidden', err.message));
            return;
          }
          this.logger.warn(`WebDAV 中继请求失败: ${err.message}`);
          resolve(this.fail(502, 'Bad Gateway', `中继请求失败: ${err.message}`));
        });

        if (payloadBuffer) {
          req.write(payloadBuffer);
        }
        req.end();
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`WebDAV Proxy 异常: ${errorMsg}`);
        resolve(this.fail(500, 'Internal Error', errorMsg));
      }
    });
  }
}
