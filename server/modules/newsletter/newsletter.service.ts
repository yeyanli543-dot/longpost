/**
 * Newsletter 订阅与推送。
 *
 * 三个刻意的设计：
 *
 * 1. **双向确认（double opt-in）**：订阅只是「意向」，点了确认信才算数。
 *    这既是反垃圾邮件的基本要求，也保护了被同事随手填了邮箱的人。
 * 2. **订阅接口永远返回成功**：不告诉调用方「这个邮箱已存在 / 不存在」，
 *    否则它就变成了一个邮箱存在性探测接口。
 * 3. **推送幂等**：每篇文章只发一次（newsletter_issues.article_id 唯一），
 *    服务重启或重复触发都不会给订阅者发第二封。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import { newsletterIssues, newsletterSubscribers } from '@server/database/schema';
import { Mailer } from '@server/common/mail/mailer';
import {
  buildArticleIssueEmail,
  buildConfirmEmail,
  generateToken,
  isValidEmail,
  normalizeEmail,
} from '@server/common/utils/newsletter';

export interface SubscribeResult {
  ok: boolean;
  /** 仅用于日志与测试，不会返回给调用方 */
  reason?: 'invalid' | 'already_active' | 'sent' | 'resent';
}

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly mailer: Mailer,
  ) {}

  /** 站点对外地址，用于拼确认/退订链接 */
  private baseUrl(): string {
    const configured = (process.env.SITE_URL || process.env.APP_URL || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    const port = process.env.SERVER_PORT || '3000';
    return 'http://localhost:' + port;
  }

  private siteName(): string {
    return (process.env.SITE_NAME || 'LongPost').trim();
  }

  get enabled(): boolean {
    return process.env.NEWSLETTER_ENABLED === 'true';
  }

  /**
   * 订阅。无论邮箱是否存在都返回 ok，避免被用来探测用户。
   */
  async subscribe(rawEmail: string, source?: string): Promise<SubscribeResult> {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) return { ok: true, reason: 'invalid' };

    const existing = await this.db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    const confirmToken = generateToken();
    const unsubscribeToken = generateToken();

    if (existing.length === 0) {
      await this.db.insert(newsletterSubscribers).values({
        email,
        status: 'pending',
        confirmToken,
        unsubscribeToken,
        source: source || 'web',
      });
    } else if (existing[0].status === 'active') {
      return { ok: true, reason: 'already_active' };
    } else {
      // pending 或已退订后又想订回来：换新令牌重新发确认信
      await this.db
        .update(newsletterSubscribers)
        .set({ status: 'pending', confirmToken, unsubscribeToken, unsubscribedAt: null })
        .where(eq(newsletterSubscribers.id, existing[0].id));
    }

    const mail = buildConfirmEmail({
      siteName: this.siteName(),
      email,
      confirmUrl: this.baseUrl() + '/api/newsletter/confirm?token=' + confirmToken,
    });

    const sent = await this.mailer.send({ to: email, ...mail });
    if (!sent) this.logger.warn('确认信发送失败: ' + email);
    return { ok: true, reason: 'sent' };
  }

  /** 确认订阅；令牌无效返回 false */
  async confirm(token: string): Promise<boolean> {
    const clean = String(token || '').trim();
    if (!clean) return false;

    const rows = await this.db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.confirmToken, clean))
      .limit(1);
    if (rows.length === 0) return false;

    await this.db
      .update(newsletterSubscribers)
      .set({ status: 'active', confirmedAt: new Date() })
      .where(eq(newsletterSubscribers.id, rows[0].id));
    return true;
  }

  /** 退订；令牌无效返回 false */
  async unsubscribe(token: string): Promise<boolean> {
    const clean = String(token || '').trim();
    if (!clean) return false;

    const rows = await this.db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.unsubscribeToken, clean))
      .limit(1);
    if (rows.length === 0) return false;

    await this.db
      .update(newsletterSubscribers)
      .set({ status: 'unsubscribed', unsubscribedAt: new Date() })
      .where(eq(newsletterSubscribers.id, rows[0].id));
    return true;
  }

  async countActive(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, 'active'));
    return Number(row?.n || 0);
  }

  /** 后台列表（只给管理员） */
  async list(limit = 100): Promise<Array<{ id: string; email: string; status: string; source: string | null; createdAt: Date | null; confirmedAt: Date | null }>> {
    const rows = await this.db
      .select({
        id: newsletterSubscribers.id,
        email: newsletterSubscribers.email,
        status: newsletterSubscribers.status,
        source: newsletterSubscribers.source,
        createdAt: newsletterSubscribers.createdAt,
        confirmedAt: newsletterSubscribers.confirmedAt,
      })
      .from(newsletterSubscribers)
      .orderBy(desc(newsletterSubscribers.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
    return rows as never;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.id, id));
  }

  /**
   * 新文章推送。
   * 不抛异常：订阅推送是后台动作，失败只记日志。
   */
  async broadcastArticle(article: {
    id: string;
    title: string;
    excerpt?: string | null;
    slug?: string | null;
    authorName?: string | null;
  }): Promise<{ sent: number; failed: number; skipped: boolean }> {
    if (!this.enabled) return { sent: 0, failed: 0, skipped: true };

    const already = await this.db
      .select({ id: newsletterIssues.id })
      .from(newsletterIssues)
      .where(eq(newsletterIssues.articleId, article.id))
      .limit(1);
    if (already.length > 0) return { sent: 0, failed: 0, skipped: true };

    const [issue] = await this.db
      .insert(newsletterIssues)
      .values({ articleId: article.id, subject: article.title || '新文章', status: 'sending' })
      .returning({ id: newsletterIssues.id });

    const subscribers = await this.db
      .select({ email: newsletterSubscribers.email, token: newsletterSubscribers.unsubscribeToken })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, 'active'));

    const url = this.baseUrl() + (article.slug ? '/p/' + article.slug : '/article/' + article.id);
    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      const mail = buildArticleIssueEmail({
        siteName: this.siteName(),
        title: article.title || '新文章',
        summary: (article.excerpt || '').slice(0, 160),
        url,
        authorName: article.authorName || undefined,
        unsubscribeUrl: this.baseUrl() + '/api/newsletter/unsubscribe?token=' + sub.token,
      });

      const ok = await this.mailer.send({ to: sub.email, ...mail });
      if (ok) sent += 1;
      else failed += 1;
    }

    if (issue) {
      await this.db
        .update(newsletterIssues)
        .set({ sentCount: sent, failedCount: failed, status: failed > 0 ? 'partial' : 'done', finishedAt: new Date() })
        .where(eq(newsletterIssues.id, issue.id));
    }

    this.logger.log('推送完成: ' + (article.title || '') + ' 成功 ' + sent + ' / 失败 ' + failed);
    return { sent, failed, skipped: false };
  }

  /** 订阅者导出（CSV，管理员用） */
  async exportCsv(): Promise<string> {
    const rows = await this.db
      .select({ email: newsletterSubscribers.email, status: newsletterSubscribers.status, createdAt: newsletterSubscribers.createdAt })
      .from(newsletterSubscribers)
      .orderBy(desc(newsletterSubscribers.createdAt));

    const escape = (value: string) => '"' + String(value).replace(/"/g, '""') + '"';
    const lines = ['email,status,created_at'];
    for (const row of rows) {
      lines.push([escape(row.email), escape(row.status), escape(row.createdAt ? new Date(row.createdAt).toISOString() : '')].join(','));
    }
    return lines.join('\n');
  }
}
