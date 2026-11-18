import { FC } from 'react';
import { motion } from 'framer-motion';
import { Feather, Layers } from 'lucide-react';
import { useWorkspaceMode } from '@client/src/hooks/useWorkspaceMode';

interface WorkspaceModeSwitcherProps {
  compact?: boolean;
  className?: string;
}

export const WorkspaceModeSwitcher: FC<WorkspaceModeSwitcherProps> = ({
  compact = false,
  className = '',
}) => {
  const { mode, setMode } = useWorkspaceMode();

  return (
    <div
      className={`relative inline-flex items-center p-1 rounded-full transition-all duration-300 select-none ${
        mode === 'lite'
          ? 'bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300/60 dark:border-zinc-700/60 shadow-inner'
          : 'bg-[#e8f0fe] dark:bg-[#1f2633] border border-[#d2e3fc] dark:border-[#2f3d55] shadow-sm'
      } ${className}`}
      title="一键切换工作区风格 (快捷键: Alt+M)"
      role="group"
      aria-label="工作区风格模式切换"
    >
      {/* 极简版 (极简版) */}
      <button
        type="button"
        onClick={() => setMode('lite')}
        aria-pressed={mode === 'lite'}
        className={`relative z-10 flex min-h-11 sm:min-h-8 items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
          mode === 'lite'
            ? 'text-zinc-900 dark:text-zinc-100 font-semibold'
            : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
        } ${compact ? 'px-2.5 py-0.5' : ''}`}
      >
        <Feather className="w-3.5 h-3.5" aria-hidden="true" />
        <span>极简</span>
        {mode === 'lite' && (
          <motion.div
            layoutId="mode-pill-active"
            className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-full shadow-sm -z-10"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        )}
      </button>

      {/* 专业版 (专业版) */}
      <button
        type="button"
        onClick={() => setMode('pro')}
        aria-pressed={mode === 'pro'}
        className={`relative z-10 flex min-h-11 sm:min-h-8 items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
          mode === 'pro'
            ? 'text-[#1967d2] dark:text-[#8ab4f8] font-semibold'
            : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
        } ${compact ? 'px-2.5 py-0.5' : ''}`}
      >
        <Layers className="w-3.5 h-3.5" aria-hidden="true" />
        <span>专业</span>
        {mode === 'pro' && (
          <motion.div
            layoutId="mode-pill-active"
            className="absolute inset-0 bg-white dark:bg-[#283548] rounded-full shadow-sm -z-10 border border-blue-200/50 dark:border-blue-500/20"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        )}
      </button>
    </div>
  );
};
