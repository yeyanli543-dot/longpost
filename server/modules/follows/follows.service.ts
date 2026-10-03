import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { follows, appUsers } from '@server/database/schema';
import { eq, and, lt, sql, desc, or } from 'drizzle-orm';
import type {
  FollowUserResponse,
  FollowListResponse,
  UserPublicProfile,
  UserRole,
} from '@shared/api.interface';

function extractPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string') return code;
    current = cause;
  }
  return undefined;
}

function parseCursor(cursor: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const colonIdx = cursor.lastIndexOf(':');
  if (colonIdx === -1) return null;
  const createdAtStr = cursor.slice(0, colonIdx);
  const id = cursor.slice(colonIdx + 1);
  const date = new Date(createdAtStr);
  if (Number.isNaN(date.getTime())) return null;
  return { createdAt: date, id };
}

function mapUserProfile(row: {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  isBanned: boolean;
  createdAt: Date;
  followerCount: number;
  followingCount: number;
}): UserPublicProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl ?? null,
    bio: row.bio ?? null,
    role: row.role as UserRole,
    createdAt: row.createdAt.toISOString(),
    postCount: 0,
    articleCount: 0,
    likeCount: 0,
    followerCount: Number(row.followerCount),
    followingCount: Number(row.followingCount),
    isBanned: row.isBanned,
  };
}

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async toggleFollow(followerId: string, followingId: string): Promise<FollowUserResponse> {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const targetRows = await this.db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.id, followingId))
      .limit(1);
    if (targetRows.length === 0) {
      throw new NotFoundException('User not found');
    }

    try {
      return await this.db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: follows.id })
          .from(follows)
          .where(
            and(
              eq(follows.followerId, followerId),
              eq(follows.followingId, followingId),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await tx.delete(follows).where(eq(follows.id, existing[0].id));
          await tx
            .update(appUsers)
            .set({ followerCount: sql`${appUsers.followerCount} - 1` })
            .where(eq(appUsers.id, followingId));
          await tx
            .update(appUsers)
            .set({ followingCount: sql`${appUsers.followingCount} - 1` })
            .where(eq(appUsers.id, followerId));

          const updated = await tx
            .select({ followerCount: appUsers.followerCount })
            .from(appUsers)
            .where(eq(appUsers.id, followingId))
            .limit(1);

          return {
            following: false,
            followerCount: Number(updated[0]?.followerCount ?? 0),
          };
        } else {
          await tx.insert(follows).values({
            followerId,
            followingId,
          });
          await tx
            .update(appUsers)
            .set({ followerCount: sql`${appUsers.followerCount} + 1` })
            .where(eq(appUsers.id, followingId));
          await tx
            .update(appUsers)
            .set({ followingCount: sql`${appUsers.followingCount} + 1` })
            .where(eq(appUsers.id, followerId));

          const updated = await tx
            .select({ followerCount: appUsers.followerCount })
            .from(appUsers)
            .where(eq(appUsers.id, followingId))
            .limit(1);

          return {
            following: true,
            followerCount: Number(updated[0]?.followerCount ?? 0),
          };
        }
      });
    } catch (error) {
      const code = extractPostgresErrorCode(error);
      if (code === '23505') {
        this.logger.warn('Follow record already exists (race condition)');
        const target = await this.db
          .select({ followerCount: appUsers.followerCount })
          .from(appUsers)
          .where(eq(appUsers.id, followingId))
          .limit(1);
        return {
          following: true,
          followerCount: Number(target[0]?.followerCount ?? 0),
        };
      }
      throw error;
    }
  }

  async getFollowing(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<FollowListResponse> {
    const userRows = await this.db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (userRows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const fetchLimit = limit + 1;
    const cursorData = parseCursor(cursor);

    const conditions = [eq(follows.followerId, userId)];
    if (cursorData) {
      conditions.push(
        or(
          lt(follows.createdAt, cursorData.createdAt),
          and(
            sql`${follows.createdAt} = ${cursorData.createdAt.toISOString()}`,
            lt(follows.id, cursorData.id),
          ),
        ),
      );
    }

    const rows = await this.db
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
        followCreatedAt: follows.createdAt,
        followId: follows.id,
      })
      .from(follows)
      .innerJoin(appUsers, eq(follows.followingId, appUsers.id))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(follows.id))
      .limit(fetchLimit);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => mapUserProfile(row));

    let nextCursor: string | null = null;
    if (hasMore && rows[limit]) {
      nextCursor = `${rows[limit].followCreatedAt.toISOString()}:${rows[limit].followId}`;
    }

    return { items, nextCursor, hasMore };
  }

  async getFollowers(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<FollowListResponse> {
    const userRows = await this.db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (userRows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const fetchLimit = limit + 1;
    const cursorData = parseCursor(cursor);

    const conditions = [eq(follows.followingId, userId)];
    if (cursorData) {
      conditions.push(
        or(
          lt(follows.createdAt, cursorData.createdAt),
          and(
            sql`${follows.createdAt} = ${cursorData.createdAt.toISOString()}`,
            lt(follows.id, cursorData.id),
          ),
        ),
      );
    }

    const rows = await this.db
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
        followCreatedAt: follows.createdAt,
        followId: follows.id,
      })
      .from(follows)
      .innerJoin(appUsers, eq(follows.followerId, appUsers.id))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(follows.id))
      .limit(fetchLimit);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => mapUserProfile(row));

    let nextCursor: string | null = null;
    if (hasMore && rows[limit]) {
      nextCursor = `${rows[limit].followCreatedAt.toISOString()}:${rows[limit].followId}`;
    }

    return { items, nextCursor, hasMore };
  }

  async getMyFollowing(userId: string): Promise<UserPublicProfile[]> {
    const rows = await this.db
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
       .from(follows)
       .innerJoin(appUsers, eq(follows.followingId, appUsers.id))
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(200);

    return rows.map((row) => mapUserProfile(row));
  }
}
