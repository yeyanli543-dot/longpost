/**
 * 本地优先 (Local-First) 离线存储管理库
 * 确保断网、未登录、或纯本地单机模式下，创作的数据 100% 安全持久化在用户设备中。
 * 内置防抖竞态锁 (pendingDraftSnapshot + flushPendingSave)，彻底杜绝切换草稿时发生跨文档覆盖。
 */

export interface LocalArticleDraft {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  coverUrl?: string;
  tags?: string[];
  version?: number;
  dirty?: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'longpost_local_drafts_v1';
const AUTOSAVE_KEY = 'longpost_active_autosave';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDraftSnapshot: Omit<LocalArticleDraft, 'updatedAt'> | null = null;

export class LocalFirstStore {
  /** 立即冲刷尚未触发定时器的挂起修改，防止切换文档时发生闭包跨文档覆盖 */
  static flushPendingSave(): LocalArticleDraft | null {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingDraftSnapshot) {
      const toWrite = pendingDraftSnapshot;
      pendingDraftSnapshot = null;
      return this.saveDraft(toWrite);
    }
    return null;
  }

  /** 防抖保存指定草稿（闭包严格绑定目标草稿快照） */
  static scheduleDraftSave(
    draft: Omit<LocalArticleDraft, 'updatedAt'>,
    delayMs = 500,
    onSaved?: (saved: LocalArticleDraft) => void,
  ): void {
    // 若切换了不同 ID 的草稿，先立即落盘上一篇草稿
    if (pendingDraftSnapshot && pendingDraftSnapshot.id !== draft.id) {
      this.flushPendingSave();
    }
    pendingDraftSnapshot = { ...draft, dirty: true };
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const saved = this.flushPendingSave();
      if (saved && onSaved) {
        onSaved(saved);
      }
    }, delayMs);
  }

  /** 获取所有本地离线草稿 */
  static getAllDrafts(): LocalArticleDraft[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /** 保存或更新草稿 */
  static saveDraft(draft: Omit<LocalArticleDraft, 'updatedAt'>): LocalArticleDraft {
    const list = this.getAllDrafts();
    const existingIndex = list.findIndex((d) => d.id === draft.id);
    const prev = existingIndex >= 0 ? list[existingIndex] : null;
    const nextVersion =
      draft.version ?? (prev ? (prev.dirty ? prev.version || 1 : (prev.version || 1) + 1) : 1);

    const item: LocalArticleDraft = {
      ...draft,
      version: nextVersion,
      dirty: draft.dirty ?? true,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      list[existingIndex] = item;
    } else {
      list.unshift(item);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[LocalFirstStore] LocalStorage 配额满或受限', e);
    }
    return item;
  }

  /** 获取单个草稿（读取前自动冲刷挂起的保存） */
  static getDraft(id: string): LocalArticleDraft | null {
    this.flushPendingSave();
    const list = this.getAllDrafts();
    return list.find((d) => d.id === id) || null;
  }

  /** 删除草稿（删除前自动冲刷挂起的保存） */
  static deleteDraft(id: string): void {
    this.flushPendingSave();
    const list = this.getAllDrafts().filter((d) => d.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }

  /** 活跃写作自动暂存（防误触丢内容） */
  static setAutoSave(title: string, content: string): void {
    try {
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({
          title,
          content,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch {}
  }

  /** 获取最后自动暂存的内容 */
  static getAutoSave(): { title: string; content: string; savedAt: string } | null {
    try {
      const data = localStorage.getItem(AUTOSAVE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /** 清空自动暂存 */
  static clearAutoSave(): void {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {}
  }
}


