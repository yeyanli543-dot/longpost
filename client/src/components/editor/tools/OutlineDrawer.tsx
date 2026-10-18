import React, { useMemo } from 'react';
import { extractHeadings, type HeadingItem } from '@shared/text/headings';
import {
  ListTree,
  X,
  ChevronRight,
  Hash,
  Eye,
  Bookmark,
} from 'lucide-react';

export type { HeadingItem };
export { extractHeadings };

interface OutlineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onJumpToHeading: (charIndex: number, lineIndex: number) => void;
}

export const OutlineDrawer: React.FC<OutlineDrawerProps> = ({
  isOpen,
  onClose,
  content,
  onJumpToHeading,
}) => {
  const headings = useMemo(() => extractHeadings(content), [content]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white/95 dark:bg-[#1a1b1e]/95 backdrop-blur-xl border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <ListTree className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              章节大纲导航
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              共发现 {headings.length} 个层级标题
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 大纲列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {headings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-xs">
            <Bookmark className="w-8 h-8 opacity-30 mb-2" />
            <p>文档中尚未检测到标题</p>
            <p className="text-[11px] text-gray-500 mt-1">
              输入 # 一级标题、## 二级标题 即可生成导航
            </p>
          </div>
        ) : (
          headings.map((item) => {
            const indentClass =
              item.level === 1
                ? 'pl-2 font-semibold text-gray-900 dark:text-gray-100'
                : item.level === 2
                  ? 'pl-5 text-gray-700 dark:text-gray-300'
                  : item.level === 3
                    ? 'pl-8 text-gray-600 dark:text-gray-400 text-xs'
                    : 'pl-11 text-gray-500 dark:text-gray-500 text-xs';

            const badgeColor =
              item.level === 1
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : item.level === 2
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400';

            return (
              <button
                key={item.id}
                onClick={() => {
                  onJumpToHeading(item.charIndex, item.lineIndex);
                }}
                className={`w-full group flex items-center justify-between py-2 pr-2.5 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs ${indentClass}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${badgeColor}`}
                  >
                    H{item.level}
                  </span>
                  <span className="truncate">{item.text}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0 ml-1" />
              </button>
            );
          })
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/40 text-[11px] text-gray-400 flex items-center justify-between">
        <span>点击标题平滑定位光标</span>
        <span className="font-mono">第 {headings.length} 节</span>
      </div>
    </div>
  );
};
