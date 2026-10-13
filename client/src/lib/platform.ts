/**
 * 跨端平台抽象层 (Platform Abstraction Layer - PAL)
 *
 * 核心职责：
 * 终结历史“双轨制”，使现代 React 客户端既能在标准 Web 浏览器中运行，
 * 又能在 Electron 桌面端和 Capacitor 移动端中直接调用本机原生特权能力。
 */

export interface DesktopArticlePayload {
  id?: string;
  title: string;
  content: string;
  tags?: string[];
  excerpt?: string;
  createdAt?: string;
}

export interface PlatformAdapter {
  readonly isDesktop: boolean;
  readonly isElectron: boolean;
  readonly isMobile: boolean;
  readonly isWeb: boolean;

  // 本机文件与应用系统交互
  saveArticleLocal(payload: DesktopArticlePayload): Promise<{ id: string; success: boolean }>;
  listArticlesLocal(opts?: { tag?: string; search?: string }): Promise<DesktopArticlePayload[]>;
  getArticleLocal(id: string): Promise<DesktopArticlePayload | null>;
  deleteArticleLocal(id: string): Promise<{ success: boolean }>;
  exportHtml(id: string): Promise<{ success: boolean; filePath?: string }>;
  exportMarkdown(id: string): Promise<{ success: boolean; filePath?: string }>;
  openDataDir(): Promise<{ success: boolean; dir?: string }>;
  pickImages(): Promise<{ canceled: boolean; filePaths: string[] }>;
  pickFiles(): Promise<{ canceled: boolean; filePaths: string[] }>;
  getSettings(): Promise<Record<string, unknown>>;
  setSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

class UniversalPlatformAdapter implements PlatformAdapter {
  get isElectron(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).lp || (window as any).process?.type === 'renderer');
  }

  get isDesktop(): boolean {
    return this.isElectron;
  }

  get isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    const isCapacitor = Boolean((window as any).Capacitor);
    const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
    return isCapacitor || isMobileUa;
  }

  get isWeb(): boolean {
    return !this.isDesktop && !this.isMobile;
  }

  private get bridge(): any {
    if (typeof window !== 'undefined' && (window as any).lp) {
      return (window as any).lp;
    }
    return null;
  }

  async saveArticleLocal(payload: DesktopArticlePayload): Promise<{ id: string; success: boolean }> {
    if (this.bridge?.saveArticle) {
      return this.bridge.saveArticle(payload);
    }
    // Web / 移动端离线 IndexedDB / localStorage 降级存储
    const id = payload.id || `local_${Date.now()}`;
    try {
      const existingRaw = localStorage.getItem('lp_local_articles') || '[]';
      const list: DesktopArticlePayload[] = JSON.parse(existingRaw);
      const index = list.findIndex((a) => a.id === id);
      const itemToSave = { ...payload, id };
      if (index >= 0) {
        list[index] = itemToSave;
      } else {
        list.unshift(itemToSave);
      }
      localStorage.setItem('lp_local_articles', JSON.stringify(list));
      return { id, success: true };
    } catch {
      return { id, success: false };
    }
  }

  async listArticlesLocal(opts?: { tag?: string; search?: string }): Promise<DesktopArticlePayload[]> {
    if (this.bridge?.listArticles) {
      return this.bridge.listArticles(opts);
    }
    try {
      const existingRaw = localStorage.getItem('lp_local_articles') || '[]';
      let list: DesktopArticlePayload[] = JSON.parse(existingRaw);
      if (opts?.search) {
        const query = opts.search.toLowerCase();
        list = list.filter(
          (a) =>
            a.title.toLowerCase().includes(query) ||
            a.content.toLowerCase().includes(query),
        );
      }
      if (opts?.tag) {
        list = list.filter((a) => a.tags?.includes(opts.tag!));
      }
      return list;
    } catch {
      return [];
    }
  }

  async getArticleLocal(id: string): Promise<DesktopArticlePayload | null> {
    if (this.bridge?.getArticle) {
      return this.bridge.getArticle(id);
    }
    try {
      const existingRaw = localStorage.getItem('lp_local_articles') || '[]';
      const list: DesktopArticlePayload[] = JSON.parse(existingRaw);
      return list.find((a) => a.id === id) || null;
    } catch {
      return null;
    }
  }

  async deleteArticleLocal(id: string): Promise<{ success: boolean }> {
    if (this.bridge?.deleteArticle) {
      return this.bridge.deleteArticle(id);
    }
    try {
      const existingRaw = localStorage.getItem('lp_local_articles') || '[]';
      let list: DesktopArticlePayload[] = JSON.parse(existingRaw);
      list = list.filter((a) => a.id !== id);
      localStorage.setItem('lp_local_articles', JSON.stringify(list));
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async exportHtml(id: string): Promise<{ success: boolean; filePath?: string }> {
    if (this.bridge?.exportHtml) {
      return this.bridge.exportHtml(id);
    }
    return { success: false };
  }

  async exportMarkdown(id: string): Promise<{ success: boolean; filePath?: string }> {
    if (this.bridge?.exportMarkdown) {
      return this.bridge.exportMarkdown(id);
    }
    return { success: false };
  }

  async openDataDir(): Promise<{ success: boolean; dir?: string }> {
    if (this.bridge?.openDataDir) {
      return this.bridge.openDataDir();
    }
    return { success: false };
  }

  async pickImages(): Promise<{ canceled: boolean; filePaths: string[] }> {
    if (this.bridge?.pickImages) {
      return this.bridge.pickImages();
    }
    return { canceled: true, filePaths: [] };
  }

  async pickFiles(): Promise<{ canceled: boolean; filePaths: string[] }> {
    if (this.bridge?.pickFiles) {
      return this.bridge.pickFiles();
    }
    return { canceled: true, filePaths: [] };
  }

  async getSettings(): Promise<Record<string, unknown>> {
    if (this.bridge?.getSettings) {
      return this.bridge.getSettings();
    }
    return {};
  }

  async setSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.bridge?.setSettings) {
      return this.bridge.setSettings(patch);
    }
    return patch;
  }
}

export const platform = new UniversalPlatformAdapter();
