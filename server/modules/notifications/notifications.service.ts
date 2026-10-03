import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { notifications, appUsers, posts, articles } from '@server/database/schema';
import { eq, and, desc, count, inArray, sql, sum } from 'drizzle-orm';
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationType,
  CommentContentType,
  UserPublicProfile,
  MarkNotificationsReadRequest,
} from '@shared/api.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<NotificationListResponse> {
    const pageSize = Math.min(limit, 50);
    const fetchLimit = pageSize + 1;

    const whereConditions = [eq(notifications.userId, userId)];

    if (cursor) {
      const { createdAt: cursorCreatedAt, id: cursorId } = this.parseCursor(cursor);
      const cursorIso = cursorCreatedAt.toISOString();
      whereConditions.push(
        sql`((${notifications.createdAt} < ${cursorIso}::timestamptz) OR (${notifications.createdAt} = ${cursorIso}::timestamptz AND ${notifications.id} < ${cursorId}))`,
      );
    }

    const rows = await this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        actorId: notifications.actorId,
        contentType: notifications.contentType,
        contentId: notifications.contentId,
        commentId: notifications.commentId,
        isRead: notifications.isRead,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
        actorNickname: appUsers.nickname,
        actorAvatarUrl: appUsers.avatarUrl,
        actorBio: appUsers.bio,
        actorRole: appUsers.role,
        actorIsBanned: appUsers.isBanned,
        actorCreatedAt: appUsers.createdAt,
        actorFollowerCount: appUsers.followerCount,
        actorFollowingCount: appUsers.followingCount,
      })
      .from(notifications)
      .leftJoin(appUsers, eq(notifications.actorId, appUsers.id))
      .where(and(...whereConditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(fetchLimit);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    const actorIds: string[] = [];
    for (const row of pageRows) {
      if (row.actorId && !actorIds.includes(row.actorId)) {
        actorIds.push(row.actorId);
      }
    }

    const actorProfileMap = await this.buildActorProfileMap(actorIds, pageRows);

    const items: NotificationItem[] = pageRows.map((row) => {
      const actor = row.actorId ? actorProfileMap.get(row.actorId) ?? null : null;
      return {
        id: row.id,
        type: row.type as NotificationType,
        actor,
        contentType: (row.contentType as CommentContentType | null) ?? null,
        contentId: row.contentId ?? null,
        commentId: row.commentId ?? null,
        isRead: row.isRead,
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    const unreadCount = await this.getUnreadCount(userId);

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      nextCursor = this.makeCursor(lastRow.createdAt, lastRow.id);
    }

    return {
      items,
      unreadCount,
      nextCursor,
      hasMore,
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(total);
  }

  async markRead(
    userId: string,
    dto: MarkNotificationsReadRequest,
  ): Promise<{ success: true }> {
    if (!dto.all && (!dto.ids || dto.ids.length === 0)) {
      throw new BadRequestException('Either ids or all must be provided');
    }

    if (dto.all) {
      await this.db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    } else if (dto.ids && dto.ids.length > 0) {
      await this.db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userId, userId),
            inArray(notifications.id, dto.ids),
          ),
        );
    }

    return { success: true };
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    actorId?: string,
    contentType?: CommentContentType | 'post' | 'article' | 'comment' | null,
    contentId?: string,
    commentId?: string,
    metadata?: Record<string, unknown> | null,
  ): Promise<string | null> {
    if (actorId && actorId === userId) {
      return null;
    }

    const [inserted] = await this.db
      .insert(notifications)
      .values({
        userId,
        type,
        actorId: actorId ?? null,
        contentType: contentType ?? null,
        contentId: contentId ?? null,
        commentId: commentId ?? null,
        isRead: false,
        metadata: metadata ?? null,
      })
      .returning({ id: notifications.id });

    return inserted ? inserted.id : null;
  }

  private async buildActorProfileMap(
    actorIds: string[],
    rows: Array<{
      actorId: string | null;
      actorNickname: string | null;
      actorAvatarUrl: string | null;
      actorBio: string | null;
       actorRole: string | null;
       actorIsBanned: boolean | null;
       actorCreatedAt: Date | null;
      actorFollowerCount: number | null;
      actorFollowingCount: number | null;
    }>,
  ): Promise<Map<string, UserPublicProfile>> {
    const result = new Map<string, UserPublicProfile>();

    if (actorIds.length === 0) {
      return result;
    }

    const byId = new Map<string, (typeof rows)[0]>();
    for (const row of rows) {
      if (row.actorId && !byId.has(row.actorId)) {
        byId.set(row.actorId, row);
      }
    }

    const [postCounts, articleCounts] = await Promise.all([
      this.db
        .select({
          userId: posts.appUserId,
          count: count(),
        })
        .from(posts)
        .where(inArray(posts.appUserId, actorIds))
        .groupBy(posts.appUserId),
      this.db
        .select({
          userId: articles.appUserId,
          count: count(),
        })
        .from(articles)
        .where(inArray(articles.appUserId, actorIds))
        .groupBy(articles.appUserId),
    ]);

    const [postLikes, articleLikes] = await Promise.all([
      this.db
        .select({
          userId: posts.appUserId,
          total: sum(posts.likeCount),
        })
        .from(posts)
        .where(inArray(posts.appUserId, actorIds))
        .groupBy(posts.appUserId),
      this.db
        .select({
          userId: articles.appUserId,
          total: sum(articles.likeCount),
        })
        .from(articles)
        .where(inArray(articles.appUserId, actorIds))
        .groupBy(articles.appUserId),
    ]);

    const postCountMap = new Map<string, number>();
    for (const row of postCounts) {
      if (row.userId) postCountMap.set(row.userId, Number(row.count));
    }

    const articleCountMap = new Map<string, number>();
    for (const row of articleCounts) {
      if (row.userId) articleCountMap.set(row.userId, Number(row.count));
    }

    const postLikesMap = new Map<string, number>();
    for (const row of postLikes) {
      if (row.userId) postLikesMap.set(row.userId, Number(row.total) || 0);
    }

    const articleLikesMap = new Map<string, number>();
    for (const row of articleLikes) {
      if (row.userId) articleLikesMap.set(row.userId, Number(row.total) || 0);
    }

    for (const id of actorIds) {
      const row = byId.get(id);
      if (!row || row.actorId == null || row.actorNickname == null) continue;

      const postCount = postCountMap.get(id) ?? 0;
      const articleCount = articleCountMap.get(id) ?? 0;
      const likeCount = (postLikesMap.get(id) ?? 0) + (articleLikesMap.get(id) ?? 0);

      result.set(id, {
        id: row.actorId,
        nickname: row.actorNickname,
        avatarUrl: row.actorAvatarUrl ?? null,
        bio: row.actorBio ?? null,
         role: (row.actorRole as 'admin' | 'user') ?? 'user',
         isBanned: row.actorIsBanned ?? false,
         createdAt: row.actorCreatedAt ? row.actorCreatedAt.toISOString() : '',
        postCount,
        articleCount,
        likeCount,
        followerCount: row.actorFollowerCount ?? 0,
        followingCount: row.actorFollowingCount ?? 0,
      });
    }

    return result;
  }

  private parseCursor(cursor: string): { createdAt: Date; id: string } {
    const parts = cursor.split(':');
    if (parts.length < 2) {
      throw new BadRequestException('Invalid cursor format');
    }
    const id = parts[parts.length - 1];
    const createdAtStr = parts.slice(0, -1).join(':');
    const createdAt = new Date(createdAtStr);
    if (isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor date');
    }
    return { createdAt, id };
  }

  private makeCursor(createdAt: Date, id: string): string {
    return `${createdAt.toISOString()}:${id}`;
  }
}
