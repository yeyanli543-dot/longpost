import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  count,
  eq,
  and,
  gte,
  lt,
  desc,
  ilike,
  sql,
  inArray,
  or,
} from 'drizzle-orm';
import {
  type PostgresJsDatabase,
  DRIZZLE_DATABASE,
} from '@server/database/database.module';
import { Inject } from '@nestjs/common';

import type {
  AdminDashboardStats,
  AdminPostListResponse,
  AdminArticleListResponse,
  AdminCommentListResponse,
  AdminUserListResponse,
  AdminUserItem,
  ReportListResponse,
  ReportItem,
  ReportStatus,
  ReportReason,
  ModerationStatus,
  AdminModerationPostListResponse,
  AdminModerationArticleListResponse,
  PostItem,
  ArticleSummary,
} from '@shared/api.interface';
import { appUsers, posts, articles, comments, likes, bookmarks, reposts, reports, siteSettings } from '@server/database/schema';
import { AuthService } from '../auth/auth.service';
import { ArticlesService } from '../articles/articles.service';
import { CommentsService } from '../comments/comments.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authService: AuthService,
    private readonly articleService: ArticlesService,
    private readonly commentService: CommentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async ensureAdmin(userId: string): Promise<void> {
    await this.authService.ensureAdmin(userId);
  }

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [
      [{ totalUsers }],
      [{ totalPosts }],
      [{ totalArticles }],
      [{ totalComments }],
      [{ totalLikes }],
      [{ totalBookmarks }],
      [{ totalReposts }],
      [{ todayNewUsers }],
      [{ todayNewPosts }],
      [{ todayNewArticles }],
      [{ todayNewComments }],
      [{ pendingReports }],
      [{ bannedUsers }],
      [{ pendingPosts }],
      [{ pendingArticles }],
    ] = await Promise.all([
      this.db.select({ totalUsers: count() }).from(appUsers),
      this.db.select({ totalPosts: count() }).from(posts),
      this.db.select({ totalArticles: count() }).from(articles),
      this.db.select({ totalComments: count() }).from(comments),
      this.db.select({ totalLikes: count() }).from(likes),
      this.db.select({ totalBookmarks: count() }).from(bookmarks),
      this.db.select({ totalReposts: count() }).from(reposts),
      this.db
        .select({ todayNewUsers: count() })
        .from(appUsers)
        .where(and(gte(appUsers.createdAt, todayStart), lt(appUsers.createdAt, tomorrowStart))),
      this.db
        .select({ todayNewPosts: count() })
        .from(posts)
        .where(and(gte(posts.createdAt, todayStart), lt(posts.createdAt, tomorrowStart))),
      this.db
        .select({ todayNewArticles: count() })
        .from(articles)
        .where(and(gte(articles.createdAt, todayStart), lt(articles.createdAt, tomorrowStart))),
      this.db
        .select({ todayNewComments: count() })
        .from(comments)
        .where(and(gte(comments.createdAt, todayStart), lt(comments.createdAt, tomorrowStart))),
      this.db
        .select({ pendingReports: count() })
        .from(reports)
        .where(eq(reports.status, 'pending')),
       this.db
         .select({ bannedUsers: count() })
         .from(appUsers)
         .where(eq(appUsers.isBanned, true)),
       this.db
         .select({ pendingPosts: count() })
         .from(posts)
         .where(eq(posts.moderationStatus, 'pending_moderation')),
       this.db
         .select({ pendingArticles: count() })
         .from(articles)
         .where(eq(articles.moderationStatus, 'pending_moderation')),
     ]);

    return {
      totalUsers: Number(totalUsers),
      totalPosts: Number(totalPosts),
      totalArticles: Number(totalArticles),
      totalComments: Number(totalComments),
      totalLikes: Number(totalLikes),
      totalBookmarks: Number(totalBookmarks),
      totalReposts: Number(totalReposts),
      todayNewUsers: Number(todayNewUsers),
      todayNewPosts: Number(todayNewPosts),
      todayNewArticles: Number(todayNewArticles),
      todayNewComments: Number(todayNewComments),
       pendingReports: Number(pendingReports),
       pendingReviewCount: Number(pendingPosts) + Number(pendingArticles),
       bannedUsers: Number(bannedUsers),
     };
  }

  async getPostList(
    page: number,
    pageSize: number,
    keyword?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<AdminPostListResponse> {
    const offset = (page - 1) * pageSize;
    const where = keyword
      ? sql`${posts.content} ILIKE ${`%${keyword}%`}`
      : undefined;

    const orderCol = sortBy === 'likeCount'
      ? posts.likeCount
      : sortBy === 'commentCount'
      ? posts.commentCount
      : posts.createdAt;

    const [totalRows, itemsRaw] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(posts)
        .where(where as any),
      this.db
         .select({
           id: posts.id,
           content: posts.content,
           articleId: posts.articleId,
           author: posts.author,
           appUserId: posts.appUserId,
           likeCount: posts.likeCount,
           commentCount: posts.commentCount,
           repostCount: posts.repostCount,
           isPinned: posts.isPinned,
           isFeatured: posts.isFeatured,
           moderationStatus: posts.moderationStatus,
           createdAt: posts.createdAt,
           authorName: appUsers.nickname,
           authorAvatarUrl: appUsers.avatarUrl,
           authorRole: appUsers.role,
         })
         .from(posts)
         .leftJoin(appUsers, eq(posts.appUserId, appUsers.id))
         .where(where as any)
         .orderBy(sortOrder === 'desc' ? desc(orderCol) : orderCol)
        .limit(pageSize)
        .offset(offset),
    ]);

    const items = itemsRaw.map((row: any) => ({
      id: row.id,
      content: row.content,
      articleId: row.articleId,
      authorId: row.appUserId || '',
      authorName: row.authorName || '未知用户',
      authorAvatarUrl: row.authorAvatarUrl,
      authorRole: row.authorRole || 'user',
      createdAt: row.createdAt.toISOString(),
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      repostCount: row.repostCount,
      isPinned: row.isPinned,
      isFeatured: row.isFeatured,
      moderationStatus: row.moderationStatus,
    }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async getArticleList(
    page: number,
    pageSize: number,
    keyword?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<AdminArticleListResponse> {
    const offset = (page - 1) * pageSize;
    const where = keyword
      ? or(
          ilike(articles.title, `%${keyword}%`),
          ilike(articles.excerpt, `%${keyword}%`),
        )
      : undefined;

    const orderCol = sortBy === 'likeCount'
      ? articles.likeCount
      : sortBy === 'readCount'
      ? articles.readCount
      : sortBy === 'commentCount'
      ? articles.commentCount
      : articles.createdAt;

    const [totalRows, itemsRaw] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(articles)
        .where(where as any),
      this.db
         .select({
           id: articles.id,
           title: articles.title,
           excerpt: articles.excerpt,
           coverUrl: articles.coverUrl,
           readCount: articles.readCount,
           author: articles.author,
           appUserId: articles.appUserId,
           likeCount: articles.likeCount,
           commentCount: articles.commentCount,
           repostCount: articles.repostCount,
           bookmarkCount: articles.bookmarkCount,
           isPinned: articles.isPinned,
           isFeatured: articles.isFeatured,
            moderationStatus: articles.moderationStatus,
            slug: articles.slug,
            status: articles.status,
            createdAt: articles.createdAt,
            authorName: appUsers.nickname,
            authorAvatarUrl: appUsers.avatarUrl,
            authorRole: appUsers.role,
          })
          .from(articles)
          .leftJoin(appUsers, eq(articles.appUserId, appUsers.id))
          .where(where as any)
          .orderBy(sortOrder === 'desc' ? desc(orderCol) : orderCol)
         .limit(pageSize)
         .offset(offset),
     ]);

     const items = itemsRaw.map((row: any) => ({
       id: row.id,
       slug: row.slug,
       status: row.status as 'published' | 'draft',
       title: row.title,
       excerpt: row.excerpt,
       coverUrl: row.coverUrl,
       readCount: row.readCount,
       authorId: row.appUserId || '',
       authorName: row.authorName || '未知用户',
       authorAvatarUrl: row.authorAvatarUrl,
       authorRole: row.authorRole || 'user',
       createdAt: row.createdAt.toISOString(),
       imageCount: 0,
       attachmentCount: 0,
       likeCount: row.likeCount,
       commentCount: row.commentCount,
       repostCount: row.repostCount,
       bookmarkCount: row.bookmarkCount,
       isPinned: row.isPinned,
       isFeatured: row.isFeatured,
       moderationStatus: row.moderationStatus,
     }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async getCommentList(
    page: number,
    pageSize: number,
    keyword?: string,
  ): Promise<AdminCommentListResponse> {
    const offset = (page - 1) * pageSize;
    const where = keyword
      ? ilike(comments.body, `%${keyword}%`)
      : undefined;

    const [totalRows, itemsRaw] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(comments)
        .where(where as any),
      this.db
        .select({
          id: comments.id,
          userId: comments.userId,
          contentType: comments.contentType,
          contentId: comments.contentId,
          parentId: comments.parentId,
          body: comments.body,
          isDeleted: comments.isDeleted,
          likeCount: comments.likeCount,
          createdAt: comments.createdAt,
          userName: appUsers.nickname,
          userAvatarUrl: appUsers.avatarUrl,
        })
        .from(comments)
        .leftJoin(appUsers, eq(comments.userId, appUsers.id))
        .where(where as any)
        .orderBy(desc(comments.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const items = itemsRaw.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      userName: row.userName || '未知用户',
      userAvatarUrl: row.userAvatarUrl,
      contentTypeId: row.contentType,
      contentId: row.contentId,
      parentId: row.parentId,
      body: row.body,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      likeCount: row.likeCount,
    }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async pinContent(contentType: 'post' | 'article', id: string, pin: boolean): Promise<void> {
    const table = contentType === 'post' ? posts : articles;
    const patch: any = { isPinned: pin, updatedAt: new Date() };
    if (pin) {
      patch.pinnedAt = new Date();
    } else {
      patch.pinnedAt = null;
    }
    const updated = await this.db
      .update(table)
      .set(patch)
      .where(eq(table.id as any, id))
      .returning({ id: table.id });

    if (updated.length === 0) {
      throw new NotFoundException('内容不存在');
    }
  }

  async featureContent(contentType: 'post' | 'article', id: string, feature: boolean): Promise<void> {
    const table = contentType === 'post' ? posts : articles;
    const updated = await this.db
      .update(table)
      .set({ isFeatured: feature, updatedAt: new Date() } as any)
      .where(eq(table.id as any, id))
      .returning({ id: table.id });

    if (updated.length === 0) {
      throw new NotFoundException('内容不存在');
    }
  }

  async batchDeletePosts(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.db
      .delete(posts)
      .where(inArray(posts.id, ids))
      .returning({ id: posts.id });
    return result.length;
  }

  async batchDeleteArticles(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.db
      .delete(articles)
      .where(inArray(articles.id, ids))
      .returning({ id: articles.id });
    return result.length;
  }

  async batchDeleteComments(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.db
      .update(comments)
      .set({ isDeleted: true })
      .where(inArray(comments.id, ids))
      .returning({ id: comments.id });
    return result.length;
  }

  async getUserList(
    page: number,
    pageSize: number,
    keyword?: string,
  ): Promise<AdminUserListResponse> {
    const offset = (page - 1) * pageSize;
    const where = keyword
      ? or(
          ilike(appUsers.nickname, `%${keyword}%`),
          ilike(appUsers.email, `%${keyword}%`),
        )
      : undefined;

    const [totalRows, itemsRaw] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(appUsers)
        .where(where as any),
      this.db
        .select({
          id: appUsers.id,
          nickname: appUsers.nickname,
          email: appUsers.email,
          avatarUrl: appUsers.avatarUrl,
          role: appUsers.role,
          bio: appUsers.bio,
          createdAt: appUsers.createdAt,
          lastLoginAt: appUsers.lastLoginAt,
          followerCount: appUsers.followerCount,
          isBanned: appUsers.isBanned,
          banReason: appUsers.banReason,
          bannedAt: appUsers.bannedAt,
        })
        .from(appUsers)
        .where(where as any)
        .orderBy(desc(appUsers.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const userIds = itemsRaw.map((u: any) => u.id);
    const [postCounts, articleCounts, likeCounts] = await Promise.all([
      userIds.length > 0
        ? this.db
            .select({ appUserId: posts.appUserId, count: count() })
            .from(posts)
            .where(inArray(posts.appUserId, userIds))
            .groupBy(posts.appUserId)
        : Promise.resolve([]),
      userIds.length > 0
        ? this.db
            .select({ appUserId: articles.appUserId, count: count() })
            .from(articles)
            .where(inArray(articles.appUserId, userIds))
            .groupBy(articles.appUserId)
        : Promise.resolve([]),
      userIds.length > 0
        ? this.db
            .select({ userId: likes.userId, count: count() })
            .from(likes)
            .where(inArray(likes.userId, userIds))
            .groupBy(likes.userId)
        : Promise.resolve([]),
    ]);

    const postMap = new Map(postCounts.map((r: any) => [r.appUserId, Number(r.count)]));
    const articleMap = new Map(articleCounts.map((r: any) => [r.appUserId, Number(r.count)]));
    const likeMap = new Map(likeCounts.map((r: any) => [r.userId, Number(r.count)]));

    const items: AdminUserItem[] = itemsRaw.map((row: any) => ({
      id: row.id,
      nickname: row.nickname,
      email: row.email,
      avatarUrl: row.avatarUrl,
      role: row.role as any,
      bio: row.bio,
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      postCount: postMap.get(row.id) ?? 0,
      articleCount: articleMap.get(row.id) ?? 0,
      likeCount: likeMap.get(row.id) ?? 0,
      followerCount: row.followerCount,
      isBanned: row.isBanned,
      banReason: row.banReason,
      bannedAt: row.bannedAt ? row.bannedAt.toISOString() : null,
    }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async banUser(userId: string, reason?: string): Promise<void> {
    if (userId === 'system') {
      throw new BadRequestException('不能封禁系统用户');
    }
    const updated = await this.db
      .update(appUsers)
      .set({
        isBanned: true,
        banReason: reason ?? null,
        bannedAt: new Date(),
        tokenVersion: sql`${appUsers.tokenVersion} + 1`,
      })
      .where(eq(appUsers.id, userId))
      .returning({ id: appUsers.id });

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }
  }

  async unbanUser(userId: string): Promise<void> {
    const updated = await this.db
      .update(appUsers)
      .set({
        isBanned: false,
        banReason: null,
        bannedAt: null,
      })
      .where(eq(appUsers.id, userId))
      .returning({ id: appUsers.id });

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }
  }

  async promoteToAdmin(userId: string): Promise<void> {
    const updated = await this.db
      .update(appUsers)
      .set({ role: 'admin' })
      .where(eq(appUsers.id, userId))
      .returning({ id: appUsers.id });

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }
  }

  async demoteFromAdmin(userId: string): Promise<void> {
    const updated = await this.db
      .update(appUsers)
      .set({ role: 'user' })
      .where(eq(appUsers.id, userId))
      .returning({ id: appUsers.id });

    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }
  }

  async getReportList(
    page: number,
    pageSize: number,
    status?: ReportStatus,
  ): Promise<ReportListResponse> {
    const offset = (page - 1) * pageSize;
    const where = status ? eq(reports.status, status) : undefined;

    const [totalRows, reportsRaw] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(reports)
        .where(where as any),
      this.db
        .select({
          id: reports.id,
          reporterId: reports.reporterId,
          contentType: reports.contentType,
          contentId: reports.contentId,
          reason: reports.reason,
          description: reports.description,
          status: reports.status,
          handlerId: reports.handlerId,
          handledAt: reports.handledAt,
          createdAt: reports.createdAt,
          reporterName: appUsers.nickname,
          reporterAvatarUrl: appUsers.avatarUrl,
          handlerName: sql`handler_user.nickname`,
        })
        .from(reports)
        .leftJoin(appUsers, eq(reports.reporterId, appUsers.id))
        .leftJoin(
          sql`app_users AS handler_user`,
          sql`handler_user.id = ${reports.handlerId}`,
        )
        .where(where as any)
        .orderBy(desc(reports.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const items: ReportItem[] = await Promise.all(
      reportsRaw.map(async (row: any) => {
        const contentInfo = await this.getContentInfo(row.contentType, row.contentId);
        return {
          id: row.id,
          reporterId: row.reporterId,
          reporterName: row.reporterName || '未知用户',
          reporterAvatarUrl: row.reporterAvatarUrl,
          contentType: row.contentType,
          contentId: row.contentId,
          contentTitle: contentInfo.title,
          contentPreview: contentInfo.preview,
          contentAuthorId: contentInfo.authorId,
          contentAuthorName: contentInfo.authorName,
          reason: row.reason as ReportReason,
          description: row.description,
          status: row.status as ReportStatus,
          handlerId: row.handlerId,
          handlerName: row.handlerName || null,
          handledAt: row.handledAt ? row.handledAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    );

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  private async getContentInfo(contentType: string, contentId: string) {
    if (contentType === 'post') {
      const rows = await this.db
        .select({
          content: posts.content,
          appUserId: posts.appUserId,
        })
        .from(posts)
        .where(eq(posts.id, contentId as any))
        .limit(1);
      if (rows.length === 0) return { title: undefined, preview: '(内容已删除)', authorId: undefined, authorName: undefined };
      const row = rows[0];
      const user = row.appUserId
        ? await this.db.select({ nickname: appUsers.nickname }).from(appUsers).where(eq(appUsers.id, row.appUserId)).limit(1)
        : [];
      return {
        title: undefined,
        preview: row.content,
        authorId: row.appUserId,
        authorName: user[0]?.nickname,
      };
    } else if (contentType === 'article') {
      const rows = await this.db
        .select({
          title: articles.title,
          excerpt: articles.excerpt,
          appUserId: articles.appUserId,
        })
        .from(articles)
        .where(eq(articles.id, contentId as any))
        .limit(1);
      if (rows.length === 0) return { title: undefined, preview: '(内容已删除)', authorId: undefined, authorName: undefined };
      const row = rows[0];
      const user = row.appUserId
        ? await this.db.select({ nickname: appUsers.nickname }).from(appUsers).where(eq(appUsers.id, row.appUserId)).limit(1)
        : [];
      return {
        title: row.title,
        preview: row.excerpt || '',
        authorId: row.appUserId,
        authorName: user[0]?.nickname,
      };
    } else if (contentType === 'comment') {
      const rows = await this.db
        .select({
          body: comments.body,
          userId: comments.userId,
        })
        .from(comments)
        .where(eq(comments.id, contentId as any))
        .limit(1);
      if (rows.length === 0) return { title: undefined, preview: '(评论已删除)', authorId: undefined, authorName: undefined };
      const row = rows[0];
      const user = await this.db.select({ nickname: appUsers.nickname }).from(appUsers).where(eq(appUsers.id, row.userId)).limit(1);
      return {
        title: '评论',
        preview: row.body,
        authorId: row.userId,
        authorName: user[0]?.nickname,
      };
    }
    return { title: undefined, preview: undefined, authorId: undefined, authorName: undefined };
  }

  async handleReport(
    reportId: string,
    handlerId: string,
    action: 'resolve_delete' | 'resolve_ignore' | 'ban_author',
    reason?: string,
  ): Promise<void> {
    const reportRows = await this.db
      .select({
        id: reports.id,
        contentType: reports.contentType,
        contentId: reports.contentId,
        status: reports.status,
      })
      .from(reports)
      .where(eq(reports.id, reportId as any))
      .limit(1);

    if (reportRows.length === 0) {
      throw new NotFoundException('举报不存在');
    }
    const report = reportRows[0];

    if (action === 'resolve_delete') {
      let authorId: string | null = null;
      if (report.contentType === 'post') {
        const postRows = await this.db
          .select({ appUserId: posts.appUserId })
          .from(posts)
          .where(eq(posts.id, report.contentId as any))
          .limit(1);
        authorId = postRows[0]?.appUserId ?? null;
        await this.db.delete(posts).where(eq(posts.id, report.contentId as any));
      } else if (report.contentType === 'article') {
        const articleRows = await this.db
          .select({ appUserId: articles.appUserId })
          .from(articles)
          .where(eq(articles.id, report.contentId as any))
          .limit(1);
        authorId = articleRows[0]?.appUserId ?? null;
        await this.db.delete(articles).where(eq(articles.id, report.contentId as any));
      } else if (report.contentType === 'comment') {
        const commentRows = await this.db
          .select({ userId: comments.userId })
          .from(comments)
          .where(eq(comments.id, report.contentId as any))
          .limit(1);
        authorId = commentRows[0]?.userId ?? null;
        await this.db.update(comments).set({ isDeleted: true }).where(eq(comments.id, report.contentId as any));
      }
      if (authorId) {
        await this.notificationsService.createNotification(
          authorId,
          'content_removed',
          handlerId,
          report.contentType as 'post' | 'article' | 'comment',
          report.contentId as string,
          undefined,
          { reason: reason || '违反社区规范' },
        );
      }
    } else if (action === 'ban_author') {
      const contentInfo = await this.getContentInfo(report.contentType, report.contentId as string);
      if (contentInfo.authorId) {
        await this.banUser(contentInfo.authorId, reason || '违规内容被举报');
        await this.notificationsService.createNotification(
          contentInfo.authorId,
          'user_banned',
          handlerId,
          null,
          undefined,
          undefined,
          { reason: reason || '违规内容被举报' },
        );
      }
    }

    const newStatus: ReportStatus = action === 'resolve_ignore' ? 'ignored' : 'resolved';

    await this.db
      .update(reports)
      .set({
        status: newStatus,
        handlerId,
        handledAt: new Date(),
      } as any)
      .where(eq(reports.id, reportId as any));
  }

  async createReport(
    reporterId: string,
    contentType: string,
    contentId: string,
    reason: string,
    description?: string,
  ): Promise<string> {
    const [newReport] = await this.db
      .insert(reports)
      .values({
        reporterId,
        contentType,
        contentId,
        reason,
        description: description || null,
      } as any)
      .returning({ id: reports.id });

    return newReport.id;
  }

  // ========== Moderation Queue ==========

  async getModerationPostList(
    page: number,
    pageSize: number,
  ): Promise<AdminModerationPostListResponse> {
    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 100);
    const offset = (safePage - 1) * safePageSize;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          id: posts.id,
          content: posts.content,
          articleId: posts.articleId,
          author: posts.author,
          appUserId: posts.appUserId,
          likeCount: posts.likeCount,
          commentCount: posts.commentCount,
          repostCount: posts.repostCount,
          isPinned: posts.isPinned,
          isFeatured: posts.isFeatured,
          moderationStatus: posts.moderationStatus,
          rejectReason: posts.rejectReason,
          createdAt: posts.createdAt,
          authorName: appUsers.nickname,
          authorAvatarUrl: appUsers.avatarUrl,
          authorRole: appUsers.role,
        })
        .from(posts)
        .leftJoin(appUsers, eq(posts.appUserId, appUsers.id))
        .where(eq(posts.moderationStatus, 'pending_moderation'))
        .orderBy(desc(posts.createdAt))
        .limit(safePageSize)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(posts)
        .where(eq(posts.moderationStatus, 'pending_moderation')),
    ]);

    const items: PostItem[] = rows.map((row: any) => ({
      id: row.id,
      content: row.content,
      articleId: row.articleId,
      authorId: row.appUserId || row.author,
      authorName: row.authorName || row.author,
      authorAvatarUrl: row.authorAvatarUrl || null,
      authorRole: row.authorRole || 'user',
      createdAt: row.createdAt.toISOString(),
      article: null,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      repostCount: row.repostCount,
      isPinned: row.isPinned,
      isFeatured: row.isFeatured,
      moderationStatus: row.moderationStatus,
      hashtags: [],
      mentions: [],
    }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async getModerationArticleList(
    page: number,
    pageSize: number,
  ): Promise<AdminModerationArticleListResponse> {
    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 100);
    const offset = (safePage - 1) * safePageSize;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          id: articles.id,
          title: articles.title,
          excerpt: articles.excerpt,
          coverUrl: articles.coverUrl,
          readCount: articles.readCount,
          author: articles.author,
          appUserId: articles.appUserId,
          likeCount: articles.likeCount,
          commentCount: articles.commentCount,
          repostCount: articles.repostCount,
          bookmarkCount: articles.bookmarkCount,
          isPinned: articles.isPinned,
          isFeatured: articles.isFeatured,
           moderationStatus: articles.moderationStatus,
           rejectReason: articles.rejectReason,
           slug: articles.slug,
           status: articles.status,
           createdAt: articles.createdAt,
           authorName: appUsers.nickname,
           authorAvatarUrl: appUsers.avatarUrl,
           authorRole: appUsers.role,
         })
         .from(articles)
         .leftJoin(appUsers, eq(articles.appUserId, appUsers.id))
         .where(eq(articles.moderationStatus, 'pending_moderation'))
         .orderBy(desc(articles.createdAt))
         .limit(safePageSize)
         .offset(offset),
      this.db
        .select({ count: count() })
        .from(articles)
        .where(eq(articles.moderationStatus, 'pending_moderation')),
    ]);

    const items: ArticleSummary[] = rows.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      status: row.status as 'published' | 'draft',
      title: row.title,
      excerpt: row.excerpt || '',
      coverUrl: row.coverUrl || null,
      readCount: row.readCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      repostCount: row.repostCount,
      bookmarkCount: row.bookmarkCount,
      isPinned: row.isPinned,
      isFeatured: row.isFeatured,
      moderationStatus: row.moderationStatus,
      authorId: row.appUserId || row.author,
      authorName: row.authorName || row.author,
      authorAvatarUrl: row.authorAvatarUrl || null,
      authorRole: row.authorRole || 'user',
      createdAt: row.createdAt.toISOString(),
      imageCount: 0,
      attachmentCount: 0,
      hashtags: [],
    }));

    return {
      items,
      total: Number(totalRows[0]?.count ?? 0),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async reviewPost(
    id: string,
    status: 'approved' | 'rejected',
    reason: string | undefined,
    handlerId: string,
  ): Promise<{ authorId: string | null; contentId: string; contentType: 'post' }> {
    const patch: any = {
      moderationStatus: status,
      updatedAt: new Date(),
    };
    if (status === 'rejected') {
      patch.rejectReason = reason || null;
    } else {
      patch.rejectReason = null;
    }

    const updated = await this.db
      .update(posts)
      .set(patch)
      .where(eq(posts.id, id as any))
      .returning({ id: posts.id, appUserId: posts.appUserId });

    if (updated.length === 0) {
      throw new NotFoundException('帖子不存在');
    }

    const authorId = updated[0].appUserId;
    if (authorId && status === 'rejected') {
      const metadata: Record<string, unknown> = { reason: reason || '审核未通过' };
      await this.notificationsService.createNotification(
        authorId,
        'content_removed',
        handlerId,
        'post',
        id,
        undefined,
        metadata,
      );
    }

    return { authorId: authorId ?? null, contentId: id, contentType: 'post' };
  }

  async reviewArticle(
    id: string,
    status: 'approved' | 'rejected',
    reason: string | undefined,
    handlerId: string,
  ): Promise<{ authorId: string | null; contentId: string; contentType: 'article' }> {
    const patch: any = {
      moderationStatus: status,
      updatedAt: new Date(),
    };
    if (status === 'rejected') {
      patch.rejectReason = reason || null;
    } else {
      patch.rejectReason = null;
    }

    const updated = await this.db
      .update(articles)
      .set(patch)
      .where(eq(articles.id, id as any))
      .returning({ id: articles.id, appUserId: articles.appUserId });

    if (updated.length === 0) {
      throw new NotFoundException('文章不存在');
    }

    const authorId = updated[0].appUserId;
    if (authorId && status === 'rejected') {
      const metadata: Record<string, unknown> = { reason: reason || '审核未通过' };
      await this.notificationsService.createNotification(
        authorId,
        'content_removed',
        handlerId,
        'article',
        id,
        undefined,
        metadata,
      );
    }

    return { authorId: authorId ?? null, contentId: id, contentType: 'article' };
  }

  // ========== CSV Export ==========

  private escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async exportUsers(): Promise<string> {
    const rows = await this.db
      .select({
        id: appUsers.id,
        nickname: appUsers.nickname,
        email: appUsers.email,
        role: appUsers.role,
        isBanned: appUsers.isBanned,
        createdAt: appUsers.createdAt,
        lastLoginAt: appUsers.lastLoginAt,
      })
      .from(appUsers)
      .orderBy(desc(appUsers.createdAt));

    const header = 'id,nickname,email,role,isBanned,createdAt,lastLoginAt';
    const data = rows.map((r) =>
      [
        r.id,
        r.nickname,
        r.email || '',
        r.role,
        r.isBanned ? 'true' : 'false',
        r.createdAt.toISOString(),
        r.lastLoginAt ? r.lastLoginAt.toISOString() : '',
      ]
        .map((v) => this.escapeCsv(v))
        .join(','),
    );
    return [header, ...data].join('\n');
  }

  async exportPosts(): Promise<string> {
    const rows = await this.db
      .select({
        id: posts.id,
        content: posts.content,
        authorName: appUsers.nickname,
        likeCount: posts.likeCount,
        commentCount: posts.commentCount,
        repostCount: posts.repostCount,
        isPinned: posts.isPinned,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .leftJoin(appUsers, eq(posts.appUserId, appUsers.id))
      .orderBy(desc(posts.createdAt));

    const header = 'id,content,authorName,likeCount,commentCount,repostCount,isPinned,createdAt';
    const data = rows.map((r) =>
      [
        r.id,
        r.content,
        r.authorName || '',
        r.likeCount,
        r.commentCount,
        r.repostCount,
        r.isPinned ? 'true' : 'false',
        r.createdAt.toISOString(),
      ]
        .map((v) => this.escapeCsv(v))
        .join(','),
    );
    return [header, ...data].join('\n');
  }

  async exportArticles(): Promise<string> {
    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        authorName: appUsers.nickname,
        readCount: articles.readCount,
        likeCount: articles.likeCount,
        commentCount: articles.commentCount,
        isPinned: articles.isPinned,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .leftJoin(appUsers, eq(articles.appUserId, appUsers.id))
      .orderBy(desc(articles.createdAt));

    const header = 'id,title,excerpt,authorName,readCount,likeCount,commentCount,isPinned,createdAt';
    const data = rows.map((r) =>
      [
        r.id,
        r.title,
        r.excerpt || '',
        r.authorName || '',
        r.readCount,
        r.likeCount,
        r.commentCount,
        r.isPinned ? 'true' : 'false',
        r.createdAt.toISOString(),
      ]
        .map((v) => this.escapeCsv(v))
        .join(','),
    );
    return [header, ...data].join('\n');
  }

  async exportComments(): Promise<string> {
    const rows = await this.db
      .select({
        id: comments.id,
        body: comments.body,
        authorName: appUsers.nickname,
        contentType: comments.contentType,
        contentId: comments.contentId,
        likeCount: comments.likeCount,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .leftJoin(appUsers, eq(comments.userId, appUsers.id))
      .orderBy(desc(comments.createdAt));

    const header = 'id,body,authorName,contentType,contentId,likeCount,createdAt';
    const data = rows.map((r) =>
      [
        r.id,
        r.body,
        r.authorName || '',
        r.contentType,
        r.contentId,
        r.likeCount,
        r.createdAt.toISOString(),
      ]
        .map((v) => this.escapeCsv(v))
        .join(','),
    );
    return [header, ...data].join('\n');
  }
}
