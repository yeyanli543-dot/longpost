/**
 * 跨设备数据同步协调器 (Sync Coordinator)
 *
 * 核心机制：
 * 1. 严格的三向对比裁决引擎 (Three-Way Merge)：本地最新 vs 远程最新 vs 上次同步基准快照 (Base Snapshot)；
 * 2. 冲突绝对保护：检测到双端并发修改时，绝不静默覆盖，自动将本地副本另存为“原标题 (冲突备份-设备名-时间戳)”；
 * 3. 墓碑软删除 (Tombstones)：精确追踪跨端删除，杜绝旧设备将已删除长文复活；
 * 4. 零阻塞与状态订阅：通过 EventListener 机制对外广播同步状态与进度。
 */

import {
  type SyncManifest,
  type SyncNotePayload,
  type SyncBaseSnapshot,
  type SyncResult,
  type SyncManifestItem,
  computeContentChecksum,
  getOrCreateDeviceId,
  getDeviceName,
  formatConflictTitle,
} from '@shared/sync/sync-protocol';
import { decideThreeWayAction } from '@shared/sync/three-way-merge';
import {
  WebdavClient,
  getSavedWebdavConfig,
  type WebdavConfig,
} from './webdav-client';
import { platform, type DesktopArticlePayload } from '@/lib/platform';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

export type SyncState = 'idle' | 'checking' | 'syncing' | 'success' | 'error';

export interface SyncStatusChangeEvent {
  state: SyncState;
  progress?: { current: number; total: number; message: string };
  lastResult?: SyncResult | null;
  error?: string | null;
}

type SyncListener = (event: SyncStatusChangeEvent) => void;

const IDB_SYNC_DB_NAME = 'lp_sync_db';
const IDB_SYNC_STORE_NAME = 'sync_meta';
const IDB_BASE_SNAPSHOT_KEY = 'base_snapshot';
const LAST_SYNC_RESULT_KEY = 'lp_last_sync_result';

function openSyncIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_SYNC_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_SYNC_STORE_NAME)) {
          db.createObjectStore(IDB_SYNC_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        logger.warn('打开 IndexedDB 同步数据库失败', request.error);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

async function getIdbBaseSnapshot(): Promise<SyncBaseSnapshot> {
  const db = await openSyncIdb();
  if (!db) {
    return { lastSyncAt: 0, items: {} };
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_SYNC_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_SYNC_STORE_NAME);
      const req = store.get(IDB_BASE_SNAPSHOT_KEY);
      req.onsuccess = () => {
        if (req.result && typeof req.result === 'object' && req.result.items) {
          resolve(req.result as SyncBaseSnapshot);
        } else {
          resolve({ lastSyncAt: 0, items: {} });
        }
      };
      req.onerror = () => resolve({ lastSyncAt: 0, items: {} });
    } catch {
      resolve({ lastSyncAt: 0, items: {} });
    }
  });
}

async function saveIdbBaseSnapshot(snapshot: SyncBaseSnapshot): Promise<void> {
  const db = await openSyncIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_SYNC_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_SYNC_STORE_NAME);
      const req = store.put(snapshot, IDB_BASE_SNAPSHOT_KEY);
      req.onsuccess = () => resolve();
      req.onerror = (e) => {
        logger.error('保存同步基准快照至 IndexedDB 失败', e);
        resolve();
      };
    } catch (err) {
      logger.error('保存同步基准快照至 IndexedDB 异常', err);
      resolve();
    }
  });
}

export class SyncCoordinator {
  private state: SyncState = 'idle';
  private listeners: Set<SyncListener> = new Set();
  private lastResult: SyncResult | null = null;
  private syncInProgress = false;

  constructor() {
    // 恢复上次同步快照与结果
    try {
      const savedRes = localStorage.getItem(LAST_SYNC_RESULT_KEY);
      if (savedRes) {
        this.lastResult = JSON.parse(savedRes);
      }
    } catch {
      // ignore
    }
  }

  /**
   * 订阅同步状态变化
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // 立即通知当前状态
    listener({
      state: this.state,
      lastResult: this.lastResult,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(change: Partial<SyncStatusChangeEvent>) {
    const event: SyncStatusChangeEvent = {
      state: this.state,
      lastResult: this.lastResult,
      ...change,
    };
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        logger.error('Sync listener error', err);
      }
    });
  }

  /**
   * 读取本地基准快照（严格持久化在 IndexedDB，严禁塞入 localStorage）
   */
  private async getBaseSnapshot(): Promise<SyncBaseSnapshot> {
    return getIdbBaseSnapshot();
  }

  /**
   * 保存本地基准快照（严格持久化在 IndexedDB，严禁塞入 localStorage）
   */
  private async saveBaseSnapshot(snapshot: SyncBaseSnapshot): Promise<void> {
    return saveIdbBaseSnapshot(snapshot);
  }

  /**
   * 执行全量跨设备三向同步
   * @param customConfig 可选的自定义 WebDAV 配置
   * @param activeDraft 可选的正在前台编辑中的草稿内容，确保正在输入的文本绝不丢失
   */
  async triggerSync(
    customConfig?: WebdavConfig,
    activeDraft?: { id?: string; title?: string; content?: string },
  ): Promise<SyncResult> {
    if (this.syncInProgress) {
      toast.info('同步任务正在执行中，请稍候...');
      return (
        this.lastResult || {
          success: false,
          timestamp: Date.now(),
          pulledCount: 0,
          pushedCount: 0,
          conflictedCount: 0,
          deletedCount: 0,
          conflicts: [],
          errors: ['同步正在进行中'],
        }
      );
    }

    const config = customConfig || getSavedWebdavConfig();
    if (!config || !config.endpoint || !config.username) {
      const errMsg = '尚未配置 WebDAV 远端服务器，请在同步设置中填入信息';
      toast.error(errMsg);
      return {
        success: false,
        timestamp: Date.now(),
        pulledCount: 0,
        pushedCount: 0,
        conflictedCount: 0,
        deletedCount: 0,
        conflicts: [],
        errors: [errMsg],
      };
    }

    this.syncInProgress = true;
    this.state = 'checking';
    this.notify({ state: 'checking' });

    const result: SyncResult = {
      success: false,
      timestamp: Date.now(),
      pulledCount: 0,
      pushedCount: 0,
      conflictedCount: 0,
      deletedCount: 0,
      conflicts: [],
      errors: [],
    };

    const client = new WebdavClient(config);

    try {
      // 1. 确保远程目录存在
      this.notify({
        state: 'checking',
        progress: { current: 1, total: 10, message: '正在连接并初始化 WebDAV 远端目录...' },
      });
      const dirOk = await client.ensureRemoteDirectories();
      if (!dirOk) {
        throw new Error('无法在 WebDAV 服务器上创建或访问 /LongPost 同步目录，请检查权限');
      }

      // 2. 读取远程清单
      this.notify({
        state: 'checking',
        progress: { current: 2, total: 10, message: '正在拉取远端同步清单...' },
      });
      const remoteManifest = (await client.getManifest()) || {
        deviceId: getOrCreateDeviceId(),
        deviceName: getDeviceName(),
        version: 1,
        updatedAt: Date.now(),
        items: {},
      };

      // 3. 读取本地所有文章与基准快照
      this.notify({
        state: 'syncing',
        progress: { current: 3, total: 10, message: '正在扫描本地文章与版本快照...' },
      });
      const localArticles = await platform.listArticlesLocal();
      const localArticleMap = new Map<string, DesktopArticlePayload>();
      const localChecksumMap = new Map<string, string>();

      for (const art of localArticles) {
        if (art.id) {
          localArticleMap.set(art.id, art);
          // 计算本地内容哈希
          const checksum = await computeContentChecksum(art.content || '');
          localChecksumMap.set(art.id, checksum);
        }
      }

      // 如果提供了前台正在活跃编辑中的内存草稿，强制作为最新本地状态比对，绝不丢失正在输入的键入内容
      if (activeDraft && activeDraft.id && activeDraft.content) {
        const existing = localArticleMap.get(activeDraft.id);
        const merged: DesktopArticlePayload = {
          ...existing,
          id: activeDraft.id,
          title: activeDraft.title || existing?.title || '正在编辑的文章',
          content: activeDraft.content,
        };
        localArticleMap.set(activeDraft.id, merged);
        const activeChecksum = await computeContentChecksum(activeDraft.content);
        localChecksumMap.set(activeDraft.id, activeChecksum);
      }

      const baseSnapshot = await this.getBaseSnapshot();
      const updatedBaseItems: Record<
        string,
        { rev: number; checksum: string; updatedAt: number; isDeleted?: boolean }
      > = { ...baseSnapshot.items };

      // 4. 收集需要裁决的所有文章 ID 全集
      const allArticleIds = new Set<string>([
        ...localArticleMap.keys(),
        ...Object.keys(remoteManifest.items),
        ...Object.keys(baseSnapshot.items),
      ]);

      const totalItems = allArticleIds.size;
      let processedCount = 0;

      // 5. 循环三向对比裁决
      for (const id of allArticleIds) {
        processedCount++;
        this.notify({
          state: 'syncing',
          progress: {
            current: Math.min(9, 3 + Math.floor((processedCount / (totalItems || 1)) * 6)),
            total: 10,
            message: `正在三向比对第 ${processedCount}/${totalItems} 篇文章...`,
          },
        });

        const localArticle = localArticleMap.get(id);
        const localChecksum = localChecksumMap.get(id);
        const remoteItem: SyncManifestItem | undefined = remoteManifest.items[id];
        const baseItem = baseSnapshot.items[id];

        // 三向裁决交给纯函数：只吃元数据，不碰网络与存储
        const decision = decideThreeWayAction({
          hasLocal: Boolean(localArticle),
          localChecksum,
          baseItem,
          remoteItem,
        });

        switch (decision.action) {
          // A1a. 删改冲突：远端在本地删除后被改过 -> 放弃删除，拉回远端版本
          case 'PULL_DELETE_CONFLICT': {
            const remoteNote = await client.getNote(id);
            if (remoteNote) {
              await platform.saveArticleLocal({
                id: remoteNote.id,
                title: remoteNote.title,
                content: remoteNote.content,
                tags: remoteNote.tags,
                createdAt: remoteNote.createdAt,
              });
              updatedBaseItems[id] = {
                rev: remoteNote.rev,
                checksum: remoteNote.checksum,
                updatedAt: remoteNote.updatedAt,
                isDeleted: false,
              };
              result.pulledCount++;
              logger.info(`删改冲突：远端更新优先拉回 [${remoteNote.title}]`);
            }
            break;
          }

          // A1b. 正常本地删除：向远端发送墓碑 Tombstone
          case 'PUSH_TOMBSTONE': {
            remoteManifest.items[id] = {
              rev: (remoteItem?.rev || baseItem?.rev || 0) + 1,
              updatedAt: Date.now(),
              checksum: '',
              isDeleted: true,
              title: baseItem?.checksum ? '已删除文章' : undefined,
            };
            await client.deleteNote(id);
            updatedBaseItems[id] = {
              rev: remoteManifest.items[id].rev,
              checksum: '',
              updatedAt: Date.now(),
              isDeleted: true,
            };
            result.deletedCount++;
            break;
          }

          // A2. 远端存在未删除的新文章 -> 拉取到本地
          case 'PULL_NEW': {
            const remoteNote = await client.getNote(id);
            if (remoteNote && !remoteNote.isDeleted) {
              await platform.saveArticleLocal({
                id: remoteNote.id,
                title: remoteNote.title,
                content: remoteNote.content,
                tags: remoteNote.tags,
                createdAt: remoteNote.createdAt,
              });
              updatedBaseItems[id] = {
                rev: remoteNote.rev,
                checksum: remoteNote.checksum,
                updatedAt: remoteNote.updatedAt,
                isDeleted: false,
              };
              result.pulledCount++;
            }
            break;
          }

          // B1. 远端已墓碑删除，但本地在删除后又改过 -> 撤销删除，本地优先复活并推送
          case 'REVIVE_AND_PUSH': {
            const newRev = (remoteItem?.rev || 0) + 1;
            const newPayload: SyncNotePayload = {
              id,
              title: localArticle!.title,
              content: localArticle!.content,
              tags: localArticle!.tags,
              createdAt: localArticle!.createdAt,
              updatedAt: Date.now(),
              rev: newRev,
              checksum: localChecksum || '',
              isDeleted: false,
            };
            await client.saveNote(newPayload);
            remoteManifest.items[id] = {
              rev: newRev,
              updatedAt: newPayload.updatedAt,
              checksum: newPayload.checksum,
              isDeleted: false,
              title: localArticle!.title,
            };
            updatedBaseItems[id] = {
              rev: newRev,
              checksum: newPayload.checksum,
              updatedAt: newPayload.updatedAt,
              isDeleted: false,
            };
            result.pushedCount++;
            break;
          }

          // B2. 本地跟随远端执行删除
          case 'DELETE_LOCAL': {
            await platform.deleteArticleLocal(id);
            updatedBaseItems[id] = {
              rev: remoteItem?.rev || 0,
              checksum: '',
              updatedAt: Date.now(),
              isDeleted: true,
            };
            result.deletedCount++;
            break;
          }

          // C1. 两端哈希完全一致 -> 已经同步，无需传输
          case 'NOOP': {
            if (remoteItem) {
              updatedBaseItems[id] = {
                rev: remoteItem.rev,
                checksum: localChecksum || '',
                updatedAt: remoteItem.updatedAt,
                isDeleted: false,
              };
            }
            break;
          }

          // C2. 仅本地修改 -> 推送到远程
          case 'PUSH_UPDATE': {
            const nextRev = (remoteItem?.rev || baseItem?.rev || 0) + 1;
            const notePayload: SyncNotePayload = {
              id,
              title: localArticle!.title,
              content: localArticle!.content,
              tags: localArticle!.tags,
              createdAt: localArticle!.createdAt,
              updatedAt: Date.now(),
              rev: nextRev,
              checksum: localChecksum || '',
              isDeleted: false,
            };

            const saveOk = await client.saveNote(notePayload);
            if (saveOk) {
              remoteManifest.items[id] = {
                rev: nextRev,
                updatedAt: notePayload.updatedAt,
                checksum: notePayload.checksum,
                title: localArticle!.title,
                isDeleted: false,
              };
              updatedBaseItems[id] = {
                rev: nextRev,
                checksum: notePayload.checksum,
                updatedAt: notePayload.updatedAt,
                isDeleted: false,
              };
              result.pushedCount++;
            } else {
              result.errors.push(`推送文章 [${localArticle!.title}] 失败`);
            }
            break;
          }

          // C3. 仅远程修改 -> 拉取到本地
          case 'PULL_UPDATE': {
            const remoteNote = await client.getNote(id);
            if (remoteNote) {
              await platform.saveArticleLocal({
                id: remoteNote.id,
                title: remoteNote.title,
                content: remoteNote.content,
                tags: remoteNote.tags,
                createdAt: remoteNote.createdAt,
              });
              updatedBaseItems[id] = {
                rev: remoteNote.rev,
                checksum: remoteNote.checksum,
                updatedAt: remoteNote.updatedAt,
                isDeleted: false,
              };
              result.pulledCount++;
            }
            break;
          }

          // C4. 双端并发同时修改 (冲突防护机制触发)
          case 'CONFLICT_BACKUP': {
            logger.warn(`检测到双端并发冲突 [${localArticle!.title}]，启动冲突保护另存机制`);

            // 1. 本地当前版本另存为新的独立冲突备份文章
            const backupTitle = formatConflictTitle(localArticle!.title, getDeviceName(), new Date());
            const backupId = `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            await platform.saveArticleLocal({
              ...localArticle!,
              id: backupId,
              title: backupTitle,
            });

            // 2. 将远程版本安全拉取并覆写当前主 ID
            const remoteNote = await client.getNote(id);
            if (remoteNote) {
              await platform.saveArticleLocal({
                id: remoteNote.id,
                title: remoteNote.title,
                content: remoteNote.content,
                tags: remoteNote.tags,
                createdAt: remoteNote.createdAt,
              });
              updatedBaseItems[id] = {
                rev: remoteNote.rev,
                checksum: remoteNote.checksum,
                updatedAt: remoteNote.updatedAt,
                isDeleted: false,
              };
              result.pulledCount++;
            }

            result.conflictedCount++;
            result.conflicts.push({
              articleId: id,
              originalTitle: localArticle!.title,
              backupArticleId: backupId,
              backupTitle,
              reason: '双端内容均被修改且互不相同，已将本地版本另存为独立备份',
            });

            toast.warning(`检测到冲突：《${localArticle!.title}》，已自动另存本地备份《${backupTitle}》`);
            break;
          }

          // C5. 首次创建（本地新文章，远程无此记录）
          case 'PUSH_NEW': {
            const initRev = 1;
            const notePayload: SyncNotePayload = {
              id,
              title: localArticle!.title,
              content: localArticle!.content,
              tags: localArticle!.tags,
              createdAt: localArticle!.createdAt,
              updatedAt: Date.now(),
              rev: initRev,
              checksum: localChecksum || '',
              isDeleted: false,
            };
            const saveOk = await client.saveNote(notePayload);
            if (saveOk) {
              remoteManifest.items[id] = {
                rev: initRev,
                updatedAt: notePayload.updatedAt,
                checksum: notePayload.checksum,
                title: localArticle!.title,
                isDeleted: false,
              };
              updatedBaseItems[id] = {
                rev: initRev,
                checksum: notePayload.checksum,
                updatedAt: notePayload.updatedAt,
                isDeleted: false,
              };
              result.pushedCount++;
            }
            break;
          }
        }
      }

      // 6. 回写远端同步清单与本地快照
      remoteManifest.updatedAt = Date.now();
      remoteManifest.deviceId = getOrCreateDeviceId();
      remoteManifest.deviceName = getDeviceName();
      await client.saveManifest(remoteManifest);

      await this.saveBaseSnapshot({
        lastSyncAt: Date.now(),
        items: updatedBaseItems,
      });

      result.success = true;
      this.lastResult = result;
      localStorage.setItem(LAST_SYNC_RESULT_KEY, JSON.stringify(result));

      this.state = 'success';
      this.notify({ state: 'success', lastResult: result });

      // 汇总提示
      const summaryParts = [];
      if (result.pulledCount > 0) summaryParts.push(`拉取 ${result.pulledCount} 篇`);
      if (result.pushedCount > 0) summaryParts.push(`推送 ${result.pushedCount} 篇`);
      if (result.conflictedCount > 0) summaryParts.push(`冲突保护备份 ${result.conflictedCount} 篇`);
      if (result.deletedCount > 0) summaryParts.push(`清理删除 ${result.deletedCount} 篇`);

      const summaryText = summaryParts.length > 0 ? summaryParts.join('，') : '双端已是最新状态';
      toast.success(`跨端同步完成：${summaryText}`);

      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('跨设备同步发生严重错误', err);
      result.errors.push(errorMsg);
      result.success = false;
      this.lastResult = result;
      this.state = 'error';
      this.notify({ state: 'error', error: errorMsg, lastResult: result });
      toast.error(`同步失败: ${errorMsg}`);
      return result;
    } finally {
      this.syncInProgress = false;
    }
  }

  getLastResult(): SyncResult | null {
    return this.lastResult;
  }

  getState(): SyncState {
    return this.state;
  }
}

export const syncCoordinator = new SyncCoordinator();
