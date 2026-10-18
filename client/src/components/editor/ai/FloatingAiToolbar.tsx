import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Scissors,
  Type,
  Lightbulb,
  Check,
  CornerDownLeft,
  X,
  Settings,
  Square,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { streamChatCompletion } from '@/lib/ai/universal-llm-client';
import { searchLocalKnowledge, formatRAGContextPrompt } from '@/lib/ai/local-rag';

export type AiActionType = 'polish' | 'condense' | 'pangu' | 'continue';

interface FloatingAiToolbarProps {
  position: { top: number; left: number };
  selectedText: string;
  onReplaceSelection: (newText: string) => void;
  onInsertBelow: (text: string) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

export const FloatingAiToolbar: React.FC<FloatingAiToolbarProps> = ({
  position,
  selectedText,
  onReplaceSelection,
  onInsertBelow,
  onClose,
  onOpenSettings,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeAction, setActiveAction] = useState<AiActionType | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // 组件卸载时自动中止未完成的流式推理，杜绝内存泄漏
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !isGenerating
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, isGenerating]);

  // 取消正在进行的推理
  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  // 执行 AI 快捷动作
  const handleRunAction = async (action: AiActionType) => {
    setActiveAction(action);
    setIsGenerating(true);
    setGeneratedText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. 本地 RAG 混合语义检索相关上下文
      let ragPromptContext = '';
      try {
        const ragResults = await searchLocalKnowledge(selectedText, 2);
        ragPromptContext = formatRAGContextPrompt(ragResults);
      } catch {
        // ignore RAG error
      }

      // 2. 构造 System Prompt 与用户提示词
      let systemPrompt =
        '你是一名精通现代中文写作、学术规范与 Markdown 排版的资深文学/技术主编。请严格按要求处理用户给出的文字，直接输出修改后的文本本身，不要添加任何开场白、解释或问候。';
      if (ragPromptContext) {
        systemPrompt += ragPromptContext;
      }

      let userPrompt = '';
      switch (action) {
        case 'polish':
          userPrompt = `请对以下选中文本进行深度润色：提升语言表现力、行文质感与文采，理顺逻辑节奏，保持原有核心事实与语意：\n\n"${selectedText}"`;
          break;
        case 'condense':
          userPrompt = `请对以下选中文本进行精简提炼：剔除冗词赘字，保留核心主干与精华要点，使语言凝练有力、开门见山：\n\n"${selectedText}"`;
          break;
        case 'pangu':
          userPrompt = `请对以下选中文本执行严谨的中英文混排规范：\n1. 中文与英文单词、数字、半角符号之间严格插入适当空格；\n2. 规范全角中文标点与英文半角标点；\n3. 修正潜在错别字与语病，保持原意：\n\n"${selectedText}"`;
          break;
        case 'continue':
          userPrompt = `请根据以下文字的语境、意境与行文脉络，自然流畅地续写 1 至 2 个精彩段落：\n\n"${selectedText}"`;
          break;
      }

      // 3. 发起统一流式推理
      await streamChatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        signal: controller.signal,
        onChunk: (chunk) => {
          setGeneratedText((prev) => prev + chunk);
        },
      });
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`AI 生成中断: ${msg}`);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        top: `${Math.max(12, position.top - 8)}px`,
        left: `${Math.max(200, Math.min(window.innerWidth - 200, position.left))}px`,
        transform: 'translate(-50%, -100%)',
      }}
      className="fixed z-50 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-[#1a1b1e]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 text-gray-900 dark:text-gray-100 flex flex-col gap-1.5 min-w-[280px] max-w-[460px]"
    >
      {/* 头部快捷动作胶囊栏 */}
      <div className="flex items-center justify-between gap-1 select-none">
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <button
            onClick={() => handleRunAction('polish')}
            disabled={isGenerating}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeAction === 'polish'
                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
            title="提升文学文采与表达流畅度"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>智能润色</span>
          </button>

          <button
            onClick={() => handleRunAction('condense')}
            disabled={isGenerating}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeAction === 'condense'
                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
            title="去芜存菁，保留核心要点"
          >
            <Scissors className="w-3.5 h-3.5 text-blue-500" />
            <span>精简提炼</span>
          </button>

          <button
            onClick={() => handleRunAction('pangu')}
            disabled={isGenerating}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeAction === 'pangu'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
            title="盘古之中英文混排间距与标点规范"
          >
            <Type className="w-3.5 h-3.5 text-emerald-500" />
            <span>中英排版</span>
          </button>

          <button
            onClick={() => handleRunAction('continue')}
            disabled={isGenerating}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeAction === 'continue'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
            title="承接语境流畅续写衍生段落"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>续写衍生</span>
          </button>
        </div>

        <div className="flex items-center gap-0.5 pl-1 border-l border-gray-200 dark:border-gray-800">
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="配置 OpenAI / DeepSeek / Gemini / Ollama"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="关闭浮动栏"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 流式结果实时展示面板 */}
      {(isGenerating || generatedText) && (
        <div className="mt-1 p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-gray-800 flex flex-col gap-2.5 text-xs animate-in fade-in duration-150">
          <div className="max-h-48 overflow-y-auto leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap select-text font-sans">
            {generatedText}
            {isGenerating && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse align-middle" />
            )}
          </div>

          {/* 结果处置操作栏 */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-1.5">
              {isGenerating ? (
                <button
                  onClick={handleAbort}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 transition-colors"
                >
                  <Square className="w-3 h-3" />
                  <span>停止生成</span>
                </button>
              ) : (
                <button
                  onClick={() => activeAction && handleRunAction(activeAction)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-xs transition-colors"
                  title="重新生成"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>重试</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  onReplaceSelection(generatedText);
                  onClose();
                }}
                disabled={!generatedText}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 shadow-sm transition-all disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>一键替换选区</span>
              </button>

              <button
                onClick={() => {
                  onInsertBelow(generatedText);
                  onClose();
                }}
                disabled={!generatedText}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>插入到下方</span>
              </button>

              <button
                onClick={onClose}
                className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                放弃
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
