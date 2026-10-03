import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { comments, posts, articles, appUsers, commentLikes } from '@server/database/schema';
import { eq, and, asc, desc, sql, count, isNull } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HashtagsService } from '../hashtags/hashtags.service';
import type {
  CommentItem,
  CommentListResponse,
  ToggleCommentLikeResponse,
  CommentSortMode,
  CommentContentType,
} from '@shared/api.interface';
import type { CreateCommentDto } from './dto/create-comment.dto';

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
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
    private readonly hashtagsService: HashtagsService,
  ) {}

  async create(userId: string, dto: CreateCommentDto): Promise<CommentItem> {
    await this.validateContentExists(dto.contentType, dto.contentId);

    if (dto.parentId) {
      const parentRows = await this.db
        .select({ id: comments.id, userId: comments.userId })
        .from(comments)
        .where(and(eq(comments.id, dto.parentId), eq(comments.isDeleted, false)))
        .limit(1);
      if (parentRows.length === 0) {
        throw new BadRequestException('Parent comment not found');
      }
    }

    const contentTable = dto.contentType === 'post' ? posts : articles;
    const contentAuthorCol =
      dto.contentType === 'post' ? posts.appUserId : articles.appUserId;

    const result = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(comments)
        .values({
          userId,
          contentType: dto.contentType,
          contentId: dto.contentId,
          parentId: dto.parentId ?? null,
          body: dto.body,
        })
        .returning({
          id: comments.id,
          userId: comments.userId,
          contentType: comments.contentType,
          contentId: comments.contentId,
          parentId: comments.parentId,
          body: comments.body,
          isDeleted: comments.isDeleted,
          createdAt: comments.createdAt,
          likeCount: comments.likeCount,
        });

      if (!inserted) {
        throw new BadRequestException('Failed to create comment');
      }

      await tx
        .update(contentTable)
        .set({ commentCount: sql`${contentTable.commentCount} + 1` })
        .where(eq(contentTable.id, dto.contentId));

      // Get content author for notification
      const contentRows = await tx
        .select({ authorId: contentAuthorCol })
        .from(contentTable)
        .where(eq(contentTable.id, dto.contentId))
        .limit(1);
      const authorId = contentRows[0]?.authorId ?? null;

      return { inserted, authorId };
    });

    const { inserted, authorId } = result;

    // Hashtag sync (fire-and-forget style, outside transaction)
    try {
      await this.hashtagsService.syncContentHashtags(
        dto.contentType,
        dto.contentId,
        dto.body,
      );
    } catch (err) {
      this.logger.error(`Hashtag sync failed for comment ${inserted.id}: ${JSON.stringify(err)}`);
    }

    // Notify content author (skip if commenter is the author)
    if (authorId && authorId !== userId) {
      try {
        await this.notificationsService.createNotification(
          authorId,
          'comment',
          userId,
          dto.contentType,
          dto.contentId,
          inserted.id,
        );
      } catch (err) {
        this.logger.error(`Comment notification failed: ${JSON.stringify(err)}`);
      }
    }

    // Parse mentions and notify mentioned users
    const mentionedUsernames = this.extractMentions(dto.body);
    if (mentionedUsernames.length > 0) {
      try {
        await this.notifyMentionedUsers(
          mentionedUsernames,
          userId,
          dto.contentType,
          dto.contentId,
          inserted.id,
          dto.body,
        );
      } catch (err) {
        this.logger.error(`Mention notification failed: ${JSON.stringify(err)}`);
      }
    }

    const userRows = await this.db
      .select({
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
      })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    return {
      id: inserted.id,
      userId: inserted.userId,
      userName: userRows[0]?.nickname ?? userId.slice(0, 8),
      userAvatarUrl: userRows[0]?.avatarUrl ?? null,
      contentTypeId: inserted.contentType,
      contentId: inserted.contentId,
      parentId: inserted.parentId,
      body: inserted.body,
      isDeleted: inserted.isDeleted,
      createdAt: inserted.createdAt.toISOString(),
      likeCount: Number(inserted.likeCount),
      isLiked: false,
    };
  }

  async listByContent(
    contentType: string,
    contentId: string,
    sort: CommentSortMode = 'time',
    cursor?: string,
    limit: number = 20,
    currentUserId?: string,
  ): Promise<CommentListResponse> {
    const pageSize = Math.min(limit, 50);
    const fetchLimit = pageSize + 1;

    const baseWhere = and(
      eq(comments.contentType, contentType),
      eq(comments.contentId, contentId),
      eq(comments.isDeleted, false),
      isNull(comments.parentId),
    );

    const whereConditions = [baseWhere];

    if (cursor) {
      const { createdAt: cursorCreatedAt, id: cursorId, likeCount: cursorLikeCount } =
        this.parseCommentCursor(cursor);
      const cursorIso = cursorCreatedAt.toISOString();

      if (sort === 'hot') {
        whereConditions.push(
          sql`(
            (${comments.likeCount} < ${cursorLikeCount}) OR
            (${comments.likeCount} = ${cursorLikeCount} AND ${comments.createdAt} < ${cursorIso}::timestamptz) OR
            (${comments.likeCount} = ${cursorLikeCount} AND ${comments.createdAt} = ${cursorIso}::timestamptz AND ${comments.id} < ${cursorId})
          )`,
        );
      } else {
        whereConditions.push(
          sql`(
            (${comments.createdAt} < ${cursorIso}::timestamptz) OR
            (${comments.createdAt} = ${cursorIso}::timestamptz AND ${comments.id} < ${cursorId})
          )`,
        );
      }
    }

    const orderBy =
      sort === 'hot'
        ? [desc(comments.likeCount), desc(comments.createdAt), desc(comments.id)]
        : [desc(comments.createdAt), desc(comments.id)];

    // Subquery for reply counts
    const replyCountExpr = sql<number>`(
      SELECT COUNT(*) FROM ${comments} AS replies
      WHERE replies.parent_id = ${comments.id} AND replies.is_deleted = false
    )`;

    const rows = await this.db
      .select({
        id: comments.id,
        userId: comments.userId,
        contentType: comments.contentType,
        contentId: comments.contentId,
        parentId: comments.parentId,
        body: comments.body,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        likeCount: comments.likeCount,
        replyCount: replyCountExpr,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
      })
      .from(comments)
      .leftJoin(appUsers, eq(comments.userId, appUsers.id))
      .where(and(...whereConditions))
      .orderBy(...orderBy)
      .limit(fetchLimit);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    // Get liked state for current user
    let likedSet = new Set<string>();
    if (currentUserId && pageRows.length > 0) {
      const likedRows = await this.db
        .select({ commentId: commentLikes.commentId })
        .from(commentLikes)
        .where(
          and(
            eq(commentLikes.userId, currentUserId),
            sql`${commentLikes.commentId} = ANY(ARRAY[${sql.join(
              pageRows.map((r) => sql`${r.id}`),
              sql`, `,
            )}]::uuid[])`,
          ),
        );
      for (const row of likedRows) {
        likedSet.add(row.commentId);
      }
    }

    const items: CommentItem[] = pageRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.nickname ?? row.userId.slice(0, 8),
      userAvatarUrl: row.avatarUrl ?? null,
      contentTypeId: row.contentType,
      contentId: row.contentId,
      parentId: row.parentId,
      body: row.body,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      likeCount: Number(row.likeCount),
      replyCount: Number(row.replyCount),
      ...(currentUserId ? { isLiked: likedSet.has(row.id) } : {}),
    }));

    // Total count of top-level comments
    const [{ totalCount }] = await this.db
      .select({ totalCount: count() })
      .from(comments)
      .where(baseWhere);

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      nextCursor = this.makeCommentCursor(
        lastRow.createdAt,
        lastRow.id,
        Number(lastRow.likeCount),
      );
    }

    return {
      items,
      total: Number(totalCount),
      nextCursor,
      hasMore,
    };
  }

  async listReplies(
    commentId: string,
    cursor?: string,
    limit: number = 10,
    currentUserId?: string,
  ): Promise<CommentListResponse> {
    const pageSize = Math.min(limit, 20);
    const fetchLimit = pageSize + 1;

    // Verify parent comment exists
    const parentRows = await this.db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.isDeleted, false)))
      .limit(1);
    if (parentRows.length === 0) {
      throw new NotFoundException('Comment not found');
    }

    const baseWhere = and(
      eq(comments.parentId, commentId),
      eq(comments.isDeleted, false),
    );

    const whereConditions = [baseWhere];

    if (cursor) {
      const { createdAt: cursorCreatedAt, id: cursorId } = this.parseReplyCursor(cursor);
      const cursorIso = cursorCreatedAt.toISOString();
      whereConditions.push(
        sql`(
          (${comments.createdAt} > ${cursorIso}::timestamptz) OR
          (${comments.createdAt} = ${cursorIso}::timestamptz AND ${comments.id} > ${cursorId})
        )`,
      );
    }

    const rows = await this.db
      .select({
        id: comments.id,
        userId: comments.userId,
        contentType: comments.contentType,
        contentId: comments.contentId,
        parentId: comments.parentId,
        body: comments.body,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        likeCount: comments.likeCount,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
      })
      .from(comments)
      .leftJoin(appUsers, eq(comments.userId, appUsers.id))
      .where(and(...whereConditions))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .limit(fetchLimit);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    // Get liked state for current user
    let likedSet = new Set<string>();
    if (currentUserId && pageRows.length > 0) {
      const likedRows = await this.db
        .select({ commentId: commentLikes.commentId })
        .from(commentLikes)
        .where(
          and(
            eq(commentLikes.userId, currentUserId),
            sql`${commentLikes.commentId} = ANY(ARRAY[${sql.join(
              pageRows.map((r) => sql`${r.id}`),
              sql`, `,
            )}]::uuid[])`,
          ),
        );
      for (const row of likedRows) {
        likedSet.add(row.commentId);
      }
    }

    const items: CommentItem[] = pageRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.nickname ?? row.userId.slice(0, 8),
      userAvatarUrl: row.avatarUrl ?? null,
      contentTypeId: row.contentType,
      contentId: row.contentId,
      parentId: row.parentId,
      body: row.body,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      likeCount: Number(row.likeCount),
      ...(currentUserId ? { isLiked: likedSet.has(row.id) } : {}),
    }));

    const [{ totalCount }] = await this.db
      .select({ totalCount: count() })
      .from(comments)
      .where(baseWhere);

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      nextCursor = this.makeReplyCursor(lastRow.createdAt, lastRow.id);
    }

    return {
      items,
      total: Number(totalCount),
      nextCursor,
      hasMore,
    };
  }

  async toggleCommentLike(
    userId: string,
    commentId: string,
  ): Promise<ToggleCommentLikeResponse> {
    // Verify comment exists
    const commentRows = await this.db
      .select({ id: comments.id, userId: comments.userId })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.isDeleted, false)))
      .limit(1);
    if (commentRows.length === 0) {
      throw new NotFoundException('Comment not found');
    }
    const commentAuthorId = commentRows[0].userId;

    const result = await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: commentLikes.id })
        .from(commentLikes)
        .where(
          and(
            eq(commentLikes.userId, userId),
            eq(commentLikes.commentId, commentId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await tx.delete(commentLikes).where(eq(commentLikes.id, existing[0].id));
        const updated = await tx
          .update(comments)
          .set({ likeCount: sql`${comments.likeCount} - 1` })
          .where(eq(comments.id, commentId))
          .returning({ count: comments.likeCount });
        return { liked: false, likeCount: Number(updated[0].count) };
      } else {
        try {
          await tx.insert(commentLikes).values({
            userId,
            commentId,
          });
        } catch (err) {
          const code = extractPostgresErrorCode(err);
          if (code === '23505') {
            // Unique violation - already liked, treat as toggle off
            const existingRows = await tx
              .select({ id: commentLikes.id })
              .from(commentLikes)
              .where(
                and(
                  eq(commentLikes.userId, userId),
                  eq(commentLikes.commentId, commentId),
                ),
              )
              .limit(1);
            if (existingRows.length > 0) {
              await tx
                .delete(commentLikes)
                .where(eq(commentLikes.id, existingRows[0].id));
              const updated = await tx
                .update(comments)
                .set({ likeCount: sql`${comments.likeCount} - 1` })
                .where(eq(comments.id, commentId))
                .returning({ count: comments.likeCount });
              return { liked: false, likeCount: Number(updated[0].count) };
            }
          }
          throw err;
        }
        const updated = await tx
          .update(comments)
          .set({ likeCount: sql`${comments.likeCount} + 1` })
          .where(eq(comments.id, commentId))
          .returning({ count: comments.likeCount });
        return { liked: true, likeCount: Number(updated[0].count) };
      }
    });

    // Notify comment author on like (skip if liker is the author)
    if (result.liked && commentAuthorId && commentAuthorId !== userId) {
      try {
        await this.notificationsService.createNotification(
          commentAuthorId,
          'like',
          userId,
          undefined,
          undefined,
          commentId,
        );
      } catch (err) {
        this.logger.error(
          `Comment like notification failed: ${JSON.stringify(err)}`,
        );
      }
    }
    return result;
  }

  async delete(commentId: string, userId: string): Promise<void> {
    const commentRows = await this.db
      .select({
        id: comments.id,
        userId: comments.userId,
        contentType: comments.contentType,
        contentId: comments.contentId,
        isDeleted: comments.isDeleted,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (commentRows.length === 0) {
      throw new NotFoundException('Comment not found');
    }

    const comment = commentRows[0];
    if (comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin && comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const contentTable = comment.contentType === 'post' ? posts : articles;

    await this.db.transaction(async (tx) => {
      await tx
        .update(comments)
        .set({
          isDeleted: true,
          body: '[已删除]',
        })
        .where(eq(comments.id, commentId));

      await tx
        .update(contentTable)
        .set({ commentCount: sql`${contentTable.commentCount} - 1` })
        .where(eq(contentTable.id, comment.contentId));
    });
  }

  private async validateContentExists(
    contentType: string,
    contentId: string,
  ): Promise<void> {
    if (contentType === 'post') {
      const rows = await this.db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, contentId))
        .limit(1);
      if (rows.length === 0) {
        throw new BadRequestException('Post not found');
      }
    } else if (contentType === 'article') {
      const rows = await this.db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.id, contentId))
        .limit(1);
      if (rows.length === 0) {
        throw new BadRequestException('Article not found');
      }
    } else {
      throw new BadRequestException('Invalid content type');
    }
  }

  private extractMentions(content: string): string[] {
    if (!content) return [];
    const regex = /@([\w\u4e00-\u9fa5]+)/g;
    const matches = content.match(regex) ?? [];
    const unique = new Set<string>();
    for (const m of matches) {
      unique.add(m.slice(1));
    }
    return Array.from(unique);
  }

  private async notifyMentionedUsers(
    usernames: string[],
    actorId: string,
    contentType: CommentContentType,
    contentId: string,
    commentId: string,
    body: string,
  ): Promise<void> {
    if (usernames.length === 0) return;

    const userRows = await this.db
      .select({ id: appUsers.id, nickname: appUsers.nickname })
      .from(appUsers)
      .where(sql`${appUsers.nickname} = ANY(ARRAY[${sql.join(
        usernames.map((name) => sql`${name}`),
        sql`, `,
      )}]::varchar[])`)
      .limit(20);

    for (const row of userRows) {
      if (row.id === actorId) continue; // Don't notify self
      const mentionedIndex = body.indexOf(`@${row.nickname}`);
      await this.notificationsService.createNotification(
        row.id,
        'mention',
        actorId,
        contentType,
        contentId,
        commentId,
        {
          text: body,
          mentionedIndex: mentionedIndex >= 0 ? mentionedIndex : undefined,
        },
      );
    }
  }

  private parseCommentCursor(cursor: string): {
    createdAt: Date;
    id: string;
    likeCount: number;
  } {
    const parts = cursor.split(':');
    if (parts.length < 3) {
      throw new BadRequestException('Invalid cursor format');
    }
    const likeCount = parseInt(parts[0], 10);
    const id = parts[parts.length - 1];
    const createdAtStr = parts.slice(1, -1).join(':');
    const createdAt = new Date(createdAtStr);
    if (isNaN(createdAt.getTime()) || isNaN(likeCount)) {
      throw new BadRequestException('Invalid cursor format');
    }
    return { createdAt, id, likeCount };
  }

  private makeCommentCursor(
    createdAt: Date,
    id: string,
    likeCount: number,
  ): string {
    return `${likeCount}:${createdAt.toISOString()}:${id}`;
  }

  private parseReplyCursor(cursor: string): { createdAt: Date; id: string } {
    const parts = cursor.split(':');
    if (parts.length < 2) {
      throw new BadRequestException('Invalid cursor format');
    }
    const id = parts[parts.length - 1];
    const createdAtStr = parts.slice(0, -1).join(':');
    const createdAt = new Date(createdAtStr);
    if (isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor format');
    }
    return { createdAt, id };
  }

  private makeReplyCursor(createdAt: Date, id: string): string {
    return `${createdAt.toISOString()}:${id}`;
  }
}
