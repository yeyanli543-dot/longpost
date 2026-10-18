import { Injectable } from '@nestjs/common';
import { SyncDocumentDto, SyncPushResult, SyncPullResult, SyncConflict } from './dto/sync-document.dto';

export interface StoredDocument {
  id: string;
  userId: string;
  title: string;
  content: string;
  version: number;
  deleted: boolean;
  updatedAt: Date;
  createdAt: Date;
}

@Injectable()
export class SyncService {
  // In-memory / Drizzle store for documents
  private documentsMap: Map<string, StoredDocument> = new Map();

  async pushChanges(userId: string, docs: SyncDocumentDto[]): Promise<SyncPushResult> {
    const conflicts: SyncConflict[] = [];
    const updated: Array<{ id: string; version: number; updatedAt: string }> = [];

    for (const doc of docs) {
      const existing = this.documentsMap.get(doc.id);

      if (existing) {
        // 1. 若记录已存在但 existing.userId !== userId，说明发生跨用户 ID 碰撞或越权推送，记入 conflicts 并 continue
        if (existing.userId !== userId) {
          conflicts.push({
            id: doc.id,
            reason: 'id_collision'
          });
          continue;
        }

        // 2. 若记录存在且属于当前用户，当客户端版本与时间落后时记入 conflicts (stale_version)
        const incomingUpdatedAt = new Date(doc.updatedAt);
        if (incomingUpdatedAt < existing.updatedAt && doc.version < existing.version) {
          conflicts.push({
            id: doc.id,
            reason: 'stale_version'
          });
          continue;
        }

        // 正常更新，并设置 version 为 Math.max(existing.version, doc.version) + 1
        const nextVersion = Math.max(existing.version, doc.version) + 1;
        const now = new Date();
        const updatedRecord: StoredDocument = {
          ...existing,
          title: doc.title,
          content: doc.content,
          deleted: Boolean(doc.deleted),
          version: nextVersion,
          updatedAt: now
        };
        this.documentsMap.set(doc.id, updatedRecord);
        updated.push({
          id: doc.id,
          version: nextVersion,
          updatedAt: now.toISOString()
        });
      } else {
        // 3. 记录不存在，执行插入
        const now = new Date();
        const initialVersion = Math.max(1, doc.version);
        const newRecord: StoredDocument = {
          id: doc.id,
          userId,
          title: doc.title,
          content: doc.content,
          deleted: Boolean(doc.deleted),
          version: initialVersion,
          updatedAt: now,
          createdAt: now
        };
        this.documentsMap.set(doc.id, newRecord);
        updated.push({
          id: doc.id,
          version: initialVersion,
          updatedAt: now.toISOString()
        });
      }
    }

    return {
      success: true,
      updated,
      conflicts
    };
  }

  async pullChanges(userId: string, since?: string): Promise<SyncPullResult> {
    // 1. 在执行查询之前先记录 serverTime，避免查询期间写入的数据在下一次增量拉取时漏掉
    const serverTime = new Date().toISOString();

    const userDocs = Array.from(this.documentsMap.values()).filter(d => d.userId === userId);

    let filtered = userDocs;
    if (since) {
      const sinceDate = new Date(since);
      // 2. 将增量过滤条件使用 gte(documents.updatedAt, sinceDate)，防止同一毫秒内更新的多篇文档被漏拉取
      filtered = userDocs.filter(d => d.updatedAt.getTime() >= sinceDate.getTime());
    }

    return {
      docs: filtered.map(d => ({
        id: d.id,
        userId: d.userId,
        title: d.title,
        content: d.content,
        version: d.version,
        deleted: d.deleted,
        updatedAt: d.updatedAt.toISOString()
      })),
      serverTime
    };
  }
}
