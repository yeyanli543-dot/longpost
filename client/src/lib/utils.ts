import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind CSS 类名 (shadcn 规范)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * 生成包含完整前缀的站点应用内部链接
 */
export function resolveAppUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  if (!path) return window.location.origin;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${normalizedPath}`;
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