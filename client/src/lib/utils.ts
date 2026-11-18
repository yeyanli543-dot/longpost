import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind CSS 类名 (shadcn 规范)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * 从页面的同源 base 读取应用部署路径
 */
export function getAppBasePath(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.location.protocol === 'file:') return '/';
  try {
    const base = new URL(document.baseURI);
    if (base.origin !== window.location.origin) return '/';
    return base.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
}

/** 生成包含部署前缀的站点应用内部链接。 */
export function resolveAppUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  if (!path) return window.location.origin;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // The server supplies a same-origin <base> for installations mounted in a
  // subdirectory. Share links need that mount path as well as the assets do.
  const basePath = getAppBasePath().replace(/\/$/, '');
  return `${window.location.origin}${basePath}${normalizedPath}`;
}

/**
 * 弹出确认对话框
 */
export async function showConfirm(
  messageOrOptions: string | { title?: string; content?: string; okText?: string; cancelText?: string },
): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  let message = '';
  if (typeof messageOrOptions === 'string') {
    message = messageOrOptions;
  } else if (messageOrOptions) {
    message = [messageOrOptions.title, messageOrOptions.content].filter(Boolean).join('\n') || '确定执行此操作吗？';
  }

  return window.confirm(message);
}
