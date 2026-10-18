import { LocalDocument } from '../types/models';

class DocumentsTable {
  private memoryMap = new Map<string, LocalDocument>();
  private isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    if (this.isBrowser) {
      this.initIndexedDB();
    }
  }

  private initIndexedDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('LongPostDB', 1);
      request.onupgradeneeded = () => {
        const idb = request.result;
        if (!idb.objectStoreNames.contains('documents')) {
          const store = idb.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async put(doc: LocalDocument): Promise<void> {
    this.memoryMap.set(doc.id, { ...doc });
    if (!this.isBrowser) return;

    try {
      const idb = await this.initIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const req = store.put(doc);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fallback in memory
    }
  }

  async bulkPut(docs: LocalDocument[]): Promise<void> {
    for (const doc of docs) {
      await this.put(doc);
    }
  }

  async get(id: string): Promise<LocalDocument | undefined> {
    if (!this.isBrowser) {
      return this.memoryMap.get(id);
    }
    try {
      const idb = await this.initIndexedDB();
      return new Promise<LocalDocument | undefined>((resolve, reject) => {
        const tx = idb.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || this.memoryMap.get(id));
        req.onerror = () => resolve(this.memoryMap.get(id));
      });
    } catch {
      return this.memoryMap.get(id);
    }
  }

  orderBy(field: 'updatedAt') {
    return {
      reverse: () => ({
        toArray: async (): Promise<LocalDocument[]> => {
          if (!this.isBrowser) {
            return Array.from(this.memoryMap.values()).sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          }
          try {
            const idb = await this.initIndexedDB();
            return new Promise<LocalDocument[]>((resolve) => {
              const tx = idb.transaction('documents', 'readonly');
              const store = tx.objectStore('documents');
              const req = store.getAll();
              req.onsuccess = () => {
                const list: LocalDocument[] = req.result || [];
                list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                resolve(list);
              };
              req.onerror = () => {
                resolve(
                  Array.from(this.memoryMap.values()).sort(
                    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                  )
                );
              };
            });
          } catch {
            return Array.from(this.memoryMap.values()).sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          }
        },
      }),
    };
  }
}

export const db = {
  documents: new DocumentsTable(),
};
