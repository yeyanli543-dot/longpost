import { FC, useMemo } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  BarChart,
  Wand2,
  Sliders,
} from 'lucide-react';
import { toast } from 'sonner';

interface WritingLabProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onApplyFormattedContent: (formattedText: string) => void;
}

// 盘古之白规则：中英文、数字之间自动添加适度空格美化（保护代码块、行内代码、链接/图片及行首缩进）
function panguFormat(text: string): string {
  const placeholders: string[] = [];
  const stash = (match: string) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\u0000PANGU_PH_${idx}\u0000`;
  };

  let result = text;
  // 1. 保护多行代码块 ```...```
  result = result.replace(/```[\s\S]*?```/g, stash);
  // 2. 保护行内代码 `...`
  result = result.replace(/`[^`\n]+`/g, stash);
  // 3. 保护 Markdown 图片与链接 ![...](...) / [...](...)
  result = result.replace(/!?\[[^\]]*\]\([^)]*\)/g, stash);

  // 4. 逐行处理正文，保留行首缩进 ^[ \t]+
  result = result
    .split('\n')
    .map((line) => {
      const indentMatch = line.match(/^([ \t]+)(.*)$/);
      const indent = indentMatch ? indentMatch[1] : '';
      let body = indentMatch ? indentMatch[2] : line;

      // 中文与英文/数字之间加空格
      body = body.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
      body = body.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
      // 中文与百分号/数字
      body = body.replace(/([\u4e00-\u9fa5])([0-9]+%?)/g, '$1 $2');
      body = body.replace(/([0-9]+%?)([\u4e00-\u9fa5])/g, '$1 $2');
      // 修正多余水平空格（不影响行首缩进）
      body = body.replace(/[ \t]{2,}/g, ' ');

      return indent + body;
    })
    .join('\n');

  // 5. 还原受保护片段
  result = result.replace(/\u0000PANGU_PH_(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)] ?? '');
  return result;
}

export const WritingLab: FC<WritingLabProps> = ({
  isOpen,
  onClose,
  content,
  onApplyFormattedContent,
}) => {
  const analysis = useMemo(() => {
    if (!content) {
      return {
        chineseCount: 0,
        englishWords: 0,
        numCount: 0,
        paragraphs: 0,
        avgSentenceLength: 0,
        readTimeStandard: 0,
        readTimeFast: 0,
        difficultyLevel: '极简',
        topWords: [] as { word: string; count: number }[],
      };
    }

    const chineseMatches = content.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    const numMatches = content.match(/[0-9]/g) || [];
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;

    // 句子统计
    const sentences = content.split(/[。！？.!?\n]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLength = sentences.length > 0
      ? Math.round((chineseMatches.length + englishWords) / sentences.length)
      : 0;

    // 阅读耗时（分）
    const totalWords = chineseMatches.length + englishWords;
    const readTimeStandard = Math.max(1, Math.ceil(totalWords / 350));
    const readTimeFast = Math.max(1, Math.ceil(totalWords / 600));

    // 可读性难度判断
    let difficultyLevel = '大众易读';
    if (avgSentenceLength > 45) {
      difficultyLevel = '学术深度（句子偏长）';
    } else if (avgSentenceLength > 28) {
      difficultyLevel = '深度读物';
    } else if (avgSentenceLength > 15) {
      difficultyLevel = '通俗流畅';
    } else {
      difficultyLevel = '极简轻快';
    }

    // 词频简易统计（中文按2-4字切词统计，英文单词统计）
    const wordFreq: Record<string, number> = {};
    const words: string[] = (content.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z]{3,}/g) || []) as string[];
    const stopwords = new Set(['我们', '可以', '这个', '一个', '通过', '进行', '因为', '所以', '如果', '为了', '并且']);

    words.forEach((w: string) => {
      const lower = w.toLowerCase();
      if (!stopwords.has(lower)) {
        wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      }
    });

    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));

    return {
      chineseCount: chineseMatches.length,
      englishWords,
      numCount: numMatches.length,
      paragraphs,
      avgSentenceLength,
      readTimeStandard,
      readTimeFast,
      difficultyLevel,
      topWords,
    };
  }, [content]);

  const handleFormat = () => {
    const formatted = panguFormat(content);
    if (formatted === content) {
      toast.info('当前文本排版已经非常标准，无需调整！');
    } else {
      onApplyFormattedContent(formatted);
      toast.success('已自动完成中英文混排空格规范化美化！');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#1f2023] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-[#f8fafd] dark:bg-[#18191b]">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                写作实验室 (Writing Lab)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                多维深度文本健康度剖析与盘古之白排版自检
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFormat}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full shadow-sm transition-all"
            >
              <Wand2 className="w-3.5 h-3.5" />
              一键排版美化 (中英文规范)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 内容展示区 */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* 基础指标卡片群 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#282a2d] border border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400">中文字数</span>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                {analysis.chineseCount}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#282a2d] border border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400">英文词数</span>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                {analysis.englishWords}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#282a2d] border border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400">平均句长</span>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                {analysis.avgSentenceLength} 字/句
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#282a2d] border border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400">段落数</span>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                {analysis.paragraphs}
              </p>
            </div>
          </div>

          {/* 可读性与耗时 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-blue-50/40 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium text-sm mb-2">
                <BarChart className="w-4 h-4" />
                可读性评级
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {analysis.difficultyLevel}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                根据平均句子长度与中英文比例计算得出的适合受众难度。
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-teal-50/40 dark:bg-teal-950/20">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-medium text-sm mb-2">
                <Clock className="w-4 h-4" />
                阅读耗时预估
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                正常 ~{analysis.readTimeStandard} 分钟 / 速读 ~{analysis.readTimeFast} 分钟
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                基于标准每分钟 350 字与快速浏览 600 字模型。
              </p>
            </div>
          </div>

          {/* 高频词云 */}
          {analysis.topWords.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">
                高频核心词 TOP 8
              </h4>
              <div className="flex flex-wrap gap-2">
                {analysis.topWords.map(({ word, count }) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full text-xs font-medium"
                  >
                    <span>{word}</span>
                    <span className="text-[10px] text-gray-400 bg-white dark:bg-gray-700 px-1.5 py-0.2 rounded-full font-mono">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
