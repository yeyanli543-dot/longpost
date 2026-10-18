import { Controller, Get, Inject, Logger, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import { appUsers, articles } from '@server/database/schema';
import { buildOgSvg } from '@server/common/utils/og-image';
import { renderOgPng } from './og-renderer';

/**
 * 动态分享图。
 *
 * 公开接口：爬虫（微信、X、Slack）拿 og:image 时不带任何凭据，
 * 所以这里不能要求登录；只读、只返回图片、带长缓存。
 */
@Controller('api/og')
export class OgController {
  private readonly logger = new Logger(OgController.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  /** /api/og/article/<id 或 slug>[.png] */
  @Get('article/:id')
  async article(@Param('id') rawId: string, @Res() res: Response): Promise<void> {
    const id = String(rawId || '').replace(/\.png$/i, '').trim();
    if (!id) {
      res.status(400).end();
      return;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let row: { title: string; excerpt: string | null; createdAt: Date | null; nickname: string | null } | undefined;
    try {
      const rows = await this.db
        .select({
          title: articles.title,
          excerpt: articles.excerpt,
          createdAt: articles.createdAt,
          nickname: appUsers.nickname,
        })
        .from(articles)
        .leftJoin(appUsers, eq(appUsers.id, articles.appUserId))
        .where(
          and(
            isUuid ? eq(articles.id, id) : eq(articles.slug, id),
            eq(articles.status, 'published'),
          ),
        )
        .limit(1);
      row = rows[0];
    } catch (error) {
      this.logger.warn('生成分享图失败: ' + String((error as Error)?.message || error));
      res.status(404).end();
      return;
    }

    if (!row) {
      res.status(404).end();
      return;
    }

    const siteName = (process.env.SITE_NAME || 'LongPost').trim();
    const svg = buildOgSvg({
      title: row.title || '无标题',
      authorName: row.nickname || undefined,
      date: row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : undefined,
      siteName,
      footer: (process.env.SITE_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '') || undefined,
    });

    try {
      const png = await renderOgPng(svg);
      res
        .status(200)
        .type('image/png')
        .setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
        .send(png);
    } catch (error) {
      this.logger.warn('分享图渲染失败: ' + String((error as Error)?.message || error));
      res.status(500).end();
    }
  }
}
