import React from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  Table,
  BarChart3,
  GitBranch,
  Sigma,
  Undo2,
  Redo2,
  Columns,
  Eye,
  Edit3,
  Maximize2,
  Minimize2,
  Download,
  Share2,
} from 'lucide-react';

export type EditorViewMode = 'edit' | 'split' | 'preview';

interface EditorToolbarProps {
  onInsertText: (before: string, after?: string, defaultText?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  viewMode: EditorViewMode;
  onViewModeChange: (mode: EditorViewMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenChartDialog: () => void;
  onOpenExportModal: () => void;
  wordCount: number;
  readingTimeMinutes: number;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onInsertText,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  viewMode,
  onViewModeChange,
  isFullscreen,
  onToggleFullscreen,
  onOpenChartDialog,
  onOpenExportModal,
  wordCount,
  readingTimeMinutes,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border/80 bg-muted/40 backdrop-blur-md rounded-t-2xl select-none">
      {/* 左侧：格式化工具组 */}
      <div className="flex items-center gap-0.5 overflow-x-auto py-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          title="重做 (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-border/60 mx-1" />

        <button
          onClick={() => onInsertText('**', '**', '加粗文本')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="加粗 (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('*', '*', '斜体文本')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="斜体 (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('~~', '~~', '删除线文本')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="删除线"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('`', '`', 'code')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="行内代码"
        >
          <Code className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-border/60 mx-1" />

        <button
          onClick={() => onInsertText('> ', '', '引用内容')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="引用块"
        >
          <Quote className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('- ', '', '列表项')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="无序列表"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('1. ', '', '有序项')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="有序列表"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('- [ ] ', '', '待办任务')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="待办任务清单"
        >
          <CheckSquare className="w-4 h-4" />
        </button>
        <button
          onClick={() => onInsertText('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n')}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="插入表格"
        >
          <Table className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-border/60 mx-1" />

        <button
          onClick={onOpenChartDialog}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-500 hover:bg-amber-500/10 transition-colors"
          title="插入 ECharts 数据图表"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>图表</span>
        </button>
        <button
          onClick={() => onInsertText('```mermaid\ngraph TD\n  A[开始] --> B(处理步骤)\n  B --> C[完成]\n```\n')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-cyan-500 hover:bg-cyan-500/10 transition-colors"
          title="插入 Mermaid 流程图"
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>流程图</span>
        </button>
        <button
          onClick={() => onInsertText('$$\n\\frac{a}{b} = \\sqrt{c}\n$$\n')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-violet-500 hover:bg-violet-500/10 transition-colors"
          title="插入 LaTeX 公式"
        >
          <Sigma className="w-3.5 h-3.5" />
          <span>公式</span>
        </button>
      </div>

      {/* 右侧：视图模式切换与导出 */}
      <div className="flex items-center gap-1.5">
        <div className="text-xs text-muted-foreground mr-1 hidden sm:flex items-center gap-2">
          <span>{wordCount} 字</span>
          <span>·</span>
          <span>约 {readingTimeMinutes} 分钟</span>
        </div>

        {/* 视图模式开关 */}
        <div className="flex items-center p-0.5 rounded-xl bg-background border border-border/60">
          <button
            onClick={() => onViewModeChange('edit')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'edit'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="纯编辑模式"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('split')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'split'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="双栏所见即所得实时预览"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('preview')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'preview'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="纯阅读预览模式"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 导出菜单入口 */}
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          title="多维格式导出"
        >
          <Download className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">导出</span>
        </button>

        {/* 全屏切换 */}
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded-xl bg-background border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={isFullscreen ? '退出全屏无干扰模式' : '进入全屏无干扰沉浸写作'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
