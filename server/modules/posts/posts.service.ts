import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import { posts, articles, articleImages, articleAttachments, appUsers, follows, contentHashtags, hashtags, siteSettings } from '@server/database/schema';
import { eq, desc, lt, inArray, sql, count, and } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service';
import { HashtagsService } from '../hashtags/hashtags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import { contentGuard } from '@server/common/utils/content-guard';
import type { PostItem, ArticleSummary, TimelineResponse, TimelineItem, TimelineView } from '@shared/api.interface';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authService: AuthService,
    private readonly hashtagsService: HashtagsService,
    private readonly notificationsService: NotificationsService,
    private readonly siteSettingsService: SiteSettingsService,
  ) {}

  async create(userId: string, content: string, articleId?: string): Promise<{ id: string }> {
    const isAdmin = await this.authService.isAdmin(userId);

    // 本地零延迟敏感/黑产风控校验
    const validation = contentGuard.validateContent(content);
    if (!validation.valid && !isAdmin) {
      throw new BadRequestException(`发布内容包含违规或垃圾信息关键词：${validation.matchedWords.join(', ')}`);
    }

    const settings = await this.siteSettingsService.getSettings();
    const moderationStatus: string = !isAdmin && settings.contentModerationEnabled
      ? 'pending_moderation'
      : 'approved';

    const values: typeof posts.$inferInsert = {
      content,
      author: userId,
      appUserId: userId,
      moderationStatus,
    };
    if (articleId) {
      values.articleId = articleId;
    }

    const result = await this.db.insert(posts).values(values).returning({ id: posts.id });
    const postId: string = result[0].id;

    // Sync hashtags (has its own internal transaction)
    try {
      await this.hashtagsService.syncContentHashtags('post', postId, content);
    } catch (err) {
      this.logger.warn(`syncContentHashtags failed for post ${postId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Parse @mentions and send notifications (fire-and-forget)
    void this.handleMentions(postId, userId, content);

    return { id: postId };
  }

  private async handleMentions(postId: string, actorId: string, content: string): Promise<void> {
    try {
      const mentionRegex = /@([\w\u4e00-\u9fa5]+)/g;
      const matches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = mentionRegex.exec(content)) !== null) {
        matches.push(m[1]);
      }
      if (matches.length === 0) return;

      const uniqueNicknames = [...new Set(matches)];
      const mentionedUsers = await this.db
        .select({ id: appUsers.id, nickname: appUsers.nickname })
        .from(appUsers)
        .where(inArray(appUsers.nickname, uniqueNicknames));

      for (const u of mentionedUsers) {
        if (u.id === actorId) continue;
        await this.notificationsService.createNotification(
          u.id,
          'mention',
          actorId,
          'post',
          postId,
          undefined,
          { text: content },
        );
      }
    } catch (err) {
      this.logger.warn(`handleMentions failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private getAuthorId(row: { appUserId: string | null; author: string }): string {
    return row.appUserId ?? row.author;
  }

  async getPostById(id: string): Promise<PostItem> {
    const postRows = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.moderationStatus, 'approved')))
      .limit(1);
    if (postRows.length === 0) {
      throw new NotFoundException('Post not found');
    }
    const postRow = postRows[0];

    const articleIds: string[] = [];
    if (postRow.articleId) {
      articleIds.push(postRow.articleId);
    }

    const authorIds = [this.getAuthorId(postRow)];

    let articleSummary: ArticleSummary | null = null;
    if (articleIds.length > 0) {
      const articleRows = await this.db.select().from(articles).where(eq(articles.id, articleIds[0])).limit(1);
      if (articleRows.length > 0) {
        const ar = articleRows[0];
          authorIds.push(this.getAuthorId(ar));
        const [imgCounts, attCounts] = await Promise.all([
          this.countByArticle(articleImages, articleImages.articleId, [ar.id]),
          this.countByArticle(articleAttachments, articleAttachments.articleId, [ar.id]),
        ]);
         articleSummary = {
           id: ar.id,
           slug: ar.slug,
           status: ar.status as 'published' | 'draft',
           title: ar.title,
           excerpt: ar.excerpt,
           coverUrl: ar.coverUrl,
           readCount: ar.readCount,
           authorId: this.getAuthorId(ar),
           authorName: '',
           authorAvatarUrl: null,
           authorRole: 'user',
           createdAt: ar.createdAt.toISOString(),
           imageCount: imgCounts.get(ar.id) ?? 0,
           attachmentCount: attCounts.get(ar.id) ?? 0,
           likeCount: ar.likeCount,
           commentCount: ar.commentCount,
           repostCount: ar.repostCount,
           bookmarkCount: ar.bookmarkCount,
           isPinned: ar.isPinned,
           isFeatured: ar.isFeatured,
           moderationStatus: ar.moderationStatus,
         };
      }
    }

     const [nameMap, avatarMap, roleMap, hashtagsList, mentionsMap] = await Promise.all([
       this.fetchUserNicknames(authorIds),
       this.fetchUserAvatars(authorIds),
       this.fetchUserRoles(authorIds),
       this.fetchContentHashtags('post', [postRow.id]),
       this.fetchPostMentions([{ id: postRow.id, content: postRow.content }]),
     ]);

     if (articleSummary) {
       articleSummary.authorName = nameMap.get(articleSummary.authorId) ?? '';
       articleSummary.authorAvatarUrl = avatarMap.get(articleSummary.authorId) ?? null;
       articleSummary.authorRole = roleMap.get(articleSummary.authorId) ?? 'user';
     }

     return {
       id: postRow.id,
       content: postRow.content,
       articleId: postRow.articleId ?? null,
       authorId: this.getAuthorId(postRow),
       authorName: nameMap.get(this.getAuthorId(postRow)) ?? '',
       authorAvatarUrl: avatarMap.get(this.getAuthorId(postRow)) ?? null,
       authorRole: roleMap.get(this.getAuthorId(postRow)) ?? 'user',
       createdAt: postRow.createdAt.toISOString(),
       article: articleSummary,
       likeCount: postRow.likeCount,
       commentCount: postRow.commentCount,
       repostCount: postRow.repostCount,
       isPinned: postRow.isPinned,
       isFeatured: postRow.isFeatured,
       moderationStatus: postRow.moderationStatus,
       hashtags: hashtagsList.get(postRow.id) ?? [],
       mentions: mentionsMap.get(postRow.id) ?? [],
     };
  }

  async getUserPosts(userId: string): Promise<PostItem[]> {
    const postRows = await this.db
      .select()
      .from(posts)
      .where(eq(posts.appUserId, userId))
      .orderBy(desc(posts.isPinned), desc(posts.pinnedAt), desc(posts.createdAt));

    if (postRows.length === 0) {
      return [];
    }

    const authorIds = new Set<string>();
    const articleIds = new Set<string>();
    for (const row of postRows) {
      authorIds.add(this.getAuthorId(row));
      if (row.articleId) articleIds.add(row.articleId);
    }

    const articleIdArr = Array.from(articleIds);
    const articleMap = new Map<string, typeof articles.$inferSelect>();
    if (articleIdArr.length > 0) {
      const articleRows = await this.db
        .select()
        .from(articles)
        .where(inArray(articles.id, articleIdArr));
      for (const ar of articleRows) {
        articleMap.set(ar.id, ar);
        authorIds.add(this.getAuthorId(ar));
      }
    }

    const postIds = postRows.map((r: typeof posts.$inferSelect) => r.id);
    const postContentPairs = postRows.map((r: typeof posts.$inferSelect) => ({ id: r.id, content: r.content }));

     const [imgCounts, attCounts, nameMap, avatarMap, roleMap, hashtagsList, mentionsMap] = await Promise.all([
       articleIdArr.length > 0 ? this.countByArticle(articleImages, articleImages.articleId, articleIdArr) : Promise.resolve(new Map<string, number>()),
       articleIdArr.length > 0 ? this.countByArticle(articleAttachments, articleAttachments.articleId, articleIdArr) : Promise.resolve(new Map<string, number>()),
       this.fetchUserNicknames(Array.from(authorIds)),
       this.fetchUserAvatars(Array.from(authorIds)),
       this.fetchUserRoles(Array.from(authorIds)),
       this.fetchContentHashtags('post', postIds),
       this.fetchPostMentions(postContentPairs),
     ]);

    return postRows.map((row: typeof posts.$inferSelect) => {
      let articleSummary: ArticleSummary | null = null;
      if (row.articleId && articleMap.has(row.articleId)) {
        const ar = articleMap.get(row.articleId)!;
         articleSummary = {
           id: ar.id,
           slug: ar.slug,
           status: ar.status as 'published' | 'draft',
           title: ar.title,
           excerpt: ar.excerpt,
           coverUrl: ar.coverUrl,
           readCount: ar.readCount,
           authorId: this.getAuthorId(ar),
           authorName: nameMap.get(this.getAuthorId(ar)) ?? '',
           authorAvatarUrl: avatarMap.get(this.getAuthorId(ar)) ?? null,
           authorRole: roleMap.get(this.getAuthorId(ar)) ?? 'user',
           createdAt: ar.createdAt.toISOString(),
           imageCount: imgCounts.get(ar.id) ?? 0,
           attachmentCount: attCounts.get(ar.id) ?? 0,
           likeCount: ar.likeCount,
           commentCount: ar.commentCount,
           repostCount: ar.repostCount,
           bookmarkCount: ar.bookmarkCount,
           isPinned: ar.isPinned,
           isFeatured: ar.isFeatured,
           moderationStatus: ar.moderationStatus,
         };
       }
       return {
         id: row.id,
         content: row.content,
         articleId: row.articleId ?? null,
         authorId: this.getAuthorId(row),
         authorName: nameMap.get(this.getAuthorId(row)) ?? '',
         authorAvatarUrl: avatarMap.get(this.getAuthorId(row)) ?? null,
         authorRole: roleMap.get(this.getAuthorId(row)) ?? 'user',
         createdAt: row.createdAt.toISOString(),
         article: articleSummary,
         likeCount: row.likeCount,
         commentCount: row.commentCount,
         repostCount: row.repostCount,
         isPinned: row.isPinned,
         isFeatured: row.isFeatured,
         moderationStatus: row.moderationStatus,
         hashtags: hashtagsList.get(row.id) ?? [],
         mentions: mentionsMap.get(row.id) ?? [],
       };
    });
  }

  async deletePost(id: string, userId: string): Promise<void> {
    const postRows = await this.db.select({ id: posts.id, appUserId: posts.appUserId, content: posts.content }).from(posts).where(eq(posts.id, id)).limit(1);
    if (postRows.length === 0) {
      throw new NotFoundException('Post not found');
    }
    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin && postRows[0].appUserId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    // Sync hashtags (decrement counters and remove associations)
    await this.hashtagsService.syncContentHashtags('post', id, '');

    await this.db.delete(posts).where(eq(posts.id, id));
  }

  async getTimeline(
    cursor: string | null,
    limit: number,
    view: TimelineView = 'all',
    currentUserId?: string,
  ): Promise<TimelineResponse> {
    const fetchLimit = limit + 1;
    let cursorDate: Date | null = null;
    let hotCursorScore: number | null = null;
    if (cursor) {
      if (view === 'hot' && cursor.startsWith('hot:')) {
        const parts = cursor.split(':');
        const parsedScore = Number(parts[1]);
        const isoStr = parts.slice(2).join(':');
        if (!Number.isNaN(parsedScore) && isoStr) {
          hotCursorScore = parsedScore;
          cursorDate = new Date(isoStr);
        }
      } else {
        cursorDate = new Date(cursor);
      }
    }

    // Build author filter for 'following' view
    let followingIds: string[] = [];
    if (view === 'following' && currentUserId) {
      const followRows = await this.db
        .select({ followingId: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, currentUserId));
      followingIds = followRows.map((r: { followingId: string }) => r.followingId);
      // If user follows nobody, return empty timeline
      if (followingIds.length === 0) {
        return { items: [], nextCursor: null, hasMore: false };
      }
    } else if (view === 'following' && !currentUserId) {
      // Not logged in, following view is empty
      return { items: [], nextCursor: null, hasMore: false };
    }

    const postScoreExpr = sql<number>`(${posts.likeCount} * 3 + ${posts.commentCount} * 5 + ${posts.repostCount} * 4)`;
    const articleScoreExpr = sql<number>`(${articles.likeCount} * 3 + ${articles.commentCount} * 5 + ${articles.repostCount} * 4 + ${articles.bookmarkCount} * 2)`;

    const postConds = [eq(posts.moderationStatus, 'approved')];
    const articleConds = [eq(articles.moderationStatus, 'approved'), eq(articles.status, 'published')];

    if (view === 'following' && followingIds.length > 0) {
      postConds.push(inArray(posts.appUserId, followingIds));
      articleConds.push(inArray(articles.appUserId, followingIds));
    }

    if (view === 'hot' && hotCursorScore !== null && cursorDate) {
      postConds.push(
        sql`(${postScoreExpr} < ${hotCursorScore} OR (${postScoreExpr} = ${hotCursorScore} AND ${posts.createdAt} < ${cursorDate}))`,
      );
      articleConds.push(
        sql`(${articleScoreExpr} < ${hotCursorScore} OR (${articleScoreExpr} = ${hotCursorScore} AND ${articles.createdAt} < ${cursorDate}))`,
      );
    } else if (view !== 'hot' && cursorDate) {
      postConds.push(lt(posts.createdAt, cursorDate));
      articleConds.push(lt(articles.createdAt, cursorDate));
    }

    const postOrderBy = view === 'hot'
      ? [desc(postScoreExpr), desc(posts.createdAt)]
      : [desc(posts.isPinned), desc(posts.pinnedAt), desc(posts.createdAt)];
    const articleOrderBy = view === 'hot'
      ? [desc(articleScoreExpr), desc(articles.createdAt)]
      : [desc(articles.isPinned), desc(articles.pinnedAt), desc(articles.createdAt)];

    const postQuery = postConds.length > 0
      ? this.db
          .select()
          .from(posts)
          .where(and(...postConds))
          .orderBy(...postOrderBy)
          .limit(fetchLimit)
      : this.db.select().from(posts).orderBy(...postOrderBy).limit(fetchLimit);

    const articleQuery = articleConds.length > 0
      ? this.db
          .select()
          .from(articles)
          .where(and(...articleConds))
          .orderBy(...articleOrderBy)
          .limit(fetchLimit)
      : this.db.select().from(articles).orderBy(...articleOrderBy).limit(fetchLimit);

    const [postRows, articleRows] = await Promise.all([postQuery, articleQuery]);

    const postItems: Array<{ type: 'post'; data: typeof posts.$inferSelect; createdAt: Date; isPinned: boolean; pinnedAt: Date | null }> = postRows.map(
      (row: typeof posts.$inferSelect) => ({
        type: 'post' as const,
        data: row,
        createdAt: row.createdAt,
        isPinned: row.isPinned,
        pinnedAt: row.pinnedAt,
      }),
    );
    const articleItems: Array<{ type: 'article'; data: typeof articles.$inferSelect; createdAt: Date; isPinned: boolean; pinnedAt: Date | null }> = articleRows.map(
      (row: typeof articles.$inferSelect) => ({
        type: 'article' as const,
        data: row,
        createdAt: row.createdAt,
        isPinned: row.isPinned,
        pinnedAt: row.pinnedAt,
      }),
    );

    const computeHotScore = (item: { data: typeof posts.$inferSelect | typeof articles.$inferSelect }) =>
      (item.data.likeCount ?? 0) * 3 +
      (item.data.commentCount ?? 0) * 5 +
      (item.data.repostCount ?? 0) * 4 +
      ('bookmarkCount' in item.data ? (item.data.bookmarkCount ?? 0) * 2 : 0);

    const merged = [...postItems, ...articleItems].sort((a, b) => {
      if (view === 'hot') {
        const aScore = computeHotScore(a);
        const bScore = computeHotScore(b);
        if (bScore !== aScore) return bScore - aScore;
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        const aTime = a.pinnedAt ? a.pinnedAt.getTime() : 0;
        const bTime = b.pinnedAt ? b.pinnedAt.getTime() : 0;
        return bTime - aTime;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const hasMore = merged.length > limit;
    const pageItems = merged.slice(0, limit);

    const authorIds = new Set<string>();
    const articleIds = new Set<string>();

    for (const item of pageItems) {
      if (item.type === 'post') {
        authorIds.add(this.getAuthorId(item.data));
        if (item.data.articleId) articleIds.add(item.data.articleId);
      } else {
        authorIds.add(this.getAuthorId(item.data));
      }
    }

    const articleIdArr = Array.from(articleIds);
    const articleMap = new Map<string, typeof articles.$inferSelect>();
    const timelineArticleIds = new Set<string>();
    if (articleIdArr.length > 0) {
      const linkedArticles = await this.db
        .select()
        .from(articles)
        .where(inArray(articles.id, articleIdArr));
      for (const ar of linkedArticles) {
        articleMap.set(ar.id, ar);
        authorIds.add(this.getAuthorId(ar));
      }
    }
    for (const item of pageItems) {
      if (item.type === 'article') timelineArticleIds.add(item.data.id);
      if (item.type === 'post' && item.data.articleId) timelineArticleIds.add(item.data.articleId);
    }
    const timelineArticleIdArr = Array.from(timelineArticleIds);

    const timelinePostIds: string[] = [];
    const timelinePostContents: Array<{ id: string; content: string }> = [];
    for (const item of pageItems) {
      if (item.type === 'post') {
        timelinePostIds.push(item.data.id);
        timelinePostContents.push({ id: item.data.id, content: item.data.content });
      }
    }

     const [imgCounts, attCounts, nameMap, avatarMap, roleMap, postHashtags, articleHashtags, postMentions] = await Promise.all([
       timelineArticleIdArr.length > 0
         ? this.countByArticle(articleImages, articleImages.articleId, timelineArticleIdArr)
         : Promise.resolve(new Map<string, number>()),
       timelineArticleIdArr.length > 0
         ? this.countByArticle(articleAttachments, articleAttachments.articleId, timelineArticleIdArr)
         : Promise.resolve(new Map<string, number>()),
       this.fetchUserNicknames(Array.from(authorIds)),
       this.fetchUserAvatars(Array.from(authorIds)),
       this.fetchUserRoles(Array.from(authorIds)),
       timelinePostIds.length > 0
         ? this.fetchContentHashtags('post', timelinePostIds)
         : Promise.resolve(new Map<string, string[]>()),
       timelineArticleIdArr.length > 0
         ? this.fetchContentHashtags('article', timelineArticleIdArr)
         : Promise.resolve(new Map<string, string[]>()),
       timelinePostIds.length > 0
         ? this.fetchPostMentions(timelinePostContents)
         : Promise.resolve(new Map<string, string[]>()),
     ]);

    const items: TimelineItem[] = pageItems.map((item) => {
      if (item.type === 'post') {
        const row = item.data;
        let articleSummary: ArticleSummary | undefined;
        if (row.articleId && articleMap.has(row.articleId)) {
          const ar = articleMap.get(row.articleId)!;
           articleSummary = {
             id: ar.id,
             slug: ar.slug,
             status: ar.status as 'published' | 'draft',
             title: ar.title,
             excerpt: ar.excerpt,
             coverUrl: ar.coverUrl,
             readCount: ar.readCount,
             authorId: this.getAuthorId(ar),
             authorName: nameMap.get(this.getAuthorId(ar)) ?? '',
             authorAvatarUrl: avatarMap.get(this.getAuthorId(ar)) ?? null,
             authorRole: roleMap.get(this.getAuthorId(ar)) ?? 'user',
             createdAt: ar.createdAt.toISOString(),
             imageCount: imgCounts.get(ar.id) ?? 0,
             attachmentCount: attCounts.get(ar.id) ?? 0,
             likeCount: ar.likeCount,
             commentCount: ar.commentCount,
             repostCount: ar.repostCount,
           bookmarkCount: ar.bookmarkCount,
           isPinned: ar.isPinned,
           isFeatured: ar.isFeatured,
           moderationStatus: ar.moderationStatus,
           hashtags: articleHashtags.get(ar.id) ?? [],
           };
         }
         const postItem: PostItem = {
           id: row.id,
           content: row.content,
           articleId: row.articleId ?? null,
           authorId: this.getAuthorId(row),
           authorName: nameMap.get(this.getAuthorId(row)) ?? '',
           authorAvatarUrl: avatarMap.get(this.getAuthorId(row)) ?? null,
           authorRole: roleMap.get(this.getAuthorId(row)) ?? 'user',
           createdAt: row.createdAt.toISOString(),
           article: articleSummary ?? null,
           likeCount: row.likeCount,
           commentCount: row.commentCount,
           repostCount: row.repostCount,
           isPinned: row.isPinned,
           isFeatured: row.isFeatured,
           moderationStatus: row.moderationStatus,
           hashtags: postHashtags.get(row.id) ?? [],
           mentions: postMentions.get(row.id) ?? [],
         };
         return { type: 'post' as const, post: postItem };
       } else {
         const row = item.data;
         const articleSummary: ArticleSummary = {
           id: row.id,
           slug: row.slug,
           status: row.status as 'published' | 'draft',
           title: row.title,
           excerpt: row.excerpt,
           coverUrl: row.coverUrl,
           readCount: row.readCount,
           authorId: this.getAuthorId(row),
           authorName: nameMap.get(this.getAuthorId(row)) ?? '',
           authorAvatarUrl: avatarMap.get(this.getAuthorId(row)) ?? null,
           authorRole: roleMap.get(this.getAuthorId(row)) ?? 'user',
           createdAt: row.createdAt.toISOString(),
           imageCount: imgCounts.get(row.id) ?? 0,
           attachmentCount: attCounts.get(row.id) ?? 0,
           likeCount: row.likeCount,
           commentCount: row.commentCount,
           repostCount: row.repostCount,
           bookmarkCount: row.bookmarkCount,
           isPinned: row.isPinned,
           isFeatured: row.isFeatured,
           moderationStatus: row.moderationStatus,
           hashtags: articleHashtags.get(row.id) ?? [],
         };
        return { type: 'article' as const, article: articleSummary };
      }
    });

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      nextCursor =
        view === 'hot'
          ? `hot:${computeHotScore(lastItem)}:${lastItem.createdAt.toISOString()}`
          : lastItem.createdAt.toISOString();
    }

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  private async fetchPostMentions(
    posts: Array<{ id: string; content: string }>,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (posts.length === 0) return result;

    const mentionRegex = /@([\w\u4e00-\u9fa5]+)/g;
    const allNicknames = new Set<string>();
    const postNicknames = new Map<string, string[]>();

    for (const p of posts) {
      const nicknames: string[] = [];
      let m: RegExpExecArray | null;
      mentionRegex.lastIndex = 0;
      while ((m = mentionRegex.exec(p.content)) !== null) {
        nicknames.push(m[1]);
        allNicknames.add(m[1]);
      }
      postNicknames.set(p.id, [...new Set(nicknames)]);
    }

    if (allNicknames.size === 0) {
      for (const p of posts) result.set(p.id, []);
      return result;
    }

    try {
      const userRows = await this.db
        .select({ id: appUsers.id, nickname: appUsers.nickname })
        .from(appUsers)
        .where(inArray(appUsers.nickname, [...allNicknames]));

      const nicknameToId = new Map<string, string>();
      for (const u of userRows) {
        nicknameToId.set(u.nickname, u.id);
      }

      for (const p of posts) {
        const nicks = postNicknames.get(p.id) ?? [];
        const userIds: string[] = [];
        for (const n of nicks) {
          const uid = nicknameToId.get(n);
          if (uid) userIds.push(uid);
        }
        result.set(p.id, userIds);
      }
    } catch (err) {
      this.logger.warn(`fetchPostMentions failed: ${err instanceof Error ? err.message : String(err)}`);
      for (const p of posts) result.set(p.id, []);
    }

    return result;
  }

  private async fetchContentHashtags(
    contentType: 'post' | 'article',
    contentIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (contentIds.length === 0) return result;

    const rows = await this.db
      .select({
        contentId: contentHashtags.contentId,
        tag: hashtags.tag,
      })
      .from(contentHashtags)
      .innerJoin(hashtags, eq(contentHashtags.hashtagId, hashtags.id))
      .where(
        and(
          eq(contentHashtags.contentType, contentType),
          inArray(contentHashtags.contentId, contentIds),
        ),
      );

    for (const row of rows) {
      const existing = result.get(row.contentId) ?? [];
      existing.push(row.tag);
      result.set(row.contentId, existing);
    }

    return result;
  }

  private async fetchUserRoles(userIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)];
    const roleMap = new Map<string, string>();
    if (uniqueIds.length === 0) {
      return roleMap;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = uniqueIds.filter((id: string) => uuidRegex.test(id));
    const nonUuidIds = uniqueIds.filter((id: string) => !uuidRegex.test(id));
    for (const id of nonUuidIds) {
      roleMap.set(id, 'user');
    }
    if (uuidIds.length === 0) {
      return roleMap;
    }
    try {
      const users = await this.db
        .select({
          id: appUsers.id,
          role: appUsers.role,
        })
        .from(appUsers)
        .where(inArray(appUsers.id, uuidIds));

      for (const u of users) {
        roleMap.set(u.id, u.role);
      }
      for (const id of uuidIds) {
        if (!roleMap.has(id)) {
          roleMap.set(id, 'user');
        }
      }
    } catch (err) {
      this.logger.warn(`fetchUserRoles failed: ${err instanceof Error ? err.message : String(err)}`);
      for (const id of uuidIds) {
        if (!roleMap.has(id)) {
          roleMap.set(id, 'user');
        }
      }
    }
    return roleMap;
  }

  private async fetchUserAvatars(userIds: string[]): Promise<Map<string, string | null>> {
    const uniqueIds = [...new Set(userIds)];
    const avatarMap = new Map<string, string | null>();
    if (uniqueIds.length === 0) {
      return avatarMap;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = uniqueIds.filter((id: string) => uuidRegex.test(id));
    const nonUuidIds = uniqueIds.filter((id: string) => !uuidRegex.test(id));
    for (const id of nonUuidIds) {
      avatarMap.set(id, null);
    }
    if (uuidIds.length === 0) {
      return avatarMap;
    }
    try {
      const users = await this.db
        .select({
          id: appUsers.id,
          avatarUrl: appUsers.avatarUrl,
        })
        .from(appUsers)
        .where(inArray(appUsers.id, uuidIds));

      for (const u of users) {
        avatarMap.set(u.id, u.avatarUrl);
      }
      for (const id of uuidIds) {
        if (!avatarMap.has(id)) {
          avatarMap.set(id, null);
        }
      }
    } catch (err) {
      this.logger.warn(`fetchUserAvatars failed: ${err instanceof Error ? err.message : String(err)}`);
      for (const id of uuidIds) {
        if (!avatarMap.has(id)) {
          avatarMap.set(id, null);
        }
      }
    }
    return avatarMap;
  }

  private async fetchUserNicknames(userIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)];
    const nameMap = new Map<string, string>();
    if (uniqueIds.length === 0) {
      return nameMap;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = uniqueIds.filter((id: string) => uuidRegex.test(id));
    const nonUuidIds = uniqueIds.filter((id: string) => !uuidRegex.test(id));
    for (const id of nonUuidIds) {
      nameMap.set(id, id.slice(0, 8));
    }
    if (uuidIds.length === 0) {
      return nameMap;
    }
    try {
      const users = await this.db
        .select({
          id: appUsers.id,
          nickname: appUsers.nickname,
        })
        .from(appUsers)
        .where(inArray(appUsers.id, uuidIds));

      for (const u of users) {
        nameMap.set(u.id, u.nickname);
      }
      for (const id of uuidIds) {
        if (!nameMap.has(id)) {
          nameMap.set(id, id.slice(0, 8));
        }
      }
    } catch (err) {
      this.logger.warn(`fetchUserNicknames failed, falling back to id display: ${err instanceof Error ? err.message : String(err)}`);
      for (const id of uuidIds) {
        if (!nameMap.has(id)) {
          nameMap.set(id, id.slice(0, 8));
        }
      }
    }
    return nameMap;
  }

  private async countByArticle(
    table: any,
    articleCol: any,
    articleIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        articleId: articleCol,
        count: count(),
      })
      .from(table)
      .where(sql`${articleCol} IN ${sql`(${sql.join(articleIds.map((id: string) => sql`${id}`), sql`, `)})`}`)
      .groupBy(articleCol);

    const result: Map<string, number> = new Map<string, number>();
    for (const r of rows) {
      result.set(r.articleId, Number(r.count));
    }
    return result;
  }
}
