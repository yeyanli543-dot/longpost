import { WebDavConfig, LocalDocument } from '../types/models';
import { db } from '../db/dexie';

export class WebDavClientService {
  private static buildAuthHeader(username: string, password: string): string {
    return 'Basic ' + btoa(`${username}:${password}`);
  }

  /**
   * 测试 WebDAV 连通性，严格携带 Depth: 0 头兼容各类 WebDAV 服务器
   */
  static async testWebDavConnection(config: WebDavConfig): Promise<{ ok: boolean; status?: number }> {
    const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

    if (isElectron) {
      // 桌面端直连
      const res = await fetch(config.endpoint, {
        method: 'PROPFIND',
        headers: {
          Authorization: this.buildAuthHeader(config.username, config.password),
          Depth: '0',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      return { ok: res.ok || res.status === 207, status: res.status };
    }

    // 网页端通过后端代理
    const res = await fetch('/api/webdav/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: config.endpoint,
        username: config.username,
        password: config.password,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`WebDAV 测试失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    return { ok: data.ok, status: data.status };
  }

  /**
   * 上传全量备份至 WebDAV
   */
  static async uploadBackupToWebDav(config: WebDavConfig): Promise<{ ok: boolean; count: number }> {
    const docs = await db.documents.orderBy('updatedAt').reverse().toArray();
    const payload = JSON.stringify({
      version: '2.9.6',
      exportedAt: new Date().toISOString(),
      documents: docs,
    }, null, 2);

    const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

    if (isElectron) {
      const targetUrl = new URL(
        'longpost-backup.json',
        config.endpoint.endsWith('/') ? config.endpoint : `${config.endpoint}/`
      );
      const res = await fetch(targetUrl.toString(), {
        method: 'PUT',
        headers: {
          Authorization: this.buildAuthHeader(config.username, config.password),
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: payload,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      return { ok: res.ok, count: docs.length };
    }

    const res = await fetch('/api/webdav/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: config.endpoint,
        username: config.username,
        password: config.password,
        filename: 'longpost-backup.json',
        payload,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(`WebDAV 备份上传失败: HTTP ${res.status}`);
    }
    return { ok: true, count: docs.length };
  }

  /**
   * 从 WebDAV 下载并恢复备份，将文档合并入本地数据库
   */
  static async restoreBackupFromWebDav(config: WebDavConfig): Promise<{ ok: boolean; restoredCount: number }> {
    let jsonText = '';
    const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

    if (isElectron) {
      const targetUrl = new URL(
        'longpost-backup.json',
        config.endpoint.endsWith('/') ? config.endpoint : `${config.endpoint}/`
      );
      const res = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: this.buildAuthHeader(config.username, config.password),
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        throw new Error(`WebDAV 下载备份失败: HTTP ${res.status}`);
      }
      jsonText = await res.text();
    } else {
      const res = await fetch('/api/webdav/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: config.endpoint,
          username: config.username,
          password: config.password,
          filename: 'longpost-backup.json',
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        throw new Error(`WebDAV 下载备份失败: HTTP ${res.status}`);
      }
      const data = await res.json();
      jsonText = data.payload || '{}';
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('解析 WebDAV 备份数据失败：不是有效的 JSON 格式');
    }

    const docs: LocalDocument[] = Array.isArray(parsed) ? parsed : parsed.documents;
    if (!Array.isArray(docs)) {
      throw new Error('备份文件中未找到有效的文档列表');
    }

    const validDocs = docs.filter(d => d && typeof d.id === 'string' && typeof d.content === 'string');
    await db.documents.bulkPut(validDocs);

    return {
      ok: true,
      restoredCount: validDocs.length,
    };
  }
}
