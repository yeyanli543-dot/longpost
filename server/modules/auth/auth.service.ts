import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import * as bcrypt from 'bcryptjs';
import { eq, and, desc, count, sum, inArray, ne, sql } from 'drizzle-orm';
import { appUsers, siteSettings, posts, articles, bookmarks } from '../../database/schema';
import type {
  AuthResponse,
  UserProfile,
  UpdatePreferencesRequest,
  UserPublicProfile,
  UserHomepageResponse,
  PostItem,
  ArticleSummary,
  BookmarkListResponse,
} from '@shared/api.interface';
import { authConfig } from '../../config/auth.config';
import { isOwnerEmail } from '../../config/owner.config';

export interface JwtPayload {
  sub: string;
  email: string;
  username?: string;
  role?: string;
  tokenVersion?: number;
}

const JWT_SECRET = authConfig.jwtSecret;
const JWT_EXPIRES_IN = authConfig.jwtExpiresIn;
const SITE_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string, nickname: string): Promise<AuthResponse> {
    const settings = await this.db
      .select({
        allowRegister: siteSettings.allowRegister,
        registrationMode: siteSettings.registrationMode,
      })
      .from(siteSettings)
      .where(eq(siteSettings.id, SITE_SETTINGS_ID))
      .limit(1);

    if (settings.length > 0) {
      if (!settings[0].allowRegister) {
        throw new BadRequestException('注册已关闭');
      }
      if (settings[0].registrationMode === 'google_only') {
        throw new BadRequestException('本站仅支持 Google 账号登录注册');
      }
    }

    const existing = await this.db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('该邮箱已被注册');
    }

    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length === 0) {
      throw new BadRequestException('昵称不能为空');
    }
    if (trimmedNickname.length > 50) {
      throw new BadRequestException('昵称最多 50 个字符');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [countRow] = await this.db
      .select({ count: count() })
      .from(appUsers);
    const isFirstUser = Number(countRow.count) === 0;
    const role = isFirstUser || isOwnerEmail(email) ? 'admin' : 'user';

    const [inserted] = await this.db
      .insert(appUsers)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        nickname: nickname.trim(),
        provider: 'email',
        role,
      })
      .returning({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        notifyOnRead: appUsers.notifyOnRead,
        notifyOnDelete: appUsers.notifyOnDelete,
        theme: appUsers.theme,
        fontSize: appUsers.fontSize,
        tokenVersion: appUsers.tokenVersion,
        createdAt: appUsers.createdAt,
      });

    if (!inserted) {
      throw new BadRequestException('注册失败');
    }

    const user = this.mapUser(inserted);
    const token = this.signToken(user.id, user.email, user.nickname, user.role, inserted.tokenVersion);

    await this.db
      .update(appUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(appUsers.id, user.id));

    return { token, user };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const rows = await this.db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        passwordHash: appUsers.passwordHash,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        notifyOnRead: appUsers.notifyOnRead,
        notifyOnDelete: appUsers.notifyOnDelete,
        theme: appUsers.theme,
        fontSize: appUsers.fontSize,
        isActive: appUsers.isActive,
        isBanned: appUsers.isBanned,
        tokenVersion: appUsers.tokenVersion,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(eq(appUsers.email, email.toLowerCase()))
      .limit(1);

    if (rows.length === 0) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const row = rows[0];
    if (!row.isActive) {
      throw new UnauthorizedException('账号已被停用');
    }
    if (row.isBanned) {
      throw new ForbiddenException('账号已被封禁');
    }

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const isOwner = await this.ensureOwnerRole(row.id, row.email);
    const user = this.mapUser(isOwner ? { ...row, role: 'admin' } : row);
    const token = this.signToken(user.id, user.email, user.nickname, user.role, row.tokenVersion);

    await this.db
      .update(appUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(appUsers.id, user.id));

    return { token, user };
  }

  async oauthLogin(userId: string, email: string, nickname?: string, role?: string): Promise<string> {
    const [user] = await this.db
      .update(appUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(appUsers.id, userId))
      .returning({ tokenVersion: appUsers.tokenVersion });
    return this.signToken(userId, email, nickname, role, user?.tokenVersion);
  }

  async getCurrentUser(userId: string): Promise<UserProfile> {
    const rows = await this.db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        notifyOnRead: appUsers.notifyOnRead,
        notifyOnDelete: appUsers.notifyOnDelete,
        theme: appUsers.theme,
        fontSize: appUsers.fontSize,
        isBanned: appUsers.isBanned,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(and(eq(appUsers.id, userId), eq(appUsers.isActive, true)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    const row = rows[0];
    if (row.isBanned) {
      throw new ForbiddenException('账号已被封禁');
    }
    const isOwner = await this.ensureOwnerRole(row.id, row.email);
    return this.mapUser(isOwner ? { ...row, role: 'admin' } : row);
  }

  async updateProfile(
    userId: string,
    data: { nickname?: string; avatarUrl?: string; bio?: string },
  ): Promise<UserProfile> {
    const patch: Partial<typeof appUsers.$inferInsert> = {};
    if (data.nickname !== undefined) {
      const trimmed = data.nickname.trim();
      if (trimmed.length === 0) throw new BadRequestException('昵称不能为空');
      if (trimmed.length > 50) throw new BadRequestException('昵称最多 50 个字符');
      patch.nickname = trimmed;
    }
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;
    if (data.bio !== undefined) patch.bio = data.bio;

    if (Object.keys(patch).length === 0) {
      return this.getCurrentUser(userId);
    }

    const [updated] = await this.db
      .update(appUsers)
      .set(patch)
      .where(eq(appUsers.id, userId))
      .returning({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        notifyOnRead: appUsers.notifyOnRead,
        notifyOnDelete: appUsers.notifyOnDelete,
        theme: appUsers.theme,
        fontSize: appUsers.fontSize,
        createdAt: appUsers.createdAt,
      });

    if (!updated) {
      throw new NotFoundException('用户不存在');
    }

    return this.mapUser(updated);
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const rows = await this.db
      .select({ passwordHash: appUsers.passwordHash })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    const valid = await bcrypt.compare(oldPassword, rows[0].passwordHash);
    if (!valid) {
      throw new UnauthorizedException('原密码错误');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db
      .update(appUsers)
      .set({
        passwordHash,
        tokenVersion: sql`${appUsers.tokenVersion} + 1`,
      })
      .where(eq(appUsers.id, userId));
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db
      .update(appUsers)
      .set({
        tokenVersion: sql`${appUsers.tokenVersion} + 1`,
      })
      .where(eq(appUsers.id, userId));
  }

  async updatePreferences(
    userId: string,
    data: UpdatePreferencesRequest,
  ): Promise<UserProfile> {
    const patch: Partial<typeof appUsers.$inferInsert> = {};
    if (data.notifyOnRead !== undefined) patch.notifyOnRead = data.notifyOnRead;
    if (data.notifyOnDelete !== undefined) patch.notifyOnDelete = data.notifyOnDelete;
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.fontSize !== undefined) patch.fontSize = data.fontSize;

    if (Object.keys(patch).length === 0) {
      return this.getCurrentUser(userId);
    }

    const [updated] = await this.db
      .update(appUsers)
      .set(patch)
      .where(eq(appUsers.id, userId))
      .returning({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        notifyOnRead: appUsers.notifyOnRead,
        notifyOnDelete: appUsers.notifyOnDelete,
        theme: appUsers.theme,
        fontSize: appUsers.fontSize,
        createdAt: appUsers.createdAt,
      });

    if (!updated) {
      throw new NotFoundException('用户不存在');
    }

    return this.mapUser(updated);
  }

  /**
   * 站长引导：如果该账号的邮箱命中 OWNER_EMAIL，就确保它的角色是 admin。
   * 返回该账号是否为站长。因为 login 与 getCurrentUser（每次 /api/auth/me）
   * 都会调用它，所以配置好 OWNER_EMAIL 后无需重新登录即可生效。
   */
  async ensureOwnerRole(userId: string, email: string): Promise<boolean> {
    if (!isOwnerEmail(email)) return false;
    await this.db
      .update(appUsers)
      .set({ role: 'admin' })
      .where(and(eq(appUsers.id, userId), ne(appUsers.role, 'admin')));
    return true;
  }

  async isAdmin(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ role: appUsers.role })
      .from(appUsers)
      .where(and(eq(appUsers.id, userId), eq(appUsers.isActive, true)))
      .limit(1);

    if (rows.length === 0) {
      return false;
    }

    return rows[0].role === 'admin';
  }

  async ensureAdmin(userId: string): Promise<void> {
    const admin = await this.isAdmin(userId);
    if (!admin) {
      throw new ForbiddenException('无管理员权限');
    }
  }

  async getPublicProfile(userId: string): Promise<UserPublicProfile> {
    const userRows = await this.db
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
       .where(and(eq(appUsers.id, userId), eq(appUsers.isActive, true)))
      .limit(1);

    if (userRows.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    const user = userRows[0];

    const [postCountRow] = await this.db
      .select({ count: count() })
      .from(posts)
      .where(and(eq(posts.appUserId, userId), eq(posts.moderationStatus, 'approved')));

    const [articleCountRow] = await this.db
      .select({ count: count() })
      .from(articles)
      .where(
        and(
          eq(articles.appUserId, userId),
          eq(articles.status, 'published'),
          eq(articles.moderationStatus, 'approved'),
        ),
      );

    const [postLikesRow] = await this.db
      .select({ total: sum(posts.likeCount) })
      .from(posts)
      .where(and(eq(posts.appUserId, userId), eq(posts.moderationStatus, 'approved')));

    const [articleLikesRow] = await this.db
      .select({ total: sum(articles.likeCount) })
      .from(articles)
      .where(
        and(
          eq(articles.appUserId, userId),
          eq(articles.status, 'published'),
          eq(articles.moderationStatus, 'approved'),
        ),
      );

    const postLikes = Number(postLikesRow.total) || 0;
    const articleLikes = Number(articleLikesRow.total) || 0;

    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role as 'admin' | 'editor' | 'user',
      createdAt: user.createdAt.toISOString(),
      postCount: Number(postCountRow.count) || 0,
      articleCount: Number(articleCountRow.count) || 0,
      likeCount: postLikes + articleLikes,
       followerCount: user.followerCount,
       followingCount: user.followingCount,
       isBanned: user.isBanned,
     };
  }

  async getUserHomepage(userId: string): Promise<UserHomepageResponse> {
    const profile = await this.getPublicProfile(userId);

     const userPosts = await this.db
       .select({
         id: posts.id,
         content: posts.content,
         articleId: posts.articleId,
         createdAt: posts.createdAt,
         likeCount: posts.likeCount,
         commentCount: posts.commentCount,
         repostCount: posts.repostCount,
         isPinned: posts.isPinned,
          isFeatured: posts.isFeatured,
          moderationStatus: posts.moderationStatus,
        })
       .from(posts)
      .where(and(eq(posts.appUserId, userId), eq(posts.moderationStatus, 'approved')))
      .orderBy(desc(posts.createdAt))
      .limit(20);

     const postItems: PostItem[] = userPosts.map((p: typeof userPosts[0]) => ({
       id: p.id,
       content: p.content,
       articleId: p.articleId ?? null,
       authorId: userId,
       authorName: profile.nickname,
       authorAvatarUrl: profile.avatarUrl,
       authorRole: profile.role,
       createdAt: p.createdAt.toISOString(),
       likeCount: p.likeCount,
       commentCount: p.commentCount,
       repostCount: p.repostCount,
       isPinned: p.isPinned,
       isFeatured: p.isFeatured,
       moderationStatus: p.moderationStatus,
       hashtags: [],
       mentions: [],
     }));

      const userArticles = await this.db
        .select({
          id: articles.id,
          slug: articles.slug,
          status: articles.status,
          title: articles.title,
          excerpt: articles.excerpt,
          coverUrl: articles.coverUrl,
          readCount: articles.readCount,
          createdAt: articles.createdAt,
          likeCount: articles.likeCount,
          commentCount: articles.commentCount,
          repostCount: articles.repostCount,
          bookmarkCount: articles.bookmarkCount,
           isPinned: articles.isPinned,
           isFeatured: articles.isFeatured,
           moderationStatus: articles.moderationStatus,
         })
       .from(articles)
      .where(
        and(
          eq(articles.appUserId, userId),
          eq(articles.status, 'published'),
          eq(articles.moderationStatus, 'approved'),
        ),
      )
      .orderBy(desc(articles.createdAt))
      .limit(20);

     const articleSummaries: ArticleSummary[] = userArticles.map(
       (a: typeof userArticles[0]) => ({
         id: a.id,
         slug: a.slug,
         status: a.status as 'published' | 'draft',
         title: a.title,
         excerpt: a.excerpt ?? null,
         coverUrl: a.coverUrl ?? null,
         readCount: a.readCount,
         authorId: userId,
         authorName: profile.nickname,
         authorAvatarUrl: profile.avatarUrl,
         authorRole: profile.role,
         createdAt: a.createdAt.toISOString(),
         imageCount: 0,
         attachmentCount: 0,
         likeCount: a.likeCount,
         commentCount: a.commentCount,
         repostCount: a.repostCount,
         bookmarkCount: a.bookmarkCount,
         isPinned: a.isPinned,
         isFeatured: a.isFeatured,
         moderationStatus: a.moderationStatus,
         hashtags: [],
       }),
     );

    return {
      profile,
      posts: postItems,
      articles: articleSummaries,
      reposts: [],
      likedPosts: [],
    };
  }

  async getMyBookmarks(userId: string): Promise<BookmarkListResponse> {
    const rows = await this.db
      .select({
        id: articles.id,
        slug: articles.slug,
        status: articles.status,
        title: articles.title,
        excerpt: articles.excerpt,
        coverUrl: articles.coverUrl,
        readCount: articles.readCount,
        author: articles.author,
        appUserId: articles.appUserId,
        articleCreatedAt: articles.createdAt,
        likeCount: articles.likeCount,
        commentCount: articles.commentCount,
        repostCount: articles.repostCount,
        bookmarkCount: articles.bookmarkCount,
        bookmarkCreatedAt: bookmarks.createdAt,
        moderationStatus: articles.moderationStatus,
      })
      .from(bookmarks)
      .innerJoin(articles, eq(bookmarks.articleId, articles.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt))
      .limit(50);

    // Collect unique author user IDs
    const authorUserIds = new Set<string>();
    for (const row of rows) {
      if (row.appUserId) {
        authorUserIds.add(row.appUserId);
      }
    }

    // Fetch author nicknames and avatars
    let authorMap = new Map<string, { nickname: string; avatarUrl: string | null }>();
    if (authorUserIds.size > 0) {
      const authorRows = await this.db
        .select({
          id: appUsers.id,
          nickname: appUsers.nickname,
          avatarUrl: appUsers.avatarUrl,
        })
        .from(appUsers)
        .where(inArray(appUsers.id, Array.from(authorUserIds)));
      for (const a of authorRows) {
        authorMap.set(a.id, { nickname: a.nickname, avatarUrl: a.avatarUrl });
      }
    }

     const items: ArticleSummary[] = rows.map((row: typeof rows[0]) => {
       const authorId = row.appUserId || row.author;
       const authorInfo = row.appUserId ? authorMap.get(row.appUserId) : undefined;
       const authorName = authorInfo
         ? authorInfo.nickname
         : row.appUserId
           ? row.appUserId.slice(0, 8)
           : row.author.slice(0, 8);
       const authorAvatarUrl = authorInfo ? authorInfo.avatarUrl : null;
        return {
          id: row.id,
          slug: row.slug,
          status: row.status as 'published' | 'draft',
          title: row.title,
          excerpt: row.excerpt ?? null,
          coverUrl: row.coverUrl ?? null,
          readCount: row.readCount,
          authorId,
          authorName,
          authorAvatarUrl,
          authorRole: 'user',
          createdAt: row.articleCreatedAt.toISOString(),
          imageCount: 0,
          attachmentCount: 0,
          likeCount: row.likeCount,
          commentCount: row.commentCount,
          repostCount: row.repostCount,
          bookmarkCount: row.bookmarkCount,
           isPinned: false,
           isFeatured: false,
           moderationStatus: row.moderationStatus,
           hashtags: [],
        };
     });

    return { items };
  }

  verifyToken(token: string): JwtPayload | null {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return payload;
    } catch {
      return null;
    }
  }

  signToken(
    userId: string,
    email: string,
    nickname?: string,
    role?: string,
    tokenVersion?: number,
  ): string {
    const payload: JwtPayload = { sub: userId, email };
    if (nickname) payload.username = nickname;
    if (role) payload.role = role;
    if (typeof tokenVersion === 'number') payload.tokenVersion = tokenVersion;
    return this.jwtService.sign(payload);
  }

  async validateUserActive(userId: string): Promise<{
    id: string;
    email: string;
    role: string;
    nickname: string;
    isActive: boolean;
    isBanned: boolean;
    tokenVersion: number;
  } | null> {
    const rows = await this.db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        role: appUsers.role,
        nickname: appUsers.nickname,
        isActive: appUsers.isActive,
        isBanned: appUsers.isBanned,
        tokenVersion: appUsers.tokenVersion,
      })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0];
  }

  private mapUser(row: {
    id: string;
    email: string;
    nickname: string;
    avatarUrl: string | null;
    provider: string;
    role: string;
    bio: string | null;
    notifyOnRead: boolean;
    notifyOnDelete: boolean;
    theme: string;
    fontSize: string;
    createdAt: Date;
  }): UserProfile {
    return {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      avatarUrl: row.avatarUrl,
      provider: row.provider,
      role: row.role as 'admin' | 'editor' | 'user',
      bio: row.bio,
      notifyOnRead: row.notifyOnRead,
      notifyOnDelete: row.notifyOnDelete,
      theme: row.theme as 'light' | 'dark' | 'system',
      fontSize: row.fontSize as 'small' | 'medium' | 'large',
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export { JWT_SECRET, JWT_EXPIRES_IN };
