import { useEffect, useSyncExternalStore } from 'react';
import { logger } from '@/lib/logger';

export type WorkspaceMode = 'lite' | 'pro';

const STORAGE_KEY = 'longpost_workspace_mode';

function readMode(): WorkspaceMode {
  if (typeof window === 'undefined') return 'pro';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'lite' ? 'lite' : 'pro';
  } catch {
    return 'pro';
  }
}

function applyWorkspaceMode(mode: WorkspaceMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('mode-apple', mode === 'lite');
  root.classList.toggle('mode-lite', mode === 'lite');
  root.classList.toggle('mode-google', mode === 'pro');
  root.classList.toggle('mode-pro', mode === 'pro');
  root.setAttribute('data-workspace-mode', mode);
}

// A single store keeps the shell, editor and switcher in sync. It also means a
// shortcut is handled once even when several components use this hook.
let currentMode = readMode();
const listeners = new Set<() => void>();

function setMode(mode: WorkspaceMode): void {
  if (mode !== 'lite' && mode !== 'pro') return;
  currentMode = mode;
  applyWorkspaceMode(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch (err) {
    logger.error('保存工作区模式偏好失败', err);
  }
  listeners.forEach((listener) => listener());
}

function toggleMode(): void {
  setMode(currentMode === 'lite' ? 'pro' : 'lite');
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey && !event.repeat && event.key.toLowerCase() === 'm') {
    event.preventDefault();
    toggleMode();
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  currentMode = event.newValue === 'lite' ? 'lite' : 'pro';
  applyWorkspaceMode(currentMode);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function useWorkspaceMode(): {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
  isLite: boolean;
  isPro: boolean;
} {
  const mode = useSyncExternalStore<WorkspaceMode>(subscribe, () => currentMode, () => 'pro');
  useEffect(() => { applyWorkspaceMode(mode); }, [mode]);
  return { mode, setMode, toggleMode, isLite: mode === 'lite', isPro: mode === 'pro' };
}
