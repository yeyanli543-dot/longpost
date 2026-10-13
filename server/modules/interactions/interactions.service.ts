import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@server/database/database.module';
import {
  likes,
  bookmarks,
  reposts,
  posts,
  articles,
} from '@server/database/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { NotificationsService } from '../notifications/notifications.service';
import { contentGuard } from '@server/common/utils/content-guard';
import type {
  ToggleLikeResponse,
  ToggleBookmarkResponse,
  ToggleRepostResponse,
  CommentContentType,
} from '@shared/api.interface';

type CountType = 'like' | 'repost' | 'bookmark' | 'comment';

function extractPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string') return code;
    current = cause;
  }
  return undefined;
}

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly notificationsService: NotificationsService,
  ) {}

  async toggleLike(
    userId: string,
    contentType: CommentContentType,
    contentId: string,
  ): Promise<ToggleLikeResponse> {
    const contentTable = this.getContentTable(contentType);
    const contentAuthorCol =
      contentType === 'post' ? posts.appUserId : articles.appUserId;

    const contentRows = await this.db
      .select({ id: contentTable.id, authorId: contentAuthorCol })
      .from(contentTable)
      .where(eq(contentTable.id, contentId))
      .limit(1);
    if (contentRows.length === 0) {
      throw new NotFoundException(`${contentType} not found`);
    }
    const authorId = contentRows[0].authorId;

    const result = await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.userId, userId),
            eq(likes.contentType, contentType),
            eq(likes.contentId, contentId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await tx.delete(likes).where(eq(likes.id, existing[0].id));
        const updated = await tx
          .update(contentTable)
          .set({ likeCount: sql`GREATEST(0, ${contentTable.likeCount} - 1)` })
          .where(eq(contentTable.id, contentId))
          .returning({ count: contentTable.likeCount });
        return { liked: false, likeCount: Number(updated[0].count) };
      } else {
        await tx.insert(likes).values({
          userId,
          contentType,
          contentId,
        });
        const updated = await tx
          .update(contentTable)
          .set({ likeCount: sql`${contentTable.likeCount} + 1` })
          .where(eq(contentTable.id, contentId))
          .returning({ count: contentTable.likeCount });
        return { liked: true, likeCount: Number(updated[0].count) };
      }
    });

    // Notify content author on like
    if (result.liked && authorId && authorId !== userId) {
      try {
        await this.notificationsService.createNotification(
          authorId,
          'like',
          userId,
          contentType,
          contentId,
        );
      } catch (err) {
        this.logger.error(`Like notification failed: ${JSON.stringify(err)}`);
      }
    }

    return result;
  }

  async toggleBookmark(
    userId: string,
    articleId: string,
  ): Promise<ToggleBookmarkResponse> {
    const articleRows = await this.db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    if (articleRows.length === 0) {
      throw new NotFoundException('Article not found');
    }

    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.articleId, articleId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await tx.delete(bookmarks).where(eq(bookmarks.id, existing[0].id));
        const updated = await tx
          .update(articles)
          .set({ bookmarkCount: sql`GREATEST(0, ${articles.bookmarkCount} - 1)` })
          .where(eq(articles.id, articleId))
          .returning({ count: articles.bookmarkCount });
        return { bookmarked: false, bookmarkCount: Number(updated[0].count) };
      } else {
        await tx.insert(bookmarks).values({
          userId,
          articleId,
        });
        const updated = await tx
          .update(articles)
          .set({ bookmarkCount: sql`${articles.bookmarkCount} + 1` })
          .where(eq(articles.id, articleId))
          .returning({ count: articles.bookmarkCount });
        return { bookmarked: true, bookmarkCount: Number(updated[0].count) };
      }
    });
  }

  async toggleRepost(
    userId: string,
    contentType: CommentContentType,
    contentId: string,
    quoteContent?: string,
  ): Promise<ToggleRepostResponse> {
    const contentTable = this.getContentTable(contentType);
    const contentAuthorCol =
      contentType === 'post' ? posts.appUserId : articles.appUserId;

    const contentRows = await this.db
      .select({ id: contentTable.id, authorId: contentAuthorCol })
      .from(contentTable)
      .where(eq(contentTable.id, contentId))
      .limit(1);
    if (contentRows.length === 0) {
      throw new NotFoundException(`${contentType} not found`);
    }
    const authorId = contentRows[0].authorId;

    const isQuote = !!quoteContent && quoteContent.length > 0;
    if (isQuote) {
      const validation = contentGuard.validateContent(quoteContent!);
      if (!validation.valid) {
        throw new BadRequestException(
          `转发引用内容包含违规或垃圾信息关键词：${validation.matchedWords.join(', ')}`,
        );
      }
    }

    const result = await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: reposts.id })
        .from(reposts)
        .where(
          and(
            eq(reposts.userId, userId),
            eq(reposts.contentType, contentType),
            eq(reposts.contentId, contentId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await tx.delete(reposts).where(eq(reposts.id, existing[0].id));
        const updated = await tx
          .update(contentTable)
          .set({ repostCount: sql`GREATEST(0, ${contentTable.repostCount} - 1)` })
          .where(eq(contentTable.id, contentId))
          .returning({ count: contentTable.repostCount });
        return { reposted: false, repostCount: Number(updated[0].count) };
      } else {
        try {
          await tx.insert(reposts).values({
            userId,
            contentType,
            contentId,
            quoteContent: isQuote ? quoteContent : null,
            isQuote,
          });
        } catch (err) {
          const code = extractPostgresErrorCode(err);
          if (code === '23505') {
            // Unique violation - already reposted, toggle off
            const existingRows = await tx
              .select({ id: reposts.id })
              .from(reposts)
              .where(
                and(
                  eq(reposts.userId, userId),
                  eq(reposts.contentType, contentType),
                  eq(reposts.contentId, contentId),
                ),
              )
              .limit(1);
            if (existingRows.length > 0) {
              await tx
                .delete(reposts)
                .where(eq(reposts.id, existingRows[0].id));
              const updated = await tx
                .update(contentTable)
                .set({ repostCount: sql`GREATEST(0, ${contentTable.repostCount} - 1)` })
                .where(eq(contentTable.id, contentId))
                .returning({ count: contentTable.repostCount });
              return { reposted: false, repostCount: Number(updated[0].count) };
            }
          }
          throw err;
        }
        const updated = await tx
          .update(contentTable)
          .set({ repostCount: sql`${contentTable.repostCount} + 1` })
          .where(eq(contentTable.id, contentId))
          .returning({ count: contentTable.repostCount });
        return { reposted: true, repostCount: Number(updated[0].count) };
      }
    });

    // Notify content author on repost
    if (result.reposted && authorId && authorId !== userId) {
      try {
        await this.notificationsService.createNotification(
          authorId,
          'repost',
          userId,
          contentType,
          contentId,
        );
      } catch (err) {
        this.logger.error(`Repost notification failed: ${JSON.stringify(err)}`);
      }
    }

    return result;
  }

  async getUserInteractionState(
    userId: string,
    contentType: CommentContentType,
    contentIds: string[],
  ): Promise<Map<string, { liked: boolean; reposted: boolean }>> {
    const result = new Map<string, { liked: boolean; reposted: boolean }>();
    for (const id of contentIds) {
      result.set(id, { liked: false, reposted: false });
    }

    if (contentIds.length === 0) {
      return result;
    }

    const [likedRows, repostedRows] = await Promise.all([
      this.db
        .select({ contentId: likes.contentId })
        .from(likes)
        .where(
          and(
            eq(likes.userId, userId),
            eq(likes.contentType, contentType),
            inArray(likes.contentId, contentIds),
          ),
        ),
      this.db
        .select({ contentId: reposts.contentId })
        .from(reposts)
        .where(
          and(
            eq(reposts.userId, userId),
            eq(reposts.contentType, contentType),
            inArray(reposts.contentId, contentIds),
          ),
        ),
    ]);

    for (const row of likedRows) {
      const entry = result.get(row.contentId);
      if (entry) entry.liked = true;
    }
    for (const row of repostedRows) {
      const entry = result.get(row.contentId);
      if (entry) entry.reposted = true;
    }

    return result;
  }

  async getUserBookmarkState(
    userId: string,
    articleIds: string[],
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    for (const id of articleIds) {
      result.set(id, false);
    }

    if (articleIds.length === 0) {
      return result;
    }

    const bookmarkedRows = await this.db
      .select({ articleId: bookmarks.articleId })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          inArray(bookmarks.articleId, articleIds),
        ),
      );

    for (const row of bookmarkedRows) {
      result.set(row.articleId, true);
    }

    return result;
  }

  private getContentTable(contentType: CommentContentType) {
    if (contentType === 'post') return posts;
    if (contentType === 'article') return articles;
    throw new BadRequestException(`Invalid content type: ${contentType}`);
  }

  private getCountColumn(
    table: typeof posts | typeof articles,
    type: CountType,
  ) {
    switch (type) {
      case 'like':
        return table.likeCount;
      case 'repost':
        return table.repostCount;
      case 'comment':
        return table.commentCount;
      case 'bookmark':
        if ('bookmarkCount' in table) {
          return table.bookmarkCount;
        }
        throw new BadRequestException(
          'Bookmark count is only available for articles',
        );
      default:
        throw new BadRequestException(`Invalid count type: ${type}`);
    }
  }
}
