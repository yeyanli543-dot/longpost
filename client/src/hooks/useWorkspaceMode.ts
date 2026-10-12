import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';

export type WorkspaceMode = 'lite' | 'pro';

const STORAGE_KEY = 'longpost_workspace_mode';

function applyWorkspaceMode(mode: WorkspaceMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'lite') {
    root.classList.add('mode-apple', 'mode-lite');
    root.classList.remove('mode-google', 'mode-pro');
    root.setAttribute('data-workspace-mode', 'lite');
  } else {
    root.classList.add('mode-google', 'mode-pro');
    root.classList.remove('mode-apple', 'mode-lite');
    root.setAttribute('data-workspace-mode', 'pro');
  }
}

export function useWorkspaceMode(): {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
  isLite: boolean;
  isPro: boolean;
} {
  const [mode, setModeState] = useState<WorkspaceMode>(() => {
    if (typeof window === 'undefined') return 'pro';
    const saved = localStorage.getItem(STORAGE_KEY) as WorkspaceMode | null;
    return saved === 'lite' || saved === 'pro' ? saved : 'pro';
  });

  useEffect(() => {
    applyWorkspaceMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (err) {
      logger.error('保存工作区模式偏好失败', err);
    }
  }, [mode]);

  // 全局快捷键 Alt+M 快速切换模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setModeState((prev) => (prev === 'lite' ? 'pro' : 'lite'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const setMode = useCallback((newMode: WorkspaceMode) => {
    setModeState(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'lite' ? 'pro' : 'lite'));
  }, []);

  return {
    mode,
    setMode,
    toggleMode,
    isLite: mode === 'lite',
    isPro: mode === 'pro',
  };
}
