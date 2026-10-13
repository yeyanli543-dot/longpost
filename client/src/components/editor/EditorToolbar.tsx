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
  Pencil,
  GitCompare,
  Network,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { useWorkspaceMode } from '@client/src/hooks/useWorkspaceMode';
import { WorkspaceModeSwitcher } from '@client/src/components/WorkspaceMode/WorkspaceModeSwitcher';

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
  onOpenWhiteboard?: () => void;
  onOpenDiff?: () => void;
  onOpenGraph?: () => void;
  onOpenWritingLab?: () => void;
  onOpenShortcuts?: () => void;
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
  onOpenWhiteboard,
  onOpenDiff,
  onOpenGraph,
  onOpenWritingLab,
  onOpenShortcuts,
}) => {
  const { isLite, isPro } = useWorkspaceMode();

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b select-none transition-all duration-300 ${
        isLite
          ? 'bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 rounded-t-3xl'
          : 'bg-[#f0f4f9] dark:bg-[#202124] border-[#dadce0] dark:border-[#3c4043] rounded-t-2xl shadow-sm'
      }`}
    >
      {/* 极简模式 (Apple Lite) 下的工具栏 */}
      {isLite ? (
        <>
          <div className="flex items-center gap-2">
            <WorkspaceModeSwitcher compact />
            <div className="w-[1px] h-3.5 bg-zinc-300 dark:bg-zinc-700" />
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25 transition-colors"
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25 transition-colors"
              title="重做 (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 pl-2 hidden md:inline">
              输入 “/” 呼出排版指令 · 划词即享悬浮气泡
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 灵动岛字数与时间气泡 */}
            <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span>{wordCount} 字</span>
              <span className="opacity-40">·</span>
              <span>约 {readingTimeMinutes} 分钟</span>
            </div>

            {/* 视图模式 */}
            <div className="flex items-center p-0.5 rounded-full bg-black/5 dark:bg-white/10">
              <button
                onClick={() => onViewModeChange('edit')}
                className={`p-1.5 rounded-full text-xs transition-all ${
                  viewMode === 'edit'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
                title="纯编辑模式"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange('split')}
                className={`p-1.5 rounded-full text-xs transition-all ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
                title="双栏实时预览"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange('preview')}
                className={`p-1.5 rounded-full text-xs transition-all ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
                title="纯净阅读预览"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 导出 */}
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1 px-3 py-1 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
              title="导出"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>导出</span>
            </button>

            {/* 全屏 */}
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏禅意模式'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </>
      ) : (
        /* 专业模式 (Google Pro M3) 下的多功能工作站 */
        <>
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <WorkspaceModeSwitcher compact />

            <div className="w-[1px] h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              title="重做 (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

            {/* 基础格式 */}
            <button
              onClick={() => onInsertText('**', '**', '加粗文本')}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="加粗"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => onInsertText('*', '*', '斜体文本')}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="斜体"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => onInsertText('`', '`', 'code')}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="代码"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              onClick={() => onInsertText('> ', '', '引用内容')}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="引用"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              onClick={() => onInsertText('- [ ] ', '', '待办任务')}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="待办清单"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => onInsertText('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n')}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="表格"
            >
              <Table className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

            {/* 谷歌专业工具组 Chip 药丸 */}
            {onOpenWhiteboard && (
              <button
                onClick={onOpenWhiteboard}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e8f0fe] dark:bg-[#1e3a5f] text-[#1967d2] dark:text-[#a8c7fa] hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-2xs"
                title="打开本地手绘白板草图"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>白板草图</span>
              </button>
            )}

            {onOpenDiff && (
              <button
                onClick={onOpenDiff}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#fef7e0] dark:bg-[#3e3415] text-[#b06000] dark:text-[#fdd663] hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shadow-2xs"
                title="打开版本时光机与 Diff 比对"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Diff 比对</span>
              </button>
            )}

            {onOpenGraph && (
              <button
                onClick={onOpenGraph}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e6f4ea] dark:bg-[#133e24] text-[#137333] dark:text-[#81c995] hover:bg-green-100 dark:hover:bg-green-900/60 transition-colors shadow-2xs"
                title="打开知识图谱网络"
              >
                <Network className="w-3.5 h-3.5" />
                <span>知识图谱</span>
              </button>
            )}

            {onOpenWritingLab && (
              <button
                onClick={onOpenWritingLab}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#fce8e6] dark:bg-[#432321] text-[#c5221f] dark:text-[#f28b82] hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors shadow-2xs"
                title="打开写作实验室与排版美化"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>写作实验室</span>
              </button>
            )}

            <button
              onClick={onOpenChartDialog}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
              title="插入 ECharts 数据图表"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>图表</span>
            </button>
            <button
              onClick={() => onInsertText('```mermaid\ngraph TD\n  A[开始] --> B(处理步骤)\n  B --> C[完成]\n```\n')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors"
              title="插入 Mermaid 流程图"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>流程图</span>
            </button>
            <button
              onClick={() => onInsertText('$$\n\\frac{a}{b} = \\sqrt{c}\n$$\n')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
              title="插入 LaTeX 公式"
            >
              <Sigma className="w-3.5 h-3.5" />
              <span>公式</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 font-mono hidden md:flex items-center gap-1.5">
              <span>{wordCount} 字</span>
              <span>·</span>
              <span>约 {readingTimeMinutes} 分钟</span>
            </div>

            {/* 视图模式开关 */}
            <div className="flex items-center p-0.5 rounded-full bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-700">
              <button
                onClick={() => onViewModeChange('edit')}
                className={`p-1.5 rounded-full text-xs font-medium transition-all ${
                  viewMode === 'edit'
                    ? 'bg-[#1a73e8] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title="纯编辑模式"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange('split')}
                className={`p-1.5 rounded-full text-xs font-medium transition-all ${
                  viewMode === 'split'
                    ? 'bg-[#1a73e8] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title="双栏所见即所得"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange('preview')}
                className={`p-1.5 rounded-full text-xs font-medium transition-all ${
                  viewMode === 'preview'
                    ? 'bg-[#1a73e8] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title="纯阅读预览"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 导出 */}
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="多维格式导出"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>导出</span>
            </button>

            {/* 全屏 */}
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-full bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏模式'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* 快捷键指南 */}
            {onOpenShortcuts && (
              <button
                onClick={onOpenShortcuts}
                className="p-1.5 rounded-full bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="快捷键与语法指南 (Ctrl+/)"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

