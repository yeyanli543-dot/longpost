/**
 * 标准 WebDAV 客户端 (无第三方 SDK 纯原生 HTTP 实现)
 *
 * 支持与坚果云、Nextcloud、群晖 WebDAV、自建 Apache/Nginx WebDAV 等无缝互通。
 * 跨端网络层统一通过 UniversalPlatformAdapter 调度：
 * - 桌面端：由 Electron 主进程发起，规避任何 CORS 限制；
 * - 浏览器端：通过轻量后端 /api/sync/webdav-proxy 中继转发，完美消除跨域拦路虎。
 */

import { platform, type WebdavResponse } from '@/lib/platform';
import type { SyncManifest, SyncNotePayload } from '@shared/sync/sync-protocol';
import { buildBasicAuthHeader } from '@shared/sync/basic-auth';
import { APP_VERSION } from '@shared/version';
import { logger } from '@/lib/logger';

export interface WebdavConfig {
  /** WebDAV 服务器根入口，例如 https://dav.jianguoyun.com/dav/ */
  endpoint: string;
  /** WebDAV 账号 / 邮箱 */
  username: string;
  /** WebDAV 应用专用密码或凭证（严禁上传云端，仅存本地 localStorage） */
  password: string;
  /** 同步根目录，默认为 /LongPost */
  basePath?: string;
  /** 是否启用自动后台增量同步 */
  autoSync?: boolean;
}

const WEBDAV_CONFIG_STORAGE_KEY = 'lp_webdav_sync_config';

/**
 * 读取本地保存的 WebDAV 客户端配置
 */
export function getSavedWebdavConfig(): WebdavConfig | null {
  try {
    const raw = localStorage.getItem(WEBDAV_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.endpoint && parsed.username) {
      return {
        endpoint: parsed.endpoint.trim(),
        username: parsed.username.trim(),
        password: parsed.password || '',
        basePath: (parsed.basePath || '/LongPost').trim(),
        autoSync: Boolean(parsed.autoSync),
      };
    }
  } catch (err) {
    logger.warn('读取 WebDAV 配置失败', err);
  }
  return null;
}

/**
 * 保存 WebDAV 配置至本地隔离存储
 */
export function saveWebdavConfig(config: WebdavConfig): void {
  try {
    const normalized: WebdavConfig = {
      endpoint: config.endpoint.trim().replace(/\/+$/, ''),
      username: config.username.trim(),
      password: config.password,
      basePath: (config.basePath || '/LongPost').trim(),
      autoSync: Boolean(config.autoSync),
    };
    localStorage.setItem(WEBDAV_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    logger.error('保存 WebDAV 配置失败', err);
  }
}

/**
 * 清除本地 WebDAV 配置
 */
export function clearWebdavConfig(): void {
  try {
    localStorage.removeItem(WEBDAV_CONFIG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export class WebdavClient {
  private config: WebdavConfig;

  constructor(config: WebdavConfig) {
    this.config = {
      ...config,
      endpoint: config.endpoint.trim().replace(/\/+$/, ''),
      basePath: (config.basePath || '/LongPost').trim().replace(/\/+$/, ''),
    };
  }

  /**
   * 生成 Basic Auth 认证头（实现见 shared/sync/basic-auth.ts，便于单测覆盖）
   */
  private getAuthHeader(): string {
    return buildBasicAuthHeader(this.config.username, this.config.password);
  }

  /**
   * 拼接远程 URL
   */
  private buildUrl(subPath: string): string {
    const cleanSub = subPath.startsWith('/') ? subPath : `/${subPath}`;
    return `${this.config.endpoint}${cleanSub}`;
  }

  /**
   * 调度跨端平台网络通道发起 WebDAV 请求
   */
  private async request(
    subPath: string,
    method: string,
    body?: string | null,
    extraHeaders?: Record<string, string>,
  ): Promise<WebdavResponse> {
    const url = this.buildUrl(subPath);
    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      ...extraHeaders,
    };

    return platform.webdavRequest({
      url,
      method,
      headers,
      body: body ?? null,
    });
  }

  /**
   * 测试远端 WebDAV 服务器连通性与账号凭证
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      // 尝试对根目录发送 PROPFIND 深度 0 查询
      const res = await this.request('', 'PROPFIND', null, {
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      });

      if (res.ok || res.status === 207) {
        return { ok: true, message: 'WebDAV 服务器握手成功，凭证正确' };
      }

      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'WebDAV 账号或密码错误（401/403 认证未通过）' };
      }

      if (res.status === 404) {
        return { ok: false, message: 'WebDAV Endpoint 路径不存在（404 Not Found）' };
      }

      return {
        ok: false,
        message: `服务器响应状态异常: ${res.status} ${res.statusText || res.error || ''}`.trim(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `连接异常: ${msg}` };
    }
  }

  /**
   * 确保远程约定目录存在：
   * /LongPost
   * /LongPost/notes
   */
  async ensureRemoteDirectories(): Promise<boolean> {
    const rootPath = this.config.basePath || '/LongPost';
    const notesPath = `${rootPath}/notes`;

    const createDirIfNotExists = async (dirPath: string): Promise<boolean> => {
      // 检查目录是否存在
      const checkRes = await this.request(dirPath, 'PROPFIND', null, { Depth: '0' });
      if (checkRes.ok || checkRes.status === 207) {
        return true;
      }
      if (checkRes.status === 404) {
        // 创建目录
        const mkRes = await this.request(dirPath, 'MKCOL');
        return mkRes.ok || mkRes.status === 201 || mkRes.status === 405; // 405 表示已存在
      }
      return false;
    };

    const rootOk = await createDirIfNotExists(rootPath);
    if (!rootOk) {
      logger.warn(`创建远程根目录失败: ${rootPath}`);
      return false;
    }

    const notesOk = await createDirIfNotExists(notesPath);
    if (!notesOk) {
      logger.warn(`创建远程 notes 目录失败: ${notesPath}`);
      return false;
    }

    return true;
  }

  /**
   * 拉取远程同步清单 (/LongPost/manifest.json)
   */
  async getManifest(): Promise<SyncManifest | null> {
    const manifestPath = `${this.config.basePath || '/LongPost'}/manifest.json`;
    try {
      const res = await this.request(manifestPath, 'GET');
      if (res.status === 404) {
        // 远程首次同步，尚未创建 manifest.json
        return null;
      }
      if (!res.ok) {
        logger.warn(`获取远程清单失败: HTTP ${res.status}`);
        return null;
      }
      const parsed = JSON.parse(res.data);
      if (parsed && typeof parsed === 'object' && parsed.items) {
        return parsed as SyncManifest;
      }
      return null;
    } catch (err) {
      logger.error('解析远程清单 JSON 失败', err);
      return null;
    }
  }

  /**
   * 上传更新远程同步清单 (/LongPost/manifest.json)
   */
  async saveManifest(manifest: SyncManifest): Promise<boolean> {
    const manifestPath = `${this.config.basePath || '/LongPost'}/manifest.json`;
    try {
      const jsonStr = JSON.stringify(manifest, null, 2);
      const res = await this.request(manifestPath, 'PUT', jsonStr, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return res.ok || res.status === 201 || res.status === 204;
    } catch (err) {
      logger.error('上传远程清单失败', err);
      return false;
    }
  }

  /**
   * 拉取单篇远程文章内容 (/LongPost/notes/<id>.json)
   */
  async getNote(articleId: string): Promise<SyncNotePayload | null> {
    const notePath = `${this.config.basePath || '/LongPost'}/notes/${encodeURIComponent(articleId)}.json`;
    try {
      const res = await this.request(notePath, 'GET');
      if (res.status === 404 || !res.ok) {
        return null;
      }
      const parsed = JSON.parse(res.data);
      return parsed as SyncNotePayload;
    } catch (err) {
      logger.error(`拉取远程文章失败 [${articleId}]`, err);
      return null;
    }
  }

  /**
   * 上传推送单篇文章内容 (/LongPost/notes/<id>.json)
   */
  async saveNote(note: SyncNotePayload): Promise<boolean> {
    const notePath = `${this.config.basePath || '/LongPost'}/notes/${encodeURIComponent(note.id)}.json`;
    try {
      const jsonStr = JSON.stringify(note, null, 2);
      const res = await this.request(notePath, 'PUT', jsonStr, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return res.ok || res.status === 201 || res.status === 204;
    } catch (err) {
      logger.error(`推送文章至远程失败 [${note.id}]`, err);
      return false;
    }
  }

  /**
   * 删除远端文章文件 (/LongPost/notes/<id>.json)
   */
  async deleteNote(articleId: string): Promise<boolean> {
    const notePath = `${this.config.basePath || '/LongPost'}/notes/${encodeURIComponent(articleId)}.json`;
    try {
      const res = await this.request(notePath, 'DELETE');
      return res.ok || res.status === 404; // 404 认为已被删
    } catch (err) {
      logger.warn(`删除远程文件失败 [${articleId}]`, err);
      return false;
    }
  }

  /**
   * 一键上传全库单文件 JSON 备份快照 (/LongPost/longpost-backup.json)
   *
   * 与逐篇 note 的增量同步互补：备份是"这一刻的全量快照"，
   * 换机、误删、同步协议升级时都可以用它一把恢复。
   */
  async uploadFullBackup(): Promise<{ ok: boolean; count: number; message: string }> {
    try {
      await this.ensureRemoteDirectories();
      const articles = await platform.listArticlesLocal();
      const backupPayload = JSON.stringify(
        {
          version: APP_VERSION,
          exportedAt: new Date().toISOString(),
          documents: articles,
        },
        null,
        2,
      );
      const backupPath = `${this.config.basePath || '/LongPost'}/longpost-backup.json`;
      const res = await this.request(backupPath, 'PUT', backupPayload, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      if (res.ok || res.status === 201 || res.status === 204) {
        return {
          ok: true,
          count: articles.length,
          message: `已成功备份 ${articles.length} 篇长文至 WebDAV`,
        };
      }
      return {
        ok: false,
        count: 0,
        message: `WebDAV 备份上传失败: HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, count: 0, message: `备份异常: ${msg}` };
    }
  }

  /**
   * 从 WebDAV 拉取单文件 JSON 备份并合并恢复到本地文档库
   *
   * 注意是"合并"不是"清空替换"：本地已有的文章不会被备份里的旧版本覆盖，
   * 只有本地缺失的才会补进来，避免一次误操作抹掉本地更新的内容。
   */
  async restoreFullBackup(): Promise<{ ok: boolean; restoredCount: number; message: string }> {
    try {
      const backupPath = `${this.config.basePath || '/LongPost'}/longpost-backup.json`;
      const res = await this.request(backupPath, 'GET', null, {
        Accept: 'application/json',
      });
      if (!res.ok) {
        return {
          ok: false,
          restoredCount: 0,
          message:
            res.status === 404
              ? '远端尚未创建全量备份文件 (longpost-backup.json)'
              : `拉取备份失败: HTTP ${res.status}`,
        };
      }
      const parsed = JSON.parse(res.data);
      const docs = Array.isArray(parsed) ? parsed : parsed?.documents;
      if (!Array.isArray(docs)) {
        return { ok: false, restoredCount: 0, message: '备份文件格式无效：未找到文档数组' };
      }
      const existing = await platform.listArticlesLocal();
      const existingIds = new Set(existing.map((a) => a.id).filter(Boolean));

      let restoredCount = 0;
      for (const d of docs) {
        if (!d || typeof d.title !== 'string' || typeof d.content !== 'string') continue;
        if (d.id && existingIds.has(d.id)) continue; // 本地已有，跳过，绝不覆盖
        await platform.saveArticleLocal({
          id: d.id,
          title: d.title,
          content: d.content,
          tags: d.tags,
          excerpt: d.excerpt,
          createdAt: d.createdAt || d.updatedAt,
        });
        restoredCount++;
      }
      return {
        ok: true,
        restoredCount,
        message:
          restoredCount === 0
            ? '备份中的文章本地都已存在，无需恢复'
            : `已从 WebDAV 成功恢复 ${restoredCount} 篇长文`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, restoredCount: 0, message: `恢复备份异常: ${msg}` };
    }
  }
}
