import {
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import {
  articles,
  articleImages,
  articleAttachments,
  appUsers,
} from '@server/database/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import {
  markdownToHtml,
  formatSize,
  getFileExt,
  formatDate,
} from '@server/common/utils/markdown-render';
import {
  buildArticleHtml,
  buildNotFoundHtml,
} from '@server/common/utils/article-template';

function getRequestBaseUrl(req: Request): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const forwardedProto = req.headers['x-forwarded-proto'];
  const host = (forwardedHost as string) || req.get('host') || '';
  const protocol = (forwardedProto as string) || req.protocol || 'https';
  return `${protocol}://${host}`;
}

function toAbsoluteUrl(url: string, baseUrl: string, reqPath: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const u = new URL(url);
      const base = new URL(baseUrl);
      if (u.host !== base.host) {
        u.protocol = base.protocol;
        u.host = base.host;
        return u.toString();
      }
      return url;
    } catch {
      return url;
    }
  }
  const { protocol, host } = new URL(baseUrl);
  if (url.startsWith('/')) return `${protocol}//${host}${url}`;
  return `${protocol}//${host}/${url}`;
}

interface OgRenderData {
  __platform__: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  twitterCard: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str);
}

interface FullArticle {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  coverUrl: string | null;
  authorName: string;
  readCount: number;
  likeCount: number;
  commentCount: number;
  bookmarkCount: number;
  createdAt: Date;
  images: string[];
  attachments: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number | null;
  }>;
}

@Controller()
export class ViewController {
  private readonly logger = new Logger(ViewController.name);
  private readonly siteName = 'LongPost';

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  @Get('p/:slug')
  async renderSharePageBySlug(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.renderShareArticle(slug, true, req, res);
  }

  @Get('article/:id')
  async renderSharePageById(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!isUuid(id)) {
      res.status(404).send(buildNotFoundHtml(this.siteName));
      return;
    }
    return this.renderShareArticle(id, false, req, res);
  }

  private async renderShareArticle(
    identifier: string,
    bySlug: boolean,
    req: Request,
    res: Response,
  ): Promise<void> {
    const platformData = req.__platform_data__ ?? {};
    const platformJson = JSON.stringify(platformData).replace(/'/g, "\\'");
    const baseUrl = getRequestBaseUrl(req);
    const fullUrl = `${baseUrl}${req.originalUrl}`;

    try {
      const article = await this.fetchArticleFull(identifier, bySlug);

      if (!article) {
        res.status(404).send(buildNotFoundHtml(this.siteName));
        return;
      }

      void this.db
        .update(articles)
        .set({ readCount: sql`${articles.readCount} + 1` })
        .where(eq(articles.id, article.id))
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to increment read count for ${identifier}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });

      const absoluteCover = article.coverUrl
        ? toAbsoluteUrl(article.coverUrl, fullUrl, req.path)
        : '';
      const absoluteImages = article.images.map((img) =>
        toAbsoluteUrl(img, fullUrl, req.path),
      );

      const html = buildArticleHtml({
        siteName: this.siteName,
        platformJson,
        title: article.title,
        excerpt: article.excerpt || this.siteName,
        coverUrl: absoluteCover,
        fullUrl,
        authorName: article.authorName,
        publishedAt: formatDate(article.createdAt),
        bodyHtml: markdownToHtml(article.content),
        images: absoluteImages,
        attachments: article.attachments.map((att) => ({
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          ext: getFileExt(att.fileName),
          sizeLabel: formatSize(att.fileSize),
        })),
        readCount: article.readCount + 1,
        commentCount: article.commentCount,
        likeCount: article.likeCount,
        bookmarkCount: article.bookmarkCount,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Share page render failed for ${bySlug ? '/p/' : '/article/'}${identifier}: ${errMsg}`,
      );
      if (errMsg.includes('22P02') || errMsg.includes('invalid input syntax')) {
        res.status(404).send(buildNotFoundHtml(this.siteName));
        return;
      }
      res.status(500).send(buildNotFoundHtml(this.siteName));
    }
  }

  @Get(['/', '*'])
  @Render('index')
  async render(@Req() req: Request): Promise<OgRenderData> {
    const platformData = req.__platform_data__ ?? {};
    const baseData: OgRenderData = {
      __platform__: JSON.stringify(platformData),
      ogTitle: 'LongPost',
      ogDescription: '长文发布平台',
      ogImage: '',
      ogUrl: '',
      twitterCard: 'summary_large_image',
    };

    const path = req.path;
    const baseUrl = getRequestBaseUrl(req);

    try {
      const articleId = this.extractArticleIdentifier(path);
      if (articleId) {
        const ogData = await this.fetchArticleOg(articleId);
        if (ogData) {
          return {
            ...baseData,
            ogTitle: ogData.title,
            ogDescription: ogData.excerpt ?? baseData.ogDescription,
            ogImage: ogData.coverUrl ?? '',
            ogUrl: `${baseUrl}${req.originalUrl}`,
          };
        }
      }
    } catch (err) {
      this.logger.warn(
        `OG lookup failed for ${path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return baseData;
  }

  private extractArticleIdentifier(path: string): string | null {
    const cleanPath = path.replace(/^\/app\/[^/]+/, '');

    const slugMatch = cleanPath.match(/^\/p\/([^/]+)\/?$/);
    if (slugMatch) return slugMatch[1];

    const articleMatch = cleanPath.match(/^\/article\/([^/]+)\/?$/);
    if (articleMatch && isUuid(articleMatch[1])) return articleMatch[1];

    return null;
  }

  private async fetchArticleOg(
    identifier: string,
  ): Promise<{
    title: string;
    excerpt: string | null;
    coverUrl: string | null;
  } | null> {
    const bySlug = !isUuid(identifier);

    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
      })
      .from(articles)
      .where(
        and(
          bySlug
            ? eq(articles.slug, identifier)
            : eq(articles.id, identifier),
          eq(articles.status, 'published'),
          eq(articles.moderationStatus, 'approved'),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    const article = rows[0];
    let finalCoverUrl: string | null = article.coverUrl;

    if (!finalCoverUrl) {
      const firstImg = await this.db
        .select({ imageUrl: articleImages.imageUrl })
        .from(articleImages)
        .where(eq(articleImages.articleId, article.id))
        .orderBy(asc(articleImages.sortOrder), asc(articleImages.id))
        .limit(1);
      if (firstImg.length > 0) {
        finalCoverUrl = firstImg[0].imageUrl;
      }
    }

    return {
      title: article.title,
      excerpt: article.excerpt,
      coverUrl: finalCoverUrl,
    };
  }

  private async fetchArticleFull(
    identifier: string,
    bySlug: boolean,
  ): Promise<FullArticle | null> {
    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        readCount: articles.readCount,
        likeCount: articles.likeCount,
        commentCount: articles.commentCount,
        bookmarkCount: articles.bookmarkCount,
        createdAt: articles.createdAt,
        authorNickname: appUsers.nickname,
      })
      .from(articles)
      .leftJoin(appUsers, eq(articles.appUserId, appUsers.id))
      .where(
        and(
          bySlug
            ? eq(articles.slug, identifier)
            : eq(articles.id, identifier),
          eq(articles.status, 'published'),
          eq(articles.moderationStatus, 'approved'),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    const article = rows[0];

    const [imgs, atts] = await Promise.all([
      this.db
        .select({ imageUrl: articleImages.imageUrl })
        .from(articleImages)
        .where(eq(articleImages.articleId, article.id))
        .orderBy(asc(articleImages.sortOrder), asc(articleImages.id)),
      this.db
        .select({
          fileName: articleAttachments.fileName,
          fileUrl: articleAttachments.fileUrl,
          fileSize: articleAttachments.fileSize,
        })
        .from(articleAttachments)
        .where(eq(articleAttachments.articleId, article.id))
        .orderBy(
          asc(articleAttachments.sortOrder),
          asc(articleAttachments.id),
        ),
    ]);

    return {
      id: article.id,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      coverUrl: article.coverUrl,
      authorName: article.authorNickname || '匿名作者',
      readCount: article.readCount,
      likeCount: article.likeCount,
      commentCount: article.commentCount,
      bookmarkCount: article.bookmarkCount,
      createdAt: article.createdAt,
      images: imgs.map((i) => i.imageUrl),
      attachments: atts.map((a) => ({
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
      })),
    };
  }
}
