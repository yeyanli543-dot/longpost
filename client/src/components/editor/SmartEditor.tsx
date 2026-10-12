import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { EditorToolbar, type EditorViewMode } from './EditorToolbar';
import { SlashCommandMenu, type SlashCommandItem } from './SlashCommandMenu';
import { BubbleMenu } from './BubbleMenu';
import { ExportModal } from './ExportModal';
import { MermaidRenderer } from './MermaidRenderer';
import { Markdown } from '@client/src/components/ui/markdown';
import { splitChartCards } from '@shared/chart-card';
import ChartBlock from '@client/src/components/ChartBlock';
import { WhiteboardCanvas } from './tools/WhiteboardCanvas';
import { DiffInspector } from './tools/DiffInspector';
import { KnowledgeGraphView } from './tools/KnowledgeGraphView';
import { WritingLab } from './tools/WritingLab';
import { useWorkspaceMode } from '@client/src/hooks/useWorkspaceMode';

interface SmartEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  title?: string;
  onOpenChartDialog?: () => void;
}

export const SmartEditor: React.FC<SmartEditorProps> = ({
  value,
  onChange,
  placeholder = '开始输入正文...（输入 "/" 呼出智能插入指令）',
  minHeight = '420px',
  title = '',
  onOpenChartDialog,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 视图模式：'edit' | 'split' | 'preview'
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 风格模式
  const { isLite, isPro } = useWorkspaceMode();

  // 专业版工具弹窗状态
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showWritingLab, setShowWritingLab] = useState(false);
  const [initialSnapshot] = useState<string>(value);

  // 斜杠菜单状态
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const [slashFilter, setSlashFilter] = useState('');
  const [slashTriggerPos, setSlashTriggerPos] = useState<number | null>(null);

  // 划选气泡菜单状态
  const [bubbleMenuOpen, setBubbleMenuOpen] = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ top: 0, left: 0 });

  // 导出弹窗
  const [showExportModal, setShowExportModal] = useState(false);

  // 简易 Undo/Redo 历史记录
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // 更新内容并入栈历史
  const updateContent = useCallback(
    (newVal: string, recordHistory = true) => {
      onChange(newVal);
      if (recordHistory) {
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          next.push(newVal);
          if (next.length > 50) next.shift();
          return next;
        });
        setHistoryIndex((prev) => Math.min(prev + 1, 49));
      }
    },
    [historyIndex, onChange],
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      setHistoryIndex(targetIndex);
      onChange(history[targetIndex]);
    }
  }, [historyIndex, history, onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      setHistoryIndex(targetIndex);
      onChange(history[targetIndex]);
    }
  }, [historyIndex, history, onChange]);

  // 统计字数
  const wordCount = useMemo(() => {
    return value.trim() ? value.replace(/\s+/g, '').length : 0;
  }, [value]);

  const readingTime = useMemo(() => {
    return Math.max(1, Math.ceil(wordCount / 400));
  }, [wordCount]);

  // 选区格式化操作（加粗、斜体、链接等）
  const applyFormat = useCallback(
    (format: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'link' | 'quote') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end) || '文本';

      let replacement = '';
      switch (format) {
        case 'bold':
          replacement = `**${selected}**`;
          break;
        case 'italic':
          replacement = `*${selected}*`;
          break;
        case 'strike':
          replacement = `~~${selected}~~`;
          break;
        case 'code':
          replacement = `\`${selected}\``;
          break;
        case 'highlight':
          replacement = `==${selected}==`;
          break;
        case 'link':
          replacement = `[${selected}](https://)`;
          break;
        case 'quote':
          replacement = `\n> ${selected}\n`;
          break;
      }

      const nextVal = value.slice(0, start) + replacement + value.slice(end);
      updateContent(nextVal);
      setBubbleMenuOpen(false);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + replacement.length);
      });
    },
    [value, updateContent],
  );

  // 快速插入文本
  const insertText = useCallback(
    (before: string, after = '', defaultText = '') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end) || defaultText;

      const replacement = `${before}${selected}${after}`;
      const nextVal = value.slice(0, start) + replacement + value.slice(end);
      updateContent(nextVal);

      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + before.length + selected.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [value, updateContent],
  );

  // 监听划词事件（弹出 BubbleMenu）
  const handleSelectText = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end && end - start > 0) {
      const rect = textarea.getBoundingClientRect();
      // 近似计算选区位置
      setBubblePosition({
        top: Math.max(10, rect.top + 20),
        left: rect.left + rect.width / 2,
      });
      setBubbleMenuOpen(true);
    } else {
      setBubbleMenuOpen(false);
    }
  };

  // 监听键盘按键：处理 "/" 斜杠命令与快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 快捷键 Ctrl+B 加粗, Ctrl+I 斜体, Ctrl+Z 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      applyFormat('bold');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      applyFormat('italic');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }

    // 触发斜杠菜单
    if (e.key === '/' || e.key === '、') {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const pos = textarea.selectionStart;
      // 允许在行首、换行后或空格后输入 /
      const charBefore = pos > 0 ? value[pos - 1] : '\n';
      if (charBefore === '\n' || charBefore === ' ' || pos === 0) {
        const rect = textarea.getBoundingClientRect();
        setSlashPosition({
          top: Math.min(window.innerHeight - 320, rect.top + 60),
          left: Math.min(window.innerWidth - 300, rect.left + 40),
        });
        setSlashTriggerPos(pos);
        setSlashFilter('');
        setSlashMenuOpen(true);
      }
    } else if (slashMenuOpen) {
      if (e.key === 'Escape') {
        setSlashMenuOpen(false);
      } else if (e.key === 'Backspace') {
        const textarea = textareaRef.current;
        if (textarea && slashTriggerPos !== null && textarea.selectionStart <= slashTriggerPos) {
          setSlashMenuOpen(false);
        }
      }
    }
  };

  // 输入变化时更新过滤词
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    updateContent(nextVal);

    if (slashMenuOpen && slashTriggerPos !== null) {
      const currentPos = e.target.selectionStart;
      if (currentPos > slashTriggerPos) {
        setSlashFilter(nextVal.slice(slashTriggerPos + 1, currentPos));
      } else {
        setSlashMenuOpen(false);
      }
    }
  };

  // 执行 Slash 菜单选中的指令
  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    const textarea = textareaRef.current;
    if (!textarea || slashTriggerPos === null) return;

    // 清除刚才输入的 / 及过滤词
    const currentPos = textarea.selectionStart;
    const beforeSlash = value.slice(0, slashTriggerPos);
    const afterPos = value.slice(currentPos);

    let insertTextSnippet = '';
    switch (cmd.id) {
      case 'h1':
        insertTextSnippet = '# ';
        break;
      case 'h2':
        insertTextSnippet = '## ';
        break;
      case 'h3':
        insertTextSnippet = '### ';
        break;
      case 'callout-note':
        insertTextSnippet = '> [!NOTE]\n> 提示内容\n\n';
        break;
      case 'callout-warn':
        insertTextSnippet = '> [!WARNING]\n> 警告内容\n\n';
        break;
      case 'quote':
        insertTextSnippet = '> 引用文本\n\n';
        break;
      case 'code':
        insertTextSnippet = '```typescript\n// 在此编写代码\nconst greeting = "Hello LongPost";\n```\n\n';
        break;
      case 'math':
        insertTextSnippet = '$$\n\\sum_{i=1}^{n} x_i = X\n$$\n\n';
        break;
      case 'mermaid':
        insertTextSnippet = '```mermaid\ngraph TD\n  A[构思] --> B(编写长文)\n  B --> C[优雅发布]\n```\n\n';
        break;
      case 'task':
        insertTextSnippet = '- [ ] 待办事项\n';
        break;
      case 'table':
        insertTextSnippet = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 文本 | 文本 | 文本 |\n\n';
        break;
      case 'divider':
        insertTextSnippet = '\n---\n\n';
        break;
      case 'chart':
        if (onOpenChartDialog) {
          onOpenChartDialog();
        }
        break;
    }

    const nextVal = beforeSlash + insertTextSnippet + afterPos;
    updateContent(nextVal);
    setSlashMenuOpen(false);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = beforeSlash.length + insertTextSnippet.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  // 预览区渲染（含 Chart 与 Mermaid 识别）
  const renderPreviewSegments = () => {
    const segments = splitChartCards(value);
    return segments.map((seg, idx) => {
      if (seg.kind === 'chart') {
        return <ChartBlock key={`chart-${idx}`} card={seg.card} />;
      }
      if (seg.kind === 'invalid-chart') {
        return (
          <pre key={`err-chart-${idx}`} className="my-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">
            <code>{seg.raw}</code>
          </pre>
        );
      }

      // 检查段落中是否包含 ```mermaid
      const parts = seg.content.split(/(```mermaid[\s\S]*?```)/g);
      return (
        <div key={`seg-${idx}`}>
          {parts.map((part, pIdx) => {
            if (part.startsWith('```mermaid') && part.endsWith('```')) {
              const code = part.replace(/^```mermaid\s*/, '').replace(/```$/, '').trim();
              return <MermaidRenderer key={`mermaid-${pIdx}`} chart={code} />;
            }
            if (!part.trim()) return null;
            return (
              <Markdown key={`md-${pIdx}`} className="prose dark:prose-invert max-w-none my-2">
                {part}
              </Markdown>
            );
          })}
        </div>
      );
    });
  };

  const handleInsertWhiteboardImage = (dataUrl: string) => {
    insertText(`\n\n![架构草图](${dataUrl})\n\n`);
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col transition-all duration-300 ${
        isLite
          ? 'rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-2xl shadow-2xl'
          : 'rounded-2xl border border-[#dadce0] dark:border-[#3c4043] bg-[#f8fafd] dark:bg-[#1e1f20] shadow-md'
      } ${isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none bg-background' : ''}`}
    >
      {/* 顶部工具条 */}
      <EditorToolbar
        onInsertText={insertText}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onOpenChartDialog={onOpenChartDialog || (() => {})}
        onOpenExportModal={() => setShowExportModal(true)}
        wordCount={wordCount}
        readingTimeMinutes={readingTime}
        onOpenWhiteboard={() => setShowWhiteboard(true)}
        onOpenDiff={() => setShowDiff(true)}
        onOpenGraph={() => setShowGraph(true)}
        onOpenWritingLab={() => setShowWritingLab(true)}
      />

      {/* 编辑与预览工作区 */}
      <div className={`flex flex-1 min-h-[${minHeight}] overflow-hidden`}>
        {/* 编辑区 */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            className={`relative flex-1 p-5 overflow-y-auto ${
              viewMode === 'split' ? 'border-r border-border/60' : ''
            }`}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onSelect={handleSelectText}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              style={{ minHeight }}
              className={`w-full h-full bg-transparent text-base text-foreground placeholder:text-muted-foreground/50 resize-none outline-none border-none leading-relaxed ${
                isLite ? 'font-sans tracking-tight' : 'font-sans'
              }`}
            />
          </div>
        )}

        {/* 实时预览区 */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className={`flex-1 p-6 overflow-y-auto ${
              isLite ? 'bg-white/40 dark:bg-zinc-900/40' : 'bg-muted/10'
            } ${viewMode === 'split' ? 'hidden md:block' : ''}`}
          >
            {value.trim() ? (
              <div className="article-preview-content max-w-3xl mx-auto">
                {renderPreviewSegments()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 py-16">
                <p className="text-sm">右侧将实时渲染您的长文与图表排版</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 浮动菜单 */}
      {slashMenuOpen && (
        <SlashCommandMenu
          position={slashPosition}
          onClose={() => setSlashMenuOpen(false)}
          onSelect={handleSelectSlashCommand}
          filterText={slashFilter}
          onOpenChartDialog={onOpenChartDialog}
        />
      )}

      {bubbleMenuOpen && (
        <BubbleMenu
          position={bubblePosition}
          onApplyFormat={applyFormat}
          onClose={() => setBubbleMenuOpen(false)}
        />
      )}

      {/* 导出弹窗 */}
      <ExportModal
        title={title}
        content={value}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {/* 专业版 4 大本地功能弹窗 */}
      <WhiteboardCanvas
        isOpen={showWhiteboard}
        onClose={() => setShowWhiteboard(false)}
        onInsertImage={handleInsertWhiteboardImage}
      />

      <DiffInspector
        isOpen={showDiff}
        onClose={() => setShowDiff(false)}
        originalText={initialSnapshot}
        currentText={value}
        onRestoreOriginal={() => updateContent(initialSnapshot)}
      />

      <KnowledgeGraphView
        isOpen={showGraph}
        onClose={() => setShowGraph(false)}
        content={value}
        title={title}
      />

      <WritingLab
        isOpen={showWritingLab}
        onClose={() => setShowWritingLab(false)}
        content={value}
        onApplyFormattedContent={(formatted) => updateContent(formatted)}
      />
    </div>
  );
};
