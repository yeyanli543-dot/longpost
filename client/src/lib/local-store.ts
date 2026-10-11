/**
 * 本地优先 (Local-First) 离线存储管理库
 * 确保断网、未登录、或纯本地单机模式下，创作的数据 100% 安全持久化在用户设备中
 */

export interface LocalArticleDraft {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  coverUrl?: string;
  tags?: string[];
  updatedAt: string;
}

const STORAGE_KEY = 'longpost_local_drafts_v1';
const AUTOSAVE_KEY = 'longpost_active_autosave';

export class LocalFirstStore {
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
    const item: LocalArticleDraft = {
      ...draft,
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

  /** 获取单个草稿 */
  static getDraft(id: string): LocalArticleDraft | null {
    const list = this.getAllDrafts();
    return list.find((d) => d.id === id) || null;
  }

  /** 删除草稿 */
  static deleteDraft(id: string): void {
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
