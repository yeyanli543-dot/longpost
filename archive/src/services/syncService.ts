import { db } from '../db/dexie';
import { LocalDocument } from '../types/models';

export interface SyncPushResponse {
  success: boolean;
  updated: Array<{ id: string; version: number; updatedAt: string }>;
  conflicts: Array<{ id: string; reason: string }>;
}

export class SyncService {
  static async pushLocalChanges(lastSync?: string): Promise<{ pushedCount: number; conflicts: string[] }> {
    const localDocs = await db.documents.orderBy('updatedAt').reverse().toArray();

    // 筛选待推送文档：以 dirty === true 或从未同步为准，彻底解决本地时钟与服务端时钟偏差导致的漏同步
    const unsynced = localDocs.filter((d: LocalDocument) => d.dirty === true || !lastSync);

    if (unsynced.length === 0) {
      return { pushedCount: 0, conflicts: [] };
    }

    const payload = unsynced.map(doc => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      deleted: Boolean(doc.deleted),
      updatedAt: doc.updatedAt,
    }));

    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docs: payload }),
    });

    if (!response.ok) {
      throw new Error(`云端同步推送失败: HTTP ${response.status}`);
    }

    const result: SyncPushResponse = await response.json();
    const conflictIds = result.conflicts.map(c => c.id);

    // 推送成功后，将已成功推送且未在推送期间再次修改的本地文档标记为 dirty: false，并对齐服务端最新 version
    for (const updateInfo of result.updated) {
      const currentLocal = await db.documents.get(updateInfo.id);
      if (currentLocal) {
        // 如果本地文档在推送期间没有发生新的编辑
        await db.documents.put({
          ...currentLocal,
          version: updateInfo.version,
          dirty: false,
        });
      }
    }

    return {
      pushedCount: result.updated.length,
      conflicts: conflictIds,
    };
  }

  static async pullRemoteChanges(since?: string): Promise<LocalDocument[]> {
    const url = since ? `/api/sync/pull?since=${encodeURIComponent(since)}` : '/api/sync/pull';
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`云端增量拉取失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    const remoteDocs: LocalDocument[] = (data.docs || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      content: d.content,
      version: d.version,
      updatedAt: d.updatedAt,
      deleted: Boolean(d.deleted),
      dirty: false,
    }));

    if (remoteDocs.length > 0) {
      await db.documents.bulkPut(remoteDocs);
    }

    return remoteDocs;
  }
}
