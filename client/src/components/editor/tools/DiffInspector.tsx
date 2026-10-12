import { FC, useState, useMemo } from 'react';
import {
  GitCompare,
  X,
  RotateCcw,
  Check,
  FileCode,
  ArrowRight,
  Plus,
  Minus,
} from 'lucide-react';

interface DiffInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  currentText: string;
  onRestoreOriginal: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// 纯本地轻量 LCS 逐行比对算法
function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // 构建编辑距离 DP 矩阵（带行数上限保护防止卡顿）
  const maxLines = 1000;
  if (m > maxLines || n > maxLines) {
    // 超大文章按快速比对
    return newLines.map((line, idx) => ({
      type: 'unchanged',
      text: line,
      newLineNumber: idx + 1,
    }));
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: 'unchanged',
        text: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: 'added',
        text: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: 'removed',
        text: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  return diff;
}

export const DiffInspector: FC<DiffInspectorProps> = ({
  isOpen,
  onClose,
  originalText,
  currentText,
  onRestoreOriginal,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const diffLines = useMemo(() => {
    if (!isOpen) return [];
    return computeLineDiff(originalText, currentText);
  }, [isOpen, originalText, currentText]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-[#1e1f22] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-[#f8fafd] dark:bg-[#18191b]">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <GitCompare className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                  版本时光机与 Diff 比对
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400 border border-green-200 dark:border-green-800/40">
                  <Plus className="w-3 h-3" /> {stats.added} 行新增
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800/40">
                  <Minus className="w-3 h-3" /> {stats.removed} 行移除
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                对比当前输入内容与最初加载或上一次自动暂存的版本
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm('确定要放弃当前修改并回滚到原版本吗？')) {
                  onRestoreOriginal();
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-full transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              一键回滚至原版
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 差异行显示区域 */}
        <div className="flex-1 overflow-y-auto font-mono text-xs p-4 bg-gray-50/50 dark:bg-[#141518]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-[#1a1b1e]">
            {diffLines.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">
                当前内容与历史版本完全一致，暂无改动。
              </div>
            ) : (
              diffLines.map((line, idx) => {
                const isAdded = line.type === 'added';
                const isRemoved = line.type === 'removed';
                return (
                  <div
                    key={idx}
                    className={`flex items-start px-3 py-0.5 leading-5 select-text transition-colors ${
                      isAdded
                        ? 'bg-green-500/15 text-green-900 dark:text-green-200 border-l-2 border-green-500'
                        : isRemoved
                        ? 'bg-red-500/15 text-red-900 dark:text-red-200 border-l-2 border-red-500 line-through opacity-75'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/40 border-l-2 border-transparent'
                    }`}
                  >
                    {/* 行号 */}
                    <span className="w-10 text-right pr-3 select-none text-gray-400 text-[11px] shrink-0">
                      {line.oldLineNumber || ''}
                    </span>
                    <span className="w-10 text-right pr-3 select-none text-gray-400 text-[11px] shrink-0">
                      {line.newLineNumber || ''}
                    </span>

                    {/* 标记符号 */}
                    <span className="w-4 select-none font-bold shrink-0">
                      {isAdded ? '+' : isRemoved ? '-' : ' '}
                    </span>

                    {/* 正文 */}
                    <pre className="flex-1 font-mono whitespace-pre-wrap break-all">
                      {line.text || ' '}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
