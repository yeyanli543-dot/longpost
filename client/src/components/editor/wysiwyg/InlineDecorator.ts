import { logger } from '@/lib/logger';

export interface InlineDecorationRange {
  start: number;
  end: number;
  type: 'bold' | 'italic' | 'code' | 'highlight' | 'math' | 'strike';
  rawText: string;
}

export type DecorationUpdateCallback = (decorations: InlineDecorationRange[]) => void;

/**
 * IME 安全的行内即显装饰器 (InlineDecorator)
 * 核心设计：
 * 1. 严格监听 compositionstart 与 compositionend 事件；
 * 2. 在用户拼音输入合成期间 (isComposing === true)，坚决禁止触碰 DOM 结构或变更光标！
 * 3. 输入法合成结束 (compositionend) 后防抖 150ms 重新执行高亮装饰计算。
 */
export class InlineDecorator {
  private isComposing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private targetElement: HTMLTextAreaElement | null = null;
  private onUpdate: DecorationUpdateCallback | null = null;

  private handleCompositionStart = () => {
    this.isComposing = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  };

  private handleCompositionEnd = () => {
    this.isComposing = false;
    // 防抖 150ms 后再更新装饰，保证 IME 提交字符已完整落盘
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.computeDecorations();
    }, 150);
  };

  private handleInput = () => {
    // 若正在拼音合成中，坚决不打扰用户输入
    if (this.isComposing) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.computeDecorations();
    }, 150);
  };

  /**
   * 绑定到目标输入控件
   */
  bind(element: HTMLTextAreaElement, onUpdate: DecorationUpdateCallback): void {
    this.unbind();
    this.targetElement = element;
    this.onUpdate = onUpdate;

    element.addEventListener('compositionstart', this.handleCompositionStart);
    element.addEventListener('compositionend', this.handleCompositionEnd);
    element.addEventListener('input', this.handleInput);

    // 初始计算一次
    this.computeDecorations();
  }

  /**
   * 解绑事件监听并清理定时器
   */
  unbind(): void {
    if (this.targetElement) {
      this.targetElement.removeEventListener('compositionstart', this.handleCompositionStart);
      this.targetElement.removeEventListener('compositionend', this.handleCompositionEnd);
      this.targetElement.removeEventListener('input', this.handleInput);
      this.targetElement = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.isComposing = false;
    this.onUpdate = null;
  }

  /**
   * 获取当前是否处于中文/日语输入法拼音合成状态
   */
  get inComposition(): boolean {
    return this.isComposing;
  }

  /**
   * 提取正文中的行内语法范围
   */
  computeDecorations(): InlineDecorationRange[] {
    if (!this.targetElement || this.isComposing) {
      return [];
    }

    const text = this.targetElement.value || '';
    const decorations: InlineDecorationRange[] = [];

    // 1. 高亮: ==text==
    const highlightRegex = /==([^=\n]+)==/g;
    let match: RegExpExecArray | null;
    while ((match = highlightRegex.exec(text)) !== null) {
      decorations.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'highlight',
        rawText: match[1],
      });
    }

    // 2. 行内代码: `code`
    const codeRegex = /`([^`\n]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
      decorations.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'code',
        rawText: match[1],
      });
    }

    // 3. 粗体: **text**
    const boldRegex = /\*\*([^*\n]+)\*\*/g;
    while ((match = boldRegex.exec(text)) !== null) {
      decorations.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'bold',
        rawText: match[1],
      });
    }

    // 4. 行内公式: $math$
    const mathRegex = /\$([^$\n]+)\$/g;
    while ((match = mathRegex.exec(text)) !== null) {
      decorations.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'math',
        rawText: match[1],
      });
    }

    if (this.onUpdate) {
      this.onUpdate(decorations);
    }
    return decorations;
  }
}
