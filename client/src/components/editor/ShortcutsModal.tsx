import React from 'react';
import { X, Command, Sparkles, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutsList = [
    {
      category: '基础排版与快捷键',
      items: [
        { label: '粗体文本', key: 'Ctrl + B', syntax: '**文本**' },
        { label: '斜体文本', key: 'Ctrl + I', syntax: '*文本*' },
        { label: '撤销上一步', key: 'Ctrl + Z', syntax: '-' },
        { label: '重做下一步', key: 'Ctrl + Shift + Z', syntax: '-' },
        { label: '删除线', key: '-', syntax: '~~文本~~' },
        { label: '重点高亮', key: '-', syntax: '==高亮文字==' },
        { label: '行内代码', key: '-', syntax: '`const a = 1;`' },
        { label: '引用段落', key: '-', syntax: '> 引用内容' },
      ],
    },
    {
      category: '智能插入指令 (输入 "/" 呼出)',
      items: [
        { label: '呼出指令菜单', key: '/', syntax: '行首或空格后按 /' },
        { label: '专业 Mermaid 流程图', key: '/mermaid', syntax: '```mermaid' },
        { label: 'ECharts 可视化图表', key: '/chart', syntax: ':::chart{...}:::' },
        { label: 'LaTeX 数学公式', key: '/math', syntax: '$$\\sum x$$' },
        { label: '交互式待办项', key: '/task', syntax: '- [ ] 待办清单' },
        { label: '代码高亮块', key: '/code', syntax: '```typescript' },
        { label: '多级提示框 Callout', key: '/callout', syntax: '> [!NOTE]' },
      ],
    },
    {
      category: '系统与工作区特权',
      items: [
        { label: '双工作区秒切', key: 'Alt + M', syntax: '极简 ⇄ 专业' },
        { label: '全局指令面板', key: 'Ctrl + K', syntax: '快速跳转与全站检索' },
        { label: '本快捷键指南', key: 'Ctrl + /', syntax: '随用随开' },
        { label: '选中文本气泡', key: '划选文字', syntax: '浮动快捷润色菜单' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-background border border-border shadow-2xl p-6 overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">LongPost 创作者快捷键与语法指南</h3>
              <p className="text-xs text-muted-foreground">键盘流极速长文排版与智能图表指令</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {shortcutsList.map((cat) => (
            <div key={cat.category} className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {cat.category}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 border border-border/50 text-xs transition-colors"
                  >
                    <span className="font-medium text-foreground">{item.label}</span>
                    <div className="flex items-center gap-1.5">
                      {item.syntax !== '-' && (
                        <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] text-muted-foreground font-mono">
                          {item.syntax}
                        </code>
                      )}
                      {item.key !== '-' && (
                        <kbd className="px-2 py-0.5 rounded bg-foreground/10 border border-border text-[11px] font-semibold text-foreground">
                          {item.key}
                        </kbd>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>提示：按 Esc 或点击右上角关闭</span>
          <span className="text-blue-500 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> 纯前端离线加速
          </span>
        </div>
      </div>
    </div>
  );
};
