/**
 * 跨设备数据同步协议 (Sync Protocol)
 *
 * 规范 LongPost 在 Web、桌面端和移动端之间的三向同步基准、清单格式与冲突保护。
 * 支持 WebDAV（如坚果云、NextCloud、自建 WebDAV）与本地无状态多端漫游。
 */

/** 单篇文章同步元数据条目 */
export interface SyncManifestItem {
  /** 单调递增的版本号 */
  rev: number;
  /** 最后修改时间戳（毫秒） */
  updatedAt: number;
  /** 正文内容 SHA-256 校验和 */
  checksum: string;
  /** 软删除标记（Tombstone），防止旧设备重新推回已删除文章 */
  isDeleted?: boolean;
  /** 文章标题（供清单概览展示） */
  title?: string;
}

/** 远端同步总清单 (存储于 /LongPost/manifest.json) */
export interface SyncManifest {
  /** 写入清单的设备标识 */
  deviceId: string;
  /** 写入清单的设备名称 */
  deviceName?: string;
  /** 清单版本协议 */
  version: number;
  /** 清单更新时间戳 */
  updatedAt: number;
  /** 文章 ID 到元数据的映射 */
  items: Record<string, SyncManifestItem>;
}

/** 单篇文章同步传输包 (存储于 /LongPost/notes/<id>.json) */
export interface SyncNotePayload {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  excerpt?: string;
  createdAt?: string;
  updatedAt: number;
  rev: number;
  checksum: string;
  isDeleted?: boolean;
}

/** 本地同步基准快照 (记录上次成功同步时的三向对比基准) */
export interface SyncBaseSnapshot {
  lastSyncAt: number;
  items: Record<
    string,
    {
      rev: number;
      checksum: string;
      updatedAt: number;
      isDeleted?: boolean;
    }
  >;
}

/** 同步结果与冲突裁决报告 */
export interface SyncResult {
  success: boolean;
  timestamp: number;
  pulledCount: number;
  pushedCount: number;
  conflictedCount: number;
  deletedCount: number;
  conflicts: Array<{
    articleId: string;
    originalTitle: string;
    backupArticleId: string;
    backupTitle: string;
    reason: string;
  }>;
  errors: string[];
}

/**
 * 基于 Web Crypto API 计算正文或字符串的 SHA-256 Checksum
 * 兼容现代浏览器与 Node.js 18+ 环境，零外部依赖
 */
export async function computeContentChecksum(content: string): Promise<string> {
  const normalized = content || '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 极罕见旧环境备选（FNV-1a 64位哈希扩展至 64 字符十六进制，确保强确定性）
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x1000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2).repeat(4).slice(0, 64);
}

/**
 * 获取或持久化生成本机设备 ID
 */
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'lp_sync_device_id';
  try {
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    }
  } catch {
    // ignore
  }
  return `dev_${Date.now().toString(36)}`;
}

/**
 * 获取友好的设备名称（例如 "MacBook", "Windows", "Chrome on Windows"）
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Node Device';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Web Client';
}

/**
 * 格式化冲突备份文章标题
 * 遵循规范：原标题 (冲突备份-设备名-YYYYMMDD-HHmm)
 */
export function formatConflictTitle(
  originalTitle: string,
  deviceName: string = getDeviceName(),
  date: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const timeStr = `${yyyy}${mm}${dd}-${hh}${min}`;
  const baseTitle = originalTitle.trim() || '未命名文章';
  return `${baseTitle} (冲突备份-${deviceName}-${timeStr})`;
}
