import { create } from 'zustand';
import { db } from '../db/dexie';
import { LocalDocument } from '../types/models';
import { extractTitleFromContent } from '../utils/textStats';

interface DocumentState {
  documents: LocalDocument[];
  activeDoc: LocalDocument | null;
  searchQuery: string;
  isSaving: boolean;
  lastSavedAt: string | null;
  loadDocuments: () => Promise<void>;
  selectDoc: (id: string) => Promise<void>;
  createDoc: (initialContent?: string) => Promise<LocalDocument>;
  updateActiveContent: (content: string) => void;
  deleteDoc: (id: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDocSnapshot: LocalDocument | null = null;

async function flushPendingSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingDocSnapshot) {
    const docToSave = pendingDocSnapshot;
    pendingDocSnapshot = null;
    await db.documents.put(docToSave);
  }
}

const WELCOME_CONTENT = `欢迎使用 LongPost v2.9.6 双模式长图创作工作台。

你可以在顶部状态栏随时切换「🍎 简洁版 (Apple Zen)」与「🎨 专业版 (Google Pro Studio)」：
1. 简洁版提供沉浸式毛玻璃书写体验，心无旁骛地专注于文字表达；
2. 专业版支持双栏实时高分屏画布排版预览、精细化字号与边距调节、多卡片自动分页导出。

内置特性：
- 离线优先存储（IndexedDB），毫秒级防抖自动保存；
- 双引擎 AI 润色（支持云端托管 Gemini 2.5 Flash 与本地 AES-GCM 256 加密自定义 API Key）；
- 云端增量同步与 WebDAV 跨端双向备份恢复。`;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeDoc: null,
  searchQuery: '',
  isSaving: false,
  lastSavedAt: null,

  loadDocuments: async () => {
    await flushPendingSave();
    const list = await db.documents.orderBy('updatedAt').reverse().toArray();
    const visible = list.filter(d => !d.deleted);
    if (visible.length === 0) {
      const first = await get().createDoc(WELCOME_CONTENT);
      set({ documents: [first], activeDoc: first });
      return;
    }
    const currentActiveId = get().activeDoc?.id;
    const nextActive = visible.find(d => d.id === currentActiveId) || visible[0];
    set({ documents: visible, activeDoc: nextActive });
  },

  selectDoc: async (id: string) => {
    await flushPendingSave();
    const found = get().documents.find(d => d.id === id);
    if (found) set({ activeDoc: found, isSaving: false });
  },

  createDoc: async (initialContent = '') => {
    await flushPendingSave();
    const now = new Date().toISOString();
    const newDoc: LocalDocument = {
      id: crypto.randomUUID(),
      title: extractTitleFromContent(initialContent),
      content: initialContent,
      version: 1,
      updatedAt: now,
      deleted: false,
      dirty: true
    };
    await db.documents.put(newDoc);
    const updated = [newDoc, ...get().documents];
    set({ documents: updated, activeDoc: newDoc, lastSavedAt: now, isSaving: false });
    return newDoc;
  },

  updateActiveContent: (content: string) => {
    const current = get().activeDoc;
    if (!current) return;

    const now = new Date().toISOString();
    const nextVersion = current.dirty ? current.version : current.version + 1;
    const updated: LocalDocument = {
      ...current,
      content,
      title: extractTitleFromContent(content),
      version: nextVersion,
      updatedAt: now,
      dirty: true
    };

    pendingDocSnapshot = updated;
    set(state => ({
      activeDoc: updated,
      documents: state.documents.map(d => (d.id === updated.id ? updated : d)),
      isSaving: true
    }));

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!pendingDocSnapshot) return;
      const toWrite = pendingDocSnapshot;
      pendingDocSnapshot = null;
      await db.documents.put(toWrite);
      set({ isSaving: false, lastSavedAt: toWrite.updatedAt });
    }, 500);
  },

  deleteDoc: async (id: string) => {
    await flushPendingSave();
    const target = await db.documents.get(id);
    if (!target) return;
    const now = new Date().toISOString();
    await db.documents.put({
      ...target,
      deleted: true,
      dirty: true,
      version: target.version + 1,
      updatedAt: now
    });
    const remaining = get().documents.filter(d => d.id !== id);
    if (remaining.length === 0) {
      const fresh = await get().createDoc('');
      set({ documents: [fresh], activeDoc: fresh });
    } else {
      const nextActive = get().activeDoc?.id === id ? remaining[0] : get().activeDoc;
      set({ documents: remaining, activeDoc: nextActive });
    }
  },

  setSearchQuery: (q: string) => set({ searchQuery: q })
}));
