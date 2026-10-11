import React, { useEffect, useState, useRef } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  Quote,
  AlertTriangle,
  Code2,
  Sigma,
  GitBranch,
  BarChart3,
  CheckSquare,
  Table,
  Minus,
  Sparkles,
  Info,
} from 'lucide-react';

export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: '基础排版' | '代码与数学' | '数据图表' | '结构';
  action: () => void;
}

interface SlashCommandMenuProps {
  position: { top: number; left: number };
  onClose: () => void;
  onSelect: (item: SlashCommandItem) => void;
  filterText: string;
  onOpenChartDialog?: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  position,
  onClose,
  onSelect,
  filterText,
  onOpenChartDialog,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: SlashCommandItem[] = [
    {
      id: 'h1',
      title: '一级标题 (H1)',
      description: '大段落的主标题',
      icon: <Heading1 className="w-4 h-4 text-primary" />,
      category: '基础排版',
      action: () => {},
    },
    {
      id: 'h2',
      title: '二级标题 (H2)',
      description: '章节小标题',
      icon: <Heading2 className="w-4 h-4 text-primary" />,
      category: '基础排版',
      action: () => {},
    },
    {
      id: 'h3',
      title: '三级标题 (H3)',
      description: '子小节标题',
      icon: <Heading3 className="w-4 h-4 text-primary" />,
      category: '基础排版',
      action: () => {},
    },
    {
      id: 'callout-note',
      title: '提示卡片 (Note)',
      description: '高亮突出关键信息与补充说明',
      icon: <Info className="w-4 h-4 text-blue-400" />,
      category: '基础排版',
      action: () => {},
    },
    {
      id: 'callout-warn',
      title: '警告卡片 (Warning)',
      description: '警示重要注意事项与风险',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      category: '基础排版',
      action: () => {},
    },
    {
      id: 'quote',
      title: '引用块 (Quote)',
      description: '引用名人名言或参考资料',
      icon: <Quote className="w-4 h-4 text-muted-foreground" />,
      category: '基础排版',
      action: () => {},
    },
    {
      id: 'code',
      title: '代码块 (Code Block)',
      description: '带语法高亮的代码围栏',
      icon: <Code2 className="w-4 h-4 text-emerald-400" />,
      category: '代码与数学',
      action: () => {},
    },
    {
      id: 'math',
      title: 'LaTeX 数学公式',
      description: '科学计算公式与矩阵渲染',
      icon: <Sigma className="w-4 h-4 text-violet-400" />,
      category: '代码与数学',
      action: () => {},
    },
    {
      id: 'mermaid',
      title: 'Mermaid 流程图',
      description: '文字代码直接转为矢量架构流程图',
      icon: <GitBranch className="w-4 h-4 text-cyan-400" />,
      category: '数据图表',
      action: () => {},
    },
    {
      id: 'chart',
      title: '交互式图表 (ECharts)',
      description: '柱状图、折线图、饼图与趋势分析',
      icon: <BarChart3 className="w-4 h-4 text-orange-400" />,
      category: '数据图表',
      action: () => {
        if (onOpenChartDialog) onOpenChartDialog();
      },
    },
    {
      id: 'task',
      title: '待办清单 (Task List)',
      description: '可交互打钩的任务列表',
      icon: <CheckSquare className="w-4 h-4 text-primary" />,
      category: '结构',
      action: () => {},
    },
    {
      id: 'table',
      title: '多维数据表格',
      description: '标准 Markdown 表格排版',
      icon: <Table className="w-4 h-4 text-muted-foreground" />,
      category: '结构',
      action: () => {},
    },
    {
      id: 'divider',
      title: '分割线 (Divider)',
      description: '优雅的内容分隔横线',
      icon: <Minus className="w-4 h-4 text-muted-foreground" />,
      category: '结构',
      action: () => {},
    },
  ];

  const filtered = commands.filter((cmd) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return cmd.title.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q) || cmd.id.includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      className="fixed z-50 w-72 max-h-80 overflow-y-auto rounded-2xl border border-border/80 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5 uppercase">
        <Sparkles className="w-3 h-3 text-primary" />
        快捷插入指令 ({filtered.length})
      </div>
      <div className="space-y-0.5">
        {filtered.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left text-sm transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-muted/60'
              }`}
            >
              <div
                className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted/80 text-foreground'
                }`}
              >
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate leading-snug">{item.title}</div>
                <div
                  className={`text-[11px] truncate leading-tight ${
                    isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}
                >
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
