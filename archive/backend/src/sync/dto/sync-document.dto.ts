export interface SyncDocumentDto {
  id: string;
  title: string;
  content: string;
  version: number;
  deleted?: boolean;
  updatedAt: string;
  dirty?: boolean;
}

export interface SyncConflict {
  id: string;
  reason: 'id_collision' | 'stale_version' | string;
}

export interface SyncPushResult {
  success: boolean;
  updated: Array<{ id: string; version: number; updatedAt: string }>;
  conflicts: SyncConflict[];
}

export interface SyncPullResult {
  docs: Array<{
    id: string;
    userId: string;
    title: string;
    content: string;
    version: number;
    deleted: boolean;
    updatedAt: string;
  }>;
  serverTime: string;
}
