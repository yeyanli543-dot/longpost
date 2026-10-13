import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import {
  hashtags,
  contentHashtags,
  posts,
  articles,
  articleImages,
  articleAttachments,
  appUsers,
} from '@server/database/schema';
import { eq, desc, lt, inArray, sql, count, and, asc } from 'drizzle-orm';
import type {
  HashtagItem,
  HashtagTimelineResponse,
  TrendingHashtagsResponse,
  TimelineItem,
  PostItem,
  ArticleSummary,
} from '@shared/api.interface';

@Injectable()
export class HashtagsService {
  private readonly logger = new Logger(HashtagsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * Get the effective author ID from a post or article row.
   * Prefers appUserId (UUID, app_users table) over author (userProfile numeric ID).
   */
  private getAuthorId(row: { appUserId: string | null; author: string }): string {
    return row.appUserId ?? row.author;
  }

  /**
   * Extract hashtag names from content text.
   * Matches #word patterns supporting Chinese and English characters.
   * Returns deduplicated, lowercased tag names (without the # prefix).
   */
  extractHashtags(content: string): string[] {
    if (!content) return [];
    const regex = /#[\w\u4e00-\u9fa5]+/g;
    const matches = content.match(regex) ?? [];
    const unique = new Set<string>();
    for (const m of matches) {
      unique.add(m.slice(1).toLowerCase());
    }
    return Array.from(unique);
  }

  /**
   * Sync hashtags for a piece of content (post or article).
   * - Parses hashtags from content
   * - Deletes old content_hashtag associations
   * - Inserts new associations
   * - Updates hashtag counters atomically
   * - Wraps everything in a transaction
   */
  async syncContentHashtags(
    contentType: 'post' | 'article',
    contentId: string,
    content: string,
  ): Promise<void> {
    const tagNames = this.extractHashtags(content);

    await this.db.transaction(async (tx) => {
      // 1. Find existing associations for this content to know which tags to decrement
      const oldAssocs = await tx
        .select({ hashtagId: contentHashtags.hashtagId })
        .from(contentHashtags)
        .where(
          and(
            eq(contentHashtags.contentType, contentType),
            eq(contentHashtags.contentId, contentId),
          ),
        );

      const oldTagIds = oldAssocs.map((a: { hashtagId: string }) => a.hashtagId);

      // 2. Delete old associations
      if (oldTagIds.length > 0) {
        await tx
          .delete(contentHashtags)
          .where(
            and(
              eq(contentHashtags.contentType, contentType),
              eq(contentHashtags.contentId, contentId),
            ),
          );
      }

      // 3. Ensure all new tags exist (upsert pattern)
      const newTagRows: Array<{ id: string; tag: string }> = [];
      for (const tagName of tagNames) {
        const existing = await tx
          .select({ id: hashtags.id, tag: hashtags.tag })
          .from(hashtags)
          .where(eq(hashtags.tag, tagName))
          .limit(1);
        if (existing.length > 0) {
          newTagRows.push(existing[0]);
        } else {
          const inserted = await tx
            .insert(hashtags)
            .values({ tag: tagName })
            .returning({ id: hashtags.id, tag: hashtags.tag });
          newTagRows.push(inserted[0]);
        }
      }

      const newTagIds = newTagRows.map((t: { id: string; tag: string }) => t.id);

      // 4. Insert new content_hashtag associations
      if (newTagIds.length > 0) {
        const values = newTagIds.map((tagId: string) => ({
          hashtagId: tagId,
          contentType,
          contentId,
        }));
        await tx.insert(contentHashtags).values(values);
      }

      // 5. Compute delta sets
      const oldSet = new Set(oldTagIds);
      const newSet = new Set(newTagIds);

      // Tags that were removed (need decrement)
      const removedIds = oldTagIds.filter((id: string) => !newSet.has(id));
      // Tags that were added (need increment)
      const addedIds = newTagIds.filter((id: string) => !oldSet.has(id));

      // 6. Atomic decrement for removed tags
      if (removedIds.length > 0) {
        if (contentType === 'post') {
          await tx
            .update(hashtags)
            .set({ postCount: sql`GREATEST(0, ${hashtags.postCount} - 1)` })
            .where(inArray(hashtags.id, removedIds));
        } else {
          await tx
            .update(hashtags)
            .set({ articleCount: sql`GREATEST(0, ${hashtags.articleCount} - 1)` })
            .where(inArray(hashtags.id, removedIds));
        }
      }

      // 7. Atomic increment for added tags
      if (addedIds.length > 0) {
        if (contentType === 'post') {
          await tx
            .update(hashtags)
            .set({ postCount: sql`${hashtags.postCount} + 1` })
            .where(inArray(hashtags.id, addedIds));
        } else {
          await tx
            .update(hashtags)
            .set({ articleCount: sql`${hashtags.articleCount} + 1` })
            .where(inArray(hashtags.id, addedIds));
        }
      }
    });
  }

  /**
   * Get trending hashtags sorted by total count (post + article) descending.
   */
  async getTrending(limit: number): Promise<TrendingHashtagsResponse> {
    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const rows = await this.db
      .select({
        id: hashtags.id,
        tag: hashtags.tag,
        postCount: hashtags.postCount,
        articleCount: hashtags.articleCount,
      })
      .from(hashtags)
      .orderBy(desc(sql`${hashtags.postCount} + ${hashtags.articleCount}`))
      .limit(safeLimit);

    const items: HashtagItem[] = rows.map((row) => ({
      id: row.id,
      tag: row.tag,
      postCount: row.postCount,
      articleCount: row.articleCount,
    }));

    return { items };
  }

  /**
   * Get hashtag detail + timeline with mixed posts and articles.
   * Cursor-based pagination sorted by content createdAt descending.
   */
  async getHashtagTimeline(
    tagParam: string,
    cursor: string | null,
    limit: number,
  ): Promise<HashtagTimelineResponse> {
    const tagName = tagParam.toLowerCase();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const fetchLimit = safeLimit + 1;
    const cursorDate = cursor ? new Date(cursor) : null;

    // 1. Find the hashtag
    const hashtagRows = await this.db
      .select({
        id: hashtags.id,
        tag: hashtags.tag,
        postCount: hashtags.postCount,
        articleCount: hashtags.articleCount,
      })
      .from(hashtags)
      .where(eq(hashtags.tag, tagName))
      .limit(1);

    if (hashtagRows.length === 0) {
      throw new NotFoundException('Hashtag not found');
    }

    const hashtagRow = hashtagRows[0];
    const tagItem: HashtagItem = {
      id: hashtagRow.id,
      tag: hashtagRow.tag,
      postCount: hashtagRow.postCount,
      articleCount: hashtagRow.articleCount,
    };

    // 2. Get content_hashtags entries filtered by cursor (joined with posts/articles for createdAt)
    // Strategy: query post and article content_hashtags separately with their source tables
    // then merge and sort by createdAt

    const postAssocQuery = cursorDate
      ? this.db
          .select({
            contentId: contentHashtags.contentId,
            createdAt: posts.createdAt,
          })
          .from(contentHashtags)
          .innerJoin(posts, eq(contentHashtags.contentId, posts.id))
          .where(
            and(
              eq(contentHashtags.hashtagId, hashtagRow.id),
              eq(contentHashtags.contentType, 'post'),
              eq(posts.moderationStatus, 'approved'),
              lt(posts.createdAt, cursorDate),
            ),
          )
          .orderBy(desc(posts.createdAt))
          .limit(fetchLimit)
      : this.db
          .select({
            contentId: contentHashtags.contentId,
            createdAt: posts.createdAt,
          })
          .from(contentHashtags)
          .innerJoin(posts, eq(contentHashtags.contentId, posts.id))
          .where(
            and(
              eq(contentHashtags.hashtagId, hashtagRow.id),
              eq(contentHashtags.contentType, 'post'),
              eq(posts.moderationStatus, 'approved'),
            ),
          )
          .orderBy(desc(posts.createdAt))
          .limit(fetchLimit);

    const articleAssocQuery = cursorDate
      ? this.db
          .select({
            contentId: contentHashtags.contentId,
            createdAt: articles.createdAt,
          })
          .from(contentHashtags)
          .innerJoin(articles, eq(contentHashtags.contentId, articles.id))
          .where(
            and(
              eq(contentHashtags.hashtagId, hashtagRow.id),
              eq(contentHashtags.contentType, 'article'),
              eq(articles.status, 'published'),
              eq(articles.moderationStatus, 'approved'),
              lt(articles.createdAt, cursorDate),
            ),
          )
          .orderBy(desc(articles.createdAt))
          .limit(fetchLimit)
      : this.db
          .select({
            contentId: contentHashtags.contentId,
            createdAt: articles.createdAt,
          })
          .from(contentHashtags)
          .innerJoin(articles, eq(contentHashtags.contentId, articles.id))
          .where(
            and(
              eq(contentHashtags.hashtagId, hashtagRow.id),
              eq(contentHashtags.contentType, 'article'),
              eq(articles.status, 'published'),
              eq(articles.moderationStatus, 'approved'),
            ),
          )
          .orderBy(desc(articles.createdAt))
          .limit(fetchLimit);

    const [postAssocs, articleAssocs] = await Promise.all([
      postAssocQuery,
      articleAssocQuery,
    ]);

    // 3. Merge and sort
    const postItems = postAssocs.map((a) => ({
      type: 'post' as const,
      contentId: a.contentId,
      createdAt: a.createdAt,
    }));
    const articleItems = articleAssocs.map((a) => ({
      type: 'article' as const,
      contentId: a.contentId,
      createdAt: a.createdAt,
    }));

    const merged = [...postItems, ...articleItems].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const hasMore = merged.length > safeLimit;
    const pageItems = merged.slice(0, safeLimit);

    // 4. Fetch details for the current page
    const postIds = pageItems
      .filter((i) => i.type === 'post')
      .map((i) => i.contentId);
    const articleIds = pageItems
      .filter((i) => i.type === 'article')
      .map((i) => i.contentId);

    const [postRows, articleRows] = await Promise.all([
      postIds.length > 0
        ? this.db.select().from(posts).where(inArray(posts.id, postIds))
        : Promise.resolve([]),
      articleIds.length > 0
        ? this.db.select().from(articles).where(inArray(articles.id, articleIds))
        : Promise.resolve([]),
    ]);

    const postMap = new Map<string, typeof posts.$inferSelect>();
    for (const row of postRows) {
      postMap.set(row.id, row);
    }

    const articleMap = new Map<string, typeof articles.$inferSelect>();
    const authorIds = new Set<string>();

    for (const row of articleRows) {
      articleMap.set(row.id, row);
      authorIds.add(this.getAuthorId(row));
    }
    for (const row of postRows) {
      authorIds.add(this.getAuthorId(row));
      // Check if post has linked article and add that article's author too
      if (row.articleId) {
        const linkedArticleRow = articleRows.find((a) => a.id === row.articleId);
        if (linkedArticleRow) {
          authorIds.add(this.getAuthorId(linkedArticleRow));
        }
      }
    }

    // 5. Fetch linked articles for posts that reference them
    const linkedArticleIds = new Set<string>();
    for (const row of postRows) {
      if (row.articleId && !articleMap.has(row.articleId)) {
        linkedArticleIds.add(row.articleId);
      }
    }
    const linkedArticleIdArr = Array.from(linkedArticleIds);
    if (linkedArticleIdArr.length > 0) {
      const linkedArticles = await this.db
        .select()
        .from(articles)
        .where(inArray(articles.id, linkedArticleIdArr));
      for (const ar of linkedArticles) {
        articleMap.set(ar.id, ar);
        authorIds.add(this.getAuthorId(ar));
      }
    }

    // All article IDs we need image/attachment counts for
    const allArticleIds = new Set<string>([...articleIds, ...linkedArticleIds]);
    const allArticleIdArr = Array.from(allArticleIds);

    // 6. Fetch article image counts, attachment counts, and user nicknames
     const [imgCounts, attCounts, nameMap, avatarMap, roleMap] = await Promise.all([
       allArticleIdArr.length > 0
         ? this.countByArticle(articleImages, articleImages.articleId, allArticleIdArr)
         : Promise.resolve(new Map<string, number>()),
       allArticleIdArr.length > 0
         ? this.countByArticle(articleAttachments, articleAttachments.articleId, allArticleIdArr)
         : Promise.resolve(new Map<string, number>()),
       this.fetchUserNicknames(Array.from(authorIds)),
       this.fetchUserAvatars(Array.from(authorIds)),
       this.fetchUserRoles(Array.from(authorIds)),
     ]);

    // 7. Build timeline items
    const items: TimelineItem[] = pageItems.map((item) => {
      if (item.type === 'post') {
        const row = postMap.get(item.contentId);
        if (!row) {
          return null;
        }
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
         };
        return { type: 'post' as const, post: postItem };
      } else {
        const row = articleMap.get(item.contentId);
        if (!row) {
          return null;
        }
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
         };
        return { type: 'article' as const, article: articleSummary };
      }
    }).filter((item: TimelineItem | null): item is TimelineItem => item !== null);

    const nextCursor =
      hasMore && pageItems.length > 0
        ? pageItems[pageItems.length - 1].createdAt.toISOString()
        : null;

    return {
      tag: tagItem,
      items,
      nextCursor,
      hasMore,
    };
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
      this.logger.warn(
        `fetchUserAvatars failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      for (const id of uuidIds) {
        if (!avatarMap.has(id)) {
          avatarMap.set(id, null);
        }
      }
    }
    return avatarMap;
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
       this.logger.warn(
         `fetchUserRoles failed: ${err instanceof Error ? err.message : String(err)}`,
       );
       for (const id of uuidIds) {
         if (!roleMap.has(id)) {
           roleMap.set(id, 'user');
         }
       }
     }
     return roleMap;
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
      this.logger.warn(
        `fetchUserNicknames failed, falling back to id display: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
      .where(
        sql`${articleCol} IN ${sql`(${sql.join(
          articleIds.map((id: string) => sql`${id}`),
          sql`, `,
        )})`}`,
      )
      .groupBy(articleCol);

    const result: Map<string, number> = new Map<string, number>();
    for (const r of rows) {
      result.set(r.articleId, Number(r.count));
    }
    return result;
  }
}
