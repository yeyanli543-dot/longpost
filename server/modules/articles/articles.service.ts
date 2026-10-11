import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@server/database/database.module';
import { articles, posts, articleImages, articleAttachments, appUsers, contentHashtags, hashtags } from '@server/database/schema';
import { eq, desc, sql, ilike, and, asc, count, inArray } from 'drizzle-orm';
import { UpdateArticleDto } from './dto/update-article.dto';
import { AuthService } from '../auth/auth.service';
import { HashtagsService } from '../hashtags/hashtags.service';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import type {
  ArticleSummary,
  ArticleDetail,
  PostItem,
  SearchResponse,
  UserArticlesResponse,
  CreateArticleResponse,
  ArticleImage,
  ArticleAttachment,
  AdminContentListResponse,
  HashtagItem,
  UserPublicProfile,
} from '@shared/api.interface';

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authService: AuthService,
    private readonly hashtagsService: HashtagsService,
    private readonly siteSettingsService: SiteSettingsService,
  ) {}

  private getAuthorId(row: { author: string; appUserId: string | null }): string {
    return row.appUserId ?? row.author;
  }

  private readonly SLUG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  private generateRandomSlug(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += this.SLUG_CHARS.charAt(Math.floor(Math.random() * this.SLUG_CHARS.length));
    }
    return result;
  }

  private async generateSlug(): Promise<string> {
    const maxRetries = 5;
    let length = 8;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const candidate = this.generateRandomSlug(length);
      const existing = await this.db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.slug, candidate))
        .limit(1);
      if (existing.length === 0) {
        return candidate;
      }
    }
    // Fallback: try 10-char length once
    const fallback = this.generateRandomSlug(10);
    const existing = await this.db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, fallback))
      .limit(1);
    if (existing.length === 0) {
      return fallback;
    }
    // Last resort: append timestamp suffix (extremely unlikely)
    return `${fallback}${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractExcerpt(content: string, maxLen = 150): string {
    const plain = this.stripHtml(content);
    if (plain.length <= maxLen) return plain;
    return plain.slice(0, maxLen);
  }

  private isUuid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  async create(
    title: string,
    content: string,
    excerpt: string | undefined,
    authorId: string,
    images?: Array<{ imageUrl: string; sortOrder: number }>,
    attachments?: Array<{ fileName: string; fileUrl: string; fileSize?: number; fileType?: string; sortOrder: number }>,
    coverUrl?: string,
    status?: 'published' | 'draft',
  ): Promise<CreateArticleResponse> {
    const slug = await this.generateSlug();
    const finalExcerpt = excerpt && excerpt.trim().length > 0
      ? excerpt
      : this.extractExcerpt(content);
    const finalStatus = status ?? 'published';

    const result = await this.db.transaction(async (tx) => {
      const isAdmin = await this.authService.isAdmin(authorId);
      const settings = await this.siteSettingsService.getSettings();
      const moderationStatus: string = !isAdmin && settings.contentModerationEnabled
        ? 'pending_moderation'
        : 'approved';

      const rows = await tx
        .insert(articles)
        .values({
          title,
          content,
          excerpt: finalExcerpt,
          coverUrl: coverUrl ?? null,
          slug,
          status: finalStatus,
          author: authorId,
          appUserId: authorId,
          moderationStatus,
        })
        .returning({ id: articles.id, slug: articles.slug });

      const articleId: string = rows[0].id;

      if (images && images.length > 0) {
        const imageRows = images.map((img) => ({
          articleId,
          imageUrl: img.imageUrl,
          sortOrder: img.sortOrder,
        }));
        await tx.insert(articleImages).values(imageRows);
      }

      if (attachments && attachments.length > 0) {
        const attachmentRows = attachments.map((att) => ({
          articleId,
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          fileSize: att.fileSize ?? null,
          fileType: att.fileType ?? null,
          sortOrder: att.sortOrder,
        }));
        await tx.insert(articleAttachments).values(attachmentRows);
      }

      return { id: articleId, slug: rows[0].slug ?? slug };
    });

    // Sync hashtags outside transaction
    await this.hashtagsService.syncContentHashtags('article', result.id, content);

    return result;
  }

  async getDetail(idOrSlug: string): Promise<ArticleDetail> {
    const bySlug = !this.isUuid(idOrSlug);

    // Atomic increment read_count
    const whereCondition = bySlug
      ? and(eq(articles.slug, idOrSlug), eq(articles.moderationStatus, 'approved'), eq(articles.status, 'published'))
      : and(eq(articles.id, idOrSlug), eq(articles.moderationStatus, 'approved'), eq(articles.status, 'published'));

    const updated = await this.db
      .update(articles)
      .set({ readCount: sql`${articles.readCount} + 1` })
      .where(whereCondition)
      .returning({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        content: articles.content,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        readCount: articles.readCount,
        likeCount: articles.likeCount,
        commentCount: articles.commentCount,
        repostCount: articles.repostCount,
         bookmarkCount: articles.bookmarkCount,
         isPinned: articles.isPinned,
         isFeatured: articles.isFeatured,
         moderationStatus: articles.moderationStatus,
         status: articles.status,
         author: articles.author,
         appUserId: articles.appUserId,
         createdAt: articles.createdAt,
       });

     if (updated.length === 0) {
       throw new NotFoundException('文章不存在');
     }

     const articleId: string = updated[0].id;

    const article = updated[0];
    const authorId: string = this.getAuthorId(article);

    // Get linked posts (posts that reference this article)
     const linkedPostRows = await this.db
       .select({
         id: posts.id,
         content: posts.content,
         articleId: posts.articleId,
         likeCount: posts.likeCount,
         commentCount: posts.commentCount,
         repostCount: posts.repostCount,
         isPinned: posts.isPinned,
         isFeatured: posts.isFeatured,
         moderationStatus: posts.moderationStatus,
         author: posts.author,
       appUserId: posts.appUserId,
       createdAt: posts.createdAt,
     })
   .from(posts)
   .where(eq(posts.articleId, articleId))
       .orderBy(desc(posts.createdAt));

    // Collect all unique user IDs for batch lookup
    const userIds: Set<string> = new Set<string>();
    userIds.add(authorId);
    for (const p of linkedPostRows) {
      userIds.add(this.getAuthorId(p));
    }

     const userIdsArr: string[] = [...userIds];
     const [nameMap, avatarMap, roleMap] = await Promise.all([
       this.fetchUserNicknames(userIdsArr),
       this.fetchUserAvatars(userIdsArr),
       this.fetchUserRoles(userIdsArr),
     ]);

    const linkedPostIds = linkedPostRows.map((p) => p.id);
    const [linkedPostHashtags, imageRows, attachmentRows, articleHashtags, authorAvatarUrl] = await Promise.all([
      linkedPostIds.length > 0
        ? this.fetchContentHashtags('post', linkedPostIds)
        : Promise.resolve(new Map<string, string[]>()),
       this.db
         .select({
           id: articleImages.id,
           imageUrl: articleImages.imageUrl,
           sortOrder: articleImages.sortOrder,
         })
         .from(articleImages)
         .where(eq(articleImages.articleId, articleId))
         .orderBy(asc(articleImages.sortOrder), asc(articleImages.id)),
       this.db
         .select({
           id: articleAttachments.id,
           fileName: articleAttachments.fileName,
           fileUrl: articleAttachments.fileUrl,
           fileSize: articleAttachments.fileSize,
           fileType: articleAttachments.fileType,
           sortOrder: articleAttachments.sortOrder,
         })
         .from(articleAttachments)
         .where(eq(articleAttachments.articleId, articleId))
         .orderBy(asc(articleAttachments.sortOrder), asc(articleAttachments.id)),
       this.fetchContentHashtags('article', [articleId]).then((m) => m.get(articleId) ?? []),
      Promise.resolve(avatarMap.get(authorId) ?? null),
    ]);

     const linkedPosts: PostItem[] = linkedPostRows.map((p) => {
       const pid: string = this.getAuthorId(p);
       return {
         id: p.id,
         content: p.content,
         articleId: p.articleId ?? null,
         likeCount: p.likeCount,
         commentCount: p.commentCount,
         repostCount: p.repostCount,
       isPinned: p.isPinned,
       isFeatured: p.isFeatured,
       moderationStatus: p.moderationStatus,
       authorId: pid,
         authorName: nameMap.get(pid) ?? pid,
         authorAvatarUrl: avatarMap.get(pid) ?? null,
         authorRole: roleMap.get(pid) ?? 'user',
         createdAt: p.createdAt.toISOString(),
         hashtags: linkedPostHashtags.get(p.id) ?? [],
       };
     });

    const images: ArticleImage[] = imageRows.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      sortOrder: img.sortOrder,
    }));

    const attachments: ArticleAttachment[] = attachmentRows.map((att) => ({
      id: att.id,
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      fileSize: att.fileSize,
      fileType: att.fileType,
      sortOrder: att.sortOrder,
    }));

    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      coverUrl: article.coverUrl,
      readCount: article.readCount,
       likeCount: article.likeCount,
       commentCount: article.commentCount,
       repostCount: article.repostCount,
       bookmarkCount: article.bookmarkCount,
       isPinned: article.isPinned,
       isFeatured: article.isFeatured,
       moderationStatus: article.moderationStatus,
       status: (article.status as 'published' | 'draft') ?? 'published',
       authorId,
       authorName: nameMap.get(authorId) ?? authorId,
       authorAvatarUrl,
       authorRole: roleMap.get(authorId) ?? 'user',
       createdAt: article.createdAt.toISOString(),
      linkedPosts,
      images,
      attachments,
      hashtags: articleHashtags,
    };
  }

  async getList(authorId?: string): Promise<{ items: ArticleSummary[] }> {
    const conditions = [];
    if (authorId) {
      conditions.push(eq(articles.appUserId, authorId));
    } else {
      conditions.push(eq(articles.moderationStatus, 'approved'));
      conditions.push(eq(articles.status, 'published'));
    }

     const baseSelect = {
       id: articles.id,
       slug: articles.slug,
       title: articles.title,
       excerpt: articles.excerpt,
       coverUrl: articles.coverUrl,
       readCount: articles.readCount,
       likeCount: articles.likeCount,
       commentCount: articles.commentCount,
       repostCount: articles.repostCount,
       bookmarkCount: articles.bookmarkCount,
       isPinned: articles.isPinned,
       isFeatured: articles.isFeatured,
       moderationStatus: articles.moderationStatus,
       status: articles.status,
       author: articles.author,
       appUserId: articles.appUserId,
       createdAt: articles.createdAt,
     };

    const query = conditions.length > 0
      ? this.db
          .select(baseSelect)
          .from(articles)
          .where(and(...conditions))
          .orderBy(desc(articles.isPinned), desc(articles.pinnedAt), desc(articles.createdAt))
      : this.db
          .select(baseSelect)
          .from(articles)
          .orderBy(desc(articles.isPinned), desc(articles.pinnedAt), desc(articles.createdAt));

    const rows = await query;

    if (rows.length === 0) {
      return { items: [] };
    }

    const items: ArticleSummary[] = await this.buildSummaryList(rows);

    return { items };
  }

  private async buildSummaryList(
    rows: Array<{
      id: string;
      slug: string | null;
      title: string;
      excerpt: string | null;
      coverUrl: string | null;
      readCount: number;
      likeCount: number;
      commentCount: number;
      repostCount: number;
      bookmarkCount: number;
       isPinned: boolean;
       isFeatured: boolean;
       moderationStatus: string;
       status: string;
       author: string;
      appUserId: string | null;
      createdAt: Date;
    }>,
  ): Promise<ArticleSummary[]> {
    if (rows.length === 0) return [];

    const articleIds: string[] = rows.map((r) => r.id);
    const authorIds = [...new Set(rows.map((r) => this.getAuthorId(r)))];
     const [imgCounts, attCounts, nameMap, hashtagsMap, avatarMap, roleMap] = await Promise.all([
       this.countByArticle(articleImages, articleImages.articleId, articleIds),
       this.countByArticle(articleAttachments, articleAttachments.articleId, articleIds),
       this.fetchUserNicknames(authorIds),
       this.fetchContentHashtags('article', articleIds),
       this.fetchUserAvatars(authorIds),
       this.fetchUserRoles(authorIds),
     ]);

     return rows.map((r) => {
       const aid: string = this.getAuthorId(r);
       return {
         id: r.id,
         slug: r.slug,
         title: r.title,
         excerpt: r.excerpt,
         coverUrl: r.coverUrl,
         readCount: r.readCount,
         likeCount: r.likeCount,
         commentCount: r.commentCount,
         repostCount: r.repostCount,
         bookmarkCount: r.bookmarkCount,
          isPinned: r.isPinned,
          isFeatured: r.isFeatured,
          moderationStatus: r.moderationStatus,
          status: (r.status as 'published' | 'draft') ?? 'published',
          authorId: aid,
         authorName: nameMap.get(aid) ?? '',
         authorAvatarUrl: avatarMap.get(aid) ?? null,
         authorRole: roleMap.get(aid) ?? 'user',
         createdAt: r.createdAt.toISOString(),
         imageCount: imgCounts.get(r.id) ?? 0,
         attachmentCount: attCounts.get(r.id) ?? 0,
         hashtags: hashtagsMap.get(r.id) ?? [],
       };
     });
  }

  private async countByArticle<T extends { articleId: string }>(
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

  async getUserArticles(userId: string): Promise<UserArticlesResponse> {
    const rows = await this.db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        readCount: articles.readCount,
        likeCount: articles.likeCount,
        commentCount: articles.commentCount,
        repostCount: articles.repostCount,
        bookmarkCount: articles.bookmarkCount,
         isPinned: articles.isPinned,
         isFeatured: articles.isFeatured,
         moderationStatus: articles.moderationStatus,
         status: articles.status,
         author: articles.author,
         appUserId: articles.appUserId,
         createdAt: articles.createdAt,
       })
       .from(articles)
       .where(eq(articles.appUserId, userId))
       .orderBy(desc(articles.isPinned), desc(articles.pinnedAt), desc(articles.createdAt));

    if (rows.length === 0) {
      return { items: [] };
    }

    const userArticleItems: ArticleSummary[] = await this.buildSummaryList(rows);

    return { items: userArticleItems };
  }

  async search(
    q: string,
    type: 'all' | 'posts' | 'articles' | 'users' | 'hashtags' = 'all',
    page = 1,
    pageSize = 20,
  ): Promise<SearchResponse> {
    const keyword = `%${q}%`;
    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 50);
    const offset = (safePage - 1) * safePageSize;

    const includePosts = type === 'all' || type === 'posts';
    const includeArticles = type === 'all' || type === 'articles';
    const includeUsers = type === 'all' || type === 'users';
    const includeHashtags = type === 'all' || type === 'hashtags';

    const articleQuery = includeArticles
      ? this.db
          .select({
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
            excerpt: articles.excerpt,
            coverUrl: articles.coverUrl,
            readCount: articles.readCount,
            likeCount: articles.likeCount,
            commentCount: articles.commentCount,
            repostCount: articles.repostCount,
             bookmarkCount: articles.bookmarkCount,
             isPinned: articles.isPinned,
             isFeatured: articles.isFeatured,
             moderationStatus: articles.moderationStatus,
             status: articles.status,
             author: articles.author,
             appUserId: articles.appUserId,
             createdAt: articles.createdAt,
           })
           .from(articles)
           .where(
             and(
               sql`(${articles.title} ILIKE ${keyword} OR ${articles.content} ILIKE ${keyword})`,
               eq(articles.status, 'published'),
             ),
           )
          .orderBy(desc(articles.createdAt))
          .limit(safePageSize)
          .offset(offset)
      : Promise.resolve([]);

    const postQuery = includePosts
      ? this.db
          .select({
            id: posts.id,
            content: posts.content,
            articleId: posts.articleId,
            likeCount: posts.likeCount,
            commentCount: posts.commentCount,
       repostCount: posts.repostCount,
         isPinned: posts.isPinned,
         isFeatured: posts.isFeatured,
         author: posts.author,
         appUserId: posts.appUserId,
         createdAt: posts.createdAt,
       })
       .from(posts)
       .where(ilike(posts.content, keyword))
          .orderBy(desc(posts.createdAt))
          .limit(safePageSize)
          .offset(offset)
      : Promise.resolve([]);

    const userQuery = includeUsers
      ? this.db
          .select({
             id: appUsers.id,
             nickname: appUsers.nickname,
             avatarUrl: appUsers.avatarUrl,
             bio: appUsers.bio,
             role: appUsers.role,
             isBanned: appUsers.isBanned,
             createdAt: appUsers.createdAt,
             followerCount: appUsers.followerCount,
             followingCount: appUsers.followingCount,
          })
          .from(appUsers)
          .where(ilike(appUsers.nickname, keyword))
          .orderBy(desc(appUsers.followerCount))
          .limit(safePageSize)
          .offset(offset)
      : Promise.resolve([]);

    const hashtagQuery = includeHashtags
      ? this.db
          .select({
            id: hashtags.id,
            tag: hashtags.tag,
            postCount: hashtags.postCount,
            articleCount: hashtags.articleCount,
          })
          .from(hashtags)
          .where(ilike(hashtags.tag, keyword))
          .orderBy(desc(sql`${hashtags.postCount} + ${hashtags.articleCount}`))
          .limit(safePageSize)
          .offset(offset)
      : Promise.resolve([]);

    const [articleRows, postRows, userRows, hashtagRows] = await Promise.all([
      articleQuery,
      postQuery,
      userQuery,
      hashtagQuery,
    ]);

    // Collect all unique user IDs
    const userIds: Set<string> = new Set<string>();
    for (const a of articleRows) userIds.add(this.getAuthorId(a));
    for (const p of postRows) userIds.add(this.getAuthorId(p));

       let nameMap: Map<string, string> = new Map<string, string>();
     let avatarMap: Map<string, string | null> = new Map<string, string | null>();
     let roleMap: Map<string, string> = new Map<string, string>();
     if (userIds.size > 0) {
       const userIdsArr: string[] = [...userIds];
       [nameMap, avatarMap, roleMap] = await Promise.all([
         this.fetchUserNicknames(userIdsArr),
         this.fetchUserAvatars(userIdsArr),
         this.fetchUserRoles(userIdsArr),
       ]);
     }

    const articlesList: ArticleSummary[] = await this.buildSummaryList(articleRows);

    const postIds = postRows.map((r) => r.id);
    const postHashtags = postIds.length > 0
      ? await this.fetchContentHashtags('post', postIds)
      : new Map<string, string[]>();

    const postsList: PostItem[] = postRows.map((r) => {
      const pid: string = this.getAuthorId(r);
      return {
        id: r.id,
        content: r.content,
        articleId: r.articleId ?? null,
        likeCount: r.likeCount,
        commentCount: r.commentCount,
        repostCount: r.repostCount,
        isPinned: r.isPinned,
        isFeatured: r.isFeatured,
        moderationStatus: r.moderationStatus,
        authorId: pid,
        authorName: nameMap.get(pid) ?? '',
        authorAvatarUrl: avatarMap.get(pid) ?? null,
        authorRole: roleMap.get(pid) ?? 'user',
        createdAt: r.createdAt.toISOString(),
        hashtags: postHashtags.get(r.id) ?? [],
      };
    });

    const usersList: UserPublicProfile[] = userRows.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl ?? null,
      bio: u.bio ?? null,
      role: (u.role as 'admin' | 'user') ?? 'user',
      createdAt: u.createdAt.toISOString(),
      postCount: 0,
      articleCount: 0,
      likeCount: 0,
             isBanned: u.isBanned,
       followerCount: u.followerCount ?? 0,
       followingCount: u.followingCount ?? 0,
     }));

    const hashtagsList: HashtagItem[] = hashtagRows.map((h) => ({
      id: h.id,
      tag: h.tag,
      postCount: h.postCount,
      articleCount: h.articleCount,
    }));

    return {
      posts: postsList,
      articles: articlesList,
      users: usersList,
      hashtags: hashtagsList,
    };
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

  private async fetchUserAvatar(userId: string): Promise<string | null> {
    const map = await this.fetchUserAvatars([userId]);
    return map.get(userId) ?? null;
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

  async update(id: string, userId: string, data: UpdateArticleDto): Promise<void> {
    // Check existence and ownership
    const existing = await this.db
      .select({
        id: articles.id,
        appUserId: articles.appUserId,
      })
      .from(articles)
      .where(eq(articles.id, id));

    if (existing.length === 0) {
      throw new NotFoundException('文章不存在');
    }

    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin && existing[0].appUserId !== userId) {
      throw new ForbiddenException('无权修改他人的文章');
    }

    const hasContentFields =
      data.title !== undefined ||
      data.content !== undefined ||
      data.excerpt !== undefined ||
      data.coverUrl !== undefined ||
      data.status !== undefined;
    const hasAssetFields = data.images !== undefined || data.attachments !== undefined;

    if (!hasContentFields && !hasAssetFields) {
      throw new BadRequestException('未提供可更新字段');
    }

    await this.db.transaction(async (tx) => {
      if (hasContentFields) {
        const patch: Partial<typeof articles.$inferInsert> = {};
        if (data.title !== undefined) patch.title = data.title;
        if (data.content !== undefined) patch.content = data.content;
        if (data.excerpt !== undefined) {
          patch.excerpt = data.excerpt ?? null;
        } else if (data.content !== undefined) {
          // Auto-generate excerpt from content when content updates and no explicit excerpt provided
          patch.excerpt = this.extractExcerpt(data.content);
        }
        if (data.coverUrl !== undefined) patch.coverUrl = data.coverUrl ?? null;
        if (data.status !== undefined) patch.status = data.status;
        await tx.update(articles).set(patch).where(eq(articles.id, id));
      }

      if (data.images !== undefined) {
        await tx.delete(articleImages).where(eq(articleImages.articleId, id));
        if (data.images.length > 0) {
          const imageRows = data.images.map((img) => ({
            articleId: id,
            imageUrl: img.imageUrl,
            sortOrder: img.sortOrder,
          }));
          await tx.insert(articleImages).values(imageRows);
        }
      }

      if (data.attachments !== undefined) {
        await tx.delete(articleAttachments).where(eq(articleAttachments.articleId, id));
        if (data.attachments.length > 0) {
          const attachmentRows = data.attachments.map((att) => ({
            articleId: id,
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            fileSize: att.fileSize ?? null,
            fileType: att.fileType ?? null,
            sortOrder: att.sortOrder,
          }));
          await tx.insert(articleAttachments).values(attachmentRows);
        }
      }
    });

    // Sync hashtags if content changed
    if (data.content !== undefined) {
      await this.hashtagsService.syncContentHashtags('article', id, data.content);
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    // First, check existence and ownership
    const existing = await this.db
      .select({
        id: articles.id,
        appUserId: articles.appUserId,
      })
      .from(articles)
      .where(eq(articles.id, id));

    if (existing.length === 0) {
      throw new NotFoundException('文章不存在');
    }

    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin && existing[0].appUserId !== userId) {
      throw new ForbiddenException('无权删除他人的文章');
    }

    await this.db.delete(articles).where(eq(articles.id, id));
  }

  async getAdminContent(
    type: 'post' | 'article' | 'all',
    q?: string,
  ): Promise<AdminContentListResponse> {
    const keyword = q ? `%${q}%` : null;

    const includePosts = type === 'all' || type === 'post';
    const includeArticles = type === 'all' || type === 'article';

     const postBaseSelect = {
       id: posts.id,
       content: posts.content,
       articleId: posts.articleId,
       likeCount: posts.likeCount,
       commentCount: posts.commentCount,
       repostCount: posts.repostCount,
       isPinned: posts.isPinned,
       isFeatured: posts.isFeatured,
       author: posts.author,
       appUserId: posts.appUserId,
       createdAt: posts.createdAt,
     };

      const articleBaseSelect = {
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        readCount: articles.readCount,
        likeCount: articles.likeCount,
        commentCount: articles.commentCount,
        repostCount: articles.repostCount,
        bookmarkCount: articles.bookmarkCount,
        isPinned: articles.isPinned,
        isFeatured: articles.isFeatured,
        moderationStatus: articles.moderationStatus,
        status: articles.status,
        author: articles.author,
       appUserId: articles.appUserId,
       createdAt: articles.createdAt,
     };

    const postConditions = [];
    const articleConditions = [];
    if (keyword) {
      postConditions.push(ilike(posts.content, keyword));
      articleConditions.push(ilike(articles.title, keyword));
    }

    const postQuery = includePosts
      ? this.db
          .select(postBaseSelect)
          .from(posts)
          .where(postConditions.length > 0 ? and(...postConditions) : undefined)
          .orderBy(desc(posts.createdAt))
          .limit(50)
      : Promise.resolve([]);

    const articleQuery = includeArticles
      ? this.db
          .select(articleBaseSelect)
          .from(articles)
          .where(articleConditions.length > 0 ? and(...articleConditions) : undefined)
          .orderBy(desc(articles.createdAt))
          .limit(50)
      : Promise.resolve([]);

    const postCountQuery = includePosts
      ? this.db
          .select({ count: count() })
          .from(posts)
          .where(postConditions.length > 0 ? and(...postConditions) : undefined)
      : Promise.resolve([{ count: 0 }]);

    const articleCountQuery = includeArticles
      ? this.db
          .select({ count: count() })
          .from(articles)
          .where(articleConditions.length > 0 ? and(...articleConditions) : undefined)
      : Promise.resolve([{ count: 0 }]);

    const [postRows, articleRows, postCountResult, articleCountResult] = await Promise.all([
      postQuery,
      articleQuery,
      postCountQuery,
      articleCountQuery,
    ]);

    const totalPosts = postCountResult[0]?.count ?? 0;
    const totalArticles = articleCountResult[0]?.count ?? 0;

    const userIds: Set<string> = new Set<string>();
    for (const p of postRows) userIds.add(this.getAuthorId(p));
    for (const a of articleRows) userIds.add(this.getAuthorId(a));

    const articleIdArr = articleRows.map((r) => r.id);
    const postIdArr = postRows.map((r) => r.id);

     const [nameMap, avatarMap, roleMap, imgCounts, attCounts, postHashtags, articleHashtags] = await Promise.all([
       this.fetchUserNicknames([...userIds]),
       this.fetchUserAvatars([...userIds]),
       this.fetchUserRoles([...userIds]),
       articleIdArr.length > 0
        ? this.countByArticle(articleImages, articleImages.articleId, articleIdArr)
        : Promise.resolve(new Map<string, number>()),
      articleIdArr.length > 0
        ? this.countByArticle(articleAttachments, articleAttachments.articleId, articleIdArr)
        : Promise.resolve(new Map<string, number>()),
      postIdArr.length > 0
        ? this.fetchContentHashtags('post', postIdArr)
        : Promise.resolve(new Map<string, string[]>()),
      articleIdArr.length > 0
        ? this.fetchContentHashtags('article', articleIdArr)
        : Promise.resolve(new Map<string, string[]>()),
    ]);

     const postsList: PostItem[] = postRows.map((r) => {
       const pid: string = this.getAuthorId(r);
       return {
         id: r.id,
         content: r.content,
         articleId: r.articleId ?? null,
         likeCount: r.likeCount,
         commentCount: r.commentCount,
         repostCount: r.repostCount,
         isPinned: r.isPinned,
         isFeatured: r.isFeatured,
         moderationStatus: r.moderationStatus,
         authorId: pid,
         authorName: nameMap.get(pid) ?? '',
         authorAvatarUrl: avatarMap.get(pid) ?? null,
         authorRole: roleMap.get(pid) ?? 'user',
         createdAt: r.createdAt.toISOString(),
         hashtags: postHashtags.get(r.id) ?? [],
       };
     });

     const articlesList: ArticleSummary[] = articleRows.map((r) => {
       const aid: string = this.getAuthorId(r);
       return {
         id: r.id,
         slug: r.slug,
         title: r.title,
         excerpt: r.excerpt,
         coverUrl: r.coverUrl,
         readCount: r.readCount,
         likeCount: r.likeCount,
         commentCount: r.commentCount,
         repostCount: r.repostCount,
         bookmarkCount: r.bookmarkCount,
          isPinned: r.isPinned,
          isFeatured: r.isFeatured,
          moderationStatus: r.moderationStatus,
          status: (r.status as 'published' | 'draft') ?? 'published',
          authorId: aid,
         authorName: nameMap.get(aid) ?? '',
         authorAvatarUrl: avatarMap.get(aid) ?? null,
         authorRole: roleMap.get(aid) ?? 'user',
         createdAt: r.createdAt.toISOString(),
         imageCount: imgCounts.get(r.id) ?? 0,
         attachmentCount: attCounts.get(r.id) ?? 0,
         hashtags: articleHashtags.get(r.id) ?? [],
       };
     });

     return {
       posts: postsList,
       articles: articlesList,
       totalPosts: Number(totalPosts),
       totalArticles: Number(totalArticles),
     };
   }

  async getOgBySlug(slug: string): Promise<{ title: string; excerpt: string | null; coverUrl: string | null; authorName: string } | null> {
    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        appUserId: articles.appUserId,
      })
      .from(articles)
      .where(and(
        eq(articles.slug, slug),
        eq(articles.status, 'published'),
        eq(articles.moderationStatus, 'approved'),
      ))
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

    let authorName = '';
    if (article.appUserId) {
      const authorRows = await this.db
        .select({ nickname: appUsers.nickname })
        .from(appUsers)
        .where(eq(appUsers.id, article.appUserId))
        .limit(1);
      if (authorRows.length > 0) {
        authorName = authorRows[0].nickname;
      }
    }

    return {
      title: article.title,
      excerpt: article.excerpt,
      coverUrl: finalCoverUrl,
      authorName,
    };
  }

  async getArticleForOg(slugOrId: string): Promise<ArticleOgData | null> {
    const bySlug = !this.isUuid(slugOrId);
    const whereCondition = bySlug
      ? and(eq(articles.slug, slugOrId), eq(articles.status, 'published'), eq(articles.moderationStatus, 'approved'))
      : and(eq(articles.id, slugOrId), eq(articles.status, 'published'), eq(articles.moderationStatus, 'approved'));

    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        appUserId: articles.appUserId,
      })
      .from(articles)
      .where(whereCondition)
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

    let authorName = '';
    if (article.appUserId) {
      const authorRows = await this.db
        .select({ nickname: appUsers.nickname })
        .from(appUsers)
        .where(eq(appUsers.id, article.appUserId))
        .limit(1);
      if (authorRows.length > 0) {
        authorName = authorRows[0].nickname;
      }
    }

    return {
      title: article.title,
      excerpt: article.excerpt,
      coverUrl: finalCoverUrl,
      authorName,
    };
  }
}

export interface ArticleOgData {
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  authorName: string;
}
