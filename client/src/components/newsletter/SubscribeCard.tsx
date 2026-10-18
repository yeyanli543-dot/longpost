import { useCallback, useEffect, useState } from 'react';
import { Mail, Check, AlertCircle } from 'lucide-react';

import { getNewsletterStats, subscribeNewsletter } from '@/api/newsletter';

type Status = 'idle' | 'sending' | 'done' | 'error';

/**
 * 订阅卡片。
 *
 * 三个体验细节：
 * 1. 提交后无论邮箱是否已存在都显示同一句「去看看邮箱」——
 *    接口本身不区分，前端也不该假装能区分；
 * 2. 失败时保留输入内容，别让用户重打一遍；
 * 3. 站点没开 newsletter 时整块不渲染，不留一个点了没反应的按钮。
 */
export default function SubscribeCard({ source = 'article' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getNewsletterStats()
      .then((stats) => {
        if (!alive) return;
        setEnabled(stats.enabled);
        setCount(stats.count);
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const value = email.trim();
      if (!value || status === 'sending') return;

      setStatus('sending');
      setMessage('');
      try {
        await subscribeNewsletter(value, source);
        setStatus('done');
        setMessage('确认信已发出，去邮箱点一下链接就订阅成功了。');
        setEmail('');
      } catch (error) {
        setStatus('error');
        setMessage(
          error instanceof Error && error.message ? error.message : '订阅失败，稍后再试',
        );
      }
    },
    [email, source, status],
  );

  if (enabled === false) return null;

  return (
    <section className="mt-8 rounded-2xl border border-[#2f3336] bg-[#0c0d0f] p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[#e7e9ea]">订阅新文章</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#71767b]">
            有新文章时发一封邮件给你，不发别的，随时可以退订。
            {count !== null && count > 0 ? ` 已有 ${count} 位订阅者。` : ''}
          </p>

          <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status !== 'idle') setStatus('idle');
              }}
              placeholder="you@example.com"
              aria-label="邮箱地址"
              className="h-10 flex-1 rounded-lg border border-[#2f3336] bg-transparent px-3 text-sm text-[#e7e9ea] placeholder:text-[#71767b] focus:border-[#1d9bf0] focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === 'sending' || email.trim().length === 0}
              className="h-10 rounded-lg bg-[#1d9bf0] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {status === 'sending' ? '发送中…' : '订阅'}
            </button>
          </form>

          {message ? (
            <p
              className={`mt-2 flex items-center gap-1.5 text-xs ${
                status === 'error' ? 'text-[#f4212e]' : 'text-[#00ba7c]'
              }`}
            >
              {status === 'error' ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
