import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Strikethrough, Code, Link2, Highlighter, Quote } from 'lucide-react';

interface BubbleMenuProps {
  position: { top: number; left: number };
  onApplyFormat: (format: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'link' | 'quote') => void;
  onClose: () => void;
}

export const BubbleMenu: React.FC<BubbleMenuProps> = ({ position, onApplyFormat, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translate(-50%, -100%)',
      }}
      className="fixed z-50 flex items-center gap-0.5 rounded-xl border border-border/80 bg-popover/95 p-1 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 text-foreground"
    >
      <button
        onClick={() => onApplyFormat('bold')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="加粗 (Ctrl+B)"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onApplyFormat('italic')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="斜体 (Ctrl+I)"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onApplyFormat('strike')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="删除线"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </button>
      <div className="w-[1px] h-3.5 bg-border/60 mx-0.5" />
      <button
        onClick={() => onApplyFormat('code')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="行内代码"
      >
        <Code className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onApplyFormat('highlight')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="文字高亮"
      >
        <Highlighter className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onApplyFormat('quote')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="转换为引用"
      >
        <Quote className="w-3.5 h-3.5" />
      </button>
      <div className="w-[1px] h-3.5 bg-border/60 mx-0.5" />
      <button
        onClick={() => onApplyFormat('link')}
        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="插入超链接 (Ctrl+K)"
      >
        <Link2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
