import { axiosForBackend } from '@/lib/axios';

export interface NewsletterStats {
  enabled: boolean;
  count: number;
}

/** 订阅。后端无论邮箱是否已存在都返回 202，所以这里只看请求是否成功 */
export async function subscribeNewsletter(email: string, source?: string): Promise<void> {
  await axiosForBackend.post('/api/newsletter/subscribe', { email, source });
}

export async function getNewsletterStats(): Promise<NewsletterStats> {
  const res = await axiosForBackend.get<NewsletterStats>('/api/newsletter/stats');
  return res.data;
}
