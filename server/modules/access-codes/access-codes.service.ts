import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import { eq, desc, count, ilike, or } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { accessCodes, appUsers } from '../../database/schema';
import type {
  AccessCodeItem,
  AccessCodeListResponse,
  AccessCodeLogItem,
  AccessCodeLogListResponse,
  AuthResponse,
  AuthUser,
  BatchCreateAccessCodeResponse,
  UserRole,
} from '@shared/api.interface';
import { AuthService } from '../auth/auth.service';
import { accessCodeLogs } from '../../database/schema';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;

@Injectable()
export class AccessCodesService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authService: AuthService,
  ) {}

  private generateRandomCode(): string {
    let result = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      const idx = crypto.randomInt(0, CODE_CHARS.length);
      result += CODE_CHARS[idx];
    }
    return result;
  }

  async generateCode(): Promise<string> {
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i += 1) {
      const code = this.generateRandomCode();
      const existing = await this.db
        .select({ id: accessCodes.id })
        .from(accessCodes)
        .where(eq(accessCodes.code, code))
        .limit(1);
      if (existing.length === 0) {
        return code;
      }
    }
    throw new BadRequestException('生成通行码失败，请重试');
  }

  private mapAccessCode(row: typeof accessCodes.$inferSelect): AccessCodeItem {
    return {
      id: row.id,
      code: row.code,
      nickname: row.nickname,
      username: row.username ?? null,
      role: row.role as UserRole,
      avatarUrl: row.avatarUrl ?? null,
      bio: row.bio ?? null,
      status: row.status as 'active' | 'disabled' | 'expired' | 'exhausted',
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      maxUses: row.maxUses ?? null,
      useCount: row.useCount,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      note: row.note ?? null,
      appUserId: row.appUserId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapLogItem(row: typeof accessCodeLogs.$inferSelect): AccessCodeLogItem {
    return {
      id: row.id,
      accessCodeId: row.accessCodeId,
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      success: row.success,
      errorReason: row.errorReason ?? null,
      loggedInUserId: row.loggedInUserId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(
    userId: string,
    dto: {
      nickname: string;
      username?: string;
      role: UserRole;
      avatarUrl?: string;
      bio?: string;
      expiresAt?: Date | null;
      maxUses?: number | null;
      note?: string;
      code?: string;
    },
  ): Promise<AccessCodeItem> {
    const code = dto.code ? dto.code.trim().toUpperCase() : await this.generateCode();
    if (dto.code) {
      const existing = await this.db
        .select({ id: accessCodes.id })
        .from(accessCodes)
        .where(eq(accessCodes.code, code))
        .limit(1);
      if (existing.length > 0) {
        throw new BadRequestException('该通行码已存在，请换一个');
      }
    }
    const [inserted] = await this.db
      .insert(accessCodes)
      .values({
        code,
        nickname: dto.nickname,
        username: dto.username,
        role: dto.role,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
        expiresAt: dto.expiresAt,
        maxUses: dto.maxUses,
        note: dto.note,
        createdBy: userId,
      })
      .returning();

    if (!inserted) {
      throw new BadRequestException('创建通行码失败');
    }

    return this.mapAccessCode(inserted);
  }

  async batchCreate(
    userId: string,
    count: number,
    defaults: {
      role?: UserRole;
      expiresAt?: Date | null;
      maxUses?: number | null;
      note?: string;
    },
  ): Promise<BatchCreateAccessCodeResponse> {
    const items: AccessCodeItem[] = [];
    const role: UserRole = defaults.role ?? 'user';

    for (let i = 0; i < count; i += 1) {
      const code = await this.generateCode();
      const nickname = `通行码用户${i + 1}`;
      const [inserted] = await this.db
        .insert(accessCodes)
        .values({
          code,
          nickname,
          role,
          avatarUrl: null,
          expiresAt: defaults.expiresAt ?? null,
          maxUses: defaults.maxUses ?? null,
          note: defaults.note,
          createdBy: userId,
        })
        .returning();
      if (inserted) {
        items.push(this.mapAccessCode(inserted));
      }
    }

    return { items };
  }

  async list(
    page: number,
    pageSize: number,
    keyword?: string,
  ): Promise<AccessCodeListResponse> {
    const offset = (page - 1) * pageSize;

    const whereConditions = [];
    if (keyword) {
      const searchPattern = `%${keyword}%`;
      whereConditions.push(
        or(
          ilike(accessCodes.code, searchPattern),
          ilike(accessCodes.nickname, searchPattern),
          ilike(accessCodes.username, searchPattern),
          ilike(accessCodes.note, searchPattern),
        ),
      );
    }

    const [countResult] = await this.db
      .select({ count: count() })
      .from(accessCodes)
      .where(whereConditions.length > 0 ? whereConditions[0] : undefined);

    const total = Number(countResult.count) || 0;

    const rows = await this.db
      .select()
      .from(accessCodes)
      .where(whereConditions.length > 0 ? whereConditions[0] : undefined)
      .orderBy(desc(accessCodes.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items: AccessCodeItem[] = rows.map(
      (row: typeof accessCodes.$inferSelect) => this.mapAccessCode(row),
    );

    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<AccessCodeItem> {
    const rows = await this.db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('通行码不存在');
    }

    return this.mapAccessCode(rows[0]);
  }

  async update(
    id: string,
    userId: string,
    dto: {
      nickname?: string;
      username?: string;
      role?: UserRole;
      avatarUrl?: string;
      bio?: string;
      status?: 'active' | 'disabled' | 'expired' | 'exhausted';
      expiresAt?: Date | null;
      maxUses?: number | null;
      note?: string;
    },
  ): Promise<AccessCodeItem> {
    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin) {
      throw new ForbiddenException('无管理员权限');
    }

    const patch: Partial<typeof accessCodes.$inferInsert> = {};
    if (dto.nickname !== undefined) patch.nickname = dto.nickname;
    if (dto.username !== undefined) patch.username = dto.username;
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.avatarUrl !== undefined) patch.avatarUrl = dto.avatarUrl;
    if (dto.bio !== undefined) patch.bio = dto.bio;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.expiresAt !== undefined) patch.expiresAt = dto.expiresAt;
    if (dto.maxUses !== undefined) patch.maxUses = dto.maxUses;
    if (dto.note !== undefined) patch.note = dto.note;

    if (Object.keys(patch).length === 0) {
      return this.getById(id);
    }

    const [updated] = await this.db
      .update(accessCodes)
      .set(patch)
      .where(eq(accessCodes.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException('通行码不存在');
    }

    return this.mapAccessCode(updated);
  }

  async delete(id: string, userId: string): Promise<void> {
    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin) {
      throw new ForbiddenException('无管理员权限');
    }

    const deleted = await this.db
      .delete(accessCodes)
      .where(eq(accessCodes.id, id))
      .returning({ id: accessCodes.id });

    if (deleted.length === 0) {
      throw new NotFoundException('通行码不存在');
    }
  }

  async toggleStatus(
    id: string,
    userId: string,
    status: 'active' | 'disabled',
  ): Promise<AccessCodeItem> {
    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin) {
      throw new ForbiddenException('无管理员权限');
    }

    const [updated] = await this.db
      .update(accessCodes)
      .set({ status })
      .where(eq(accessCodes.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException('通行码不存在');
    }

    return this.mapAccessCode(updated);
  }

  private readonly ipFailTracker = new Map<string, { count: number; lockedUntil: number }>();

  private checkIpLock(ipAddress?: string | null): void {
    const key = (ipAddress || 'unknown').trim();
    const rec = this.ipFailTracker.get(key);
    if (rec && rec.lockedUntil > Date.now()) {
      throw new ForbiddenException('通行码尝试次数过多，请稍后再试');
    }
  }

  private recordIpFail(ipAddress?: string | null): void {
    const key = (ipAddress || 'unknown').trim();
    const now = Date.now();
    const prev = this.ipFailTracker.get(key);
    const nextCount = (prev && prev.lockedUntil <= now ? prev.count : 0) + 1;
    this.ipFailTracker.set(key, {
      count: nextCount,
      lockedUntil: nextCount >= 5 ? now + 15 * 60 * 1000 : 0,
    });
  }

  private clearIpFail(ipAddress?: string | null): void {
    const key = (ipAddress || 'unknown').trim();
    this.ipFailTracker.delete(key);
  }

  private async recordCodeFailure(
    accessCode: typeof accessCodes.$inferSelect,
    errorReason: string,
    ipAddress?: string | null,
    userAgent?: string | null,
    statusPatch?: string,
  ): Promise<void> {
    this.recordIpFail(ipAddress);
    const nextFailCount = (accessCode.failCount ?? 0) + 1;
    const patch: Partial<typeof accessCodes.$inferInsert> = {
      failCount: nextFailCount,
    };
    if (nextFailCount >= 5) {
      patch.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    if (statusPatch) {
      patch.status = statusPatch;
    }
    await this.db
      .update(accessCodes)
      .set(patch)
      .where(eq(accessCodes.id, accessCode.id));

    await this.db.insert(accessCodeLogs).values({
      accessCodeId: accessCode.id,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      success: false,
      errorReason,
      loggedInUserId: accessCode.appUserId ?? null,
    });
  }

  async loginWithCode(
    code: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<AuthResponse> {
    this.checkIpLock(ipAddress);

    const rows = await this.db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.code, code.toUpperCase().trim()))
      .limit(1);

    if (rows.length === 0) {
      this.recordIpFail(ipAddress);
      throw new BadRequestException('通行码无效或已失效');
    }

    const accessCode = rows[0];

    if (
      accessCode.lockedUntil &&
      new Date(accessCode.lockedUntil) > new Date()
    ) {
      await this.recordCodeFailure(accessCode, 'locked', ipAddress, userAgent);
      throw new ForbiddenException('通行码尝试次数过多，请稍后再试');
    }

    if (accessCode.status !== 'active') {
      await this.recordCodeFailure(accessCode, `status_${accessCode.status}`, ipAddress, userAgent);
      throw new BadRequestException('通行码无效或已失效');
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      await this.recordCodeFailure(accessCode, 'expired', ipAddress, userAgent, 'expired');
      throw new BadRequestException('通行码已过期');
    }

    if (accessCode.maxUses !== null && accessCode.useCount >= accessCode.maxUses) {
      await this.recordCodeFailure(accessCode, 'exhausted', ipAddress, userAgent, 'exhausted');
      throw new BadRequestException('通行码使用次数已用尽');
    }

    let appUserId: string = accessCode.appUserId ?? '';
    let userEmail = '';

    if (accessCode.appUserId) {
      const userRows = await this.db
        .select({
          id: appUsers.id,
          email: appUsers.email,
          isActive: appUsers.isActive,
          isBanned: appUsers.isBanned,
        })
        .from(appUsers)
        .where(eq(appUsers.id, accessCode.appUserId))
        .limit(1);
      if (userRows.length > 0) {
        if (!userRows[0].isActive || userRows[0].isBanned) {
          await this.recordCodeFailure(accessCode, 'user_banned_or_inactive', ipAddress, userAgent);
          throw new ForbiddenException('账号已被封禁或停用');
        }
        appUserId = userRows[0].id;
        userEmail = userRows[0].email;
      }
    }

    if (!appUserId) {
      const email = `code_${accessCode.code.toLowerCase()}@longpost.local`;
      const passwordHash = crypto.randomBytes(32).toString('hex');

      const [newUser] = await this.db
        .insert(appUsers)
        .values({
          email,
          passwordHash,
          nickname: accessCode.nickname,
          avatarUrl: accessCode.avatarUrl,
          provider: 'access_code',
          providerId: accessCode.code,
          role: accessCode.role,
          bio: accessCode.bio,
        })
        .returning({
          id: appUsers.id,
          email: appUsers.email,
        });

      if (!newUser) {
        throw new BadRequestException('创建用户失败');
      }

      appUserId = newUser.id;
      userEmail = newUser.email;

      await this.db
        .update(accessCodes)
        .set({ appUserId: newUser.id })
        .where(eq(accessCodes.id, accessCode.id));
    }

    const userRows = await this.db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        isActive: appUsers.isActive,
        isBanned: appUsers.isBanned,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(eq(appUsers.id, appUserId))
      .limit(1);

    if (userRows.length === 0) {
      throw new BadRequestException('用户不存在');
    }

    const userRow = userRows[0];
    if (!userRow.isActive || userRow.isBanned) {
      await this.recordCodeFailure(accessCode, 'user_banned_or_inactive', ipAddress, userAgent);
      throw new ForbiddenException('账号已被封禁或停用');
    }

    this.clearIpFail(ipAddress);

    const newUseCount = accessCode.useCount + 1;
    const isExhausted = accessCode.maxUses !== null && newUseCount >= accessCode.maxUses;

    const updateData: Partial<typeof accessCodes.$inferInsert> = {
      useCount: newUseCount,
      lastUsedAt: new Date(),
      failCount: 0,
      lockedUntil: null,
    };
    if (isExhausted) {
      updateData.status = 'exhausted';
    }

    await this.db
      .update(accessCodes)
      .set(updateData)
      .where(eq(accessCodes.id, accessCode.id));

    const user: AuthUser = {
      id: userRow.id,
      email: userRow.email,
      nickname: userRow.nickname,
      avatarUrl: userRow.avatarUrl ?? null,
      provider: userRow.provider,
      role: userRow.role as UserRole,
      bio: userRow.bio ?? null,
      createdAt: userRow.createdAt.toISOString(),
    };

    const token = this.authService.signToken(user.id, user.email, user.nickname, user.role);
    await this.db.insert(accessCodeLogs).values({
      accessCodeId: accessCode.id,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      success: true,
      errorReason: null,
      loggedInUserId: appUserId,
    });
    return { token, user };
  }

  async getLogs(
    codeId: string,
    page: number,
    pageSize: number,
  ): Promise<AccessCodeLogListResponse> {
    const offset = (page - 1) * pageSize;

    const [countResult] = await this.db
      .select({ count: count() })
      .from(accessCodeLogs)
      .where(eq(accessCodeLogs.accessCodeId, codeId));

    const total = Number(countResult.count) || 0;

    const rows = await this.db
      .select()
      .from(accessCodeLogs)
      .where(eq(accessCodeLogs.accessCodeId, codeId))
      .orderBy(desc(accessCodeLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items: AccessCodeLogItem[] = rows.map(
      (row: typeof accessCodeLogs.$inferSelect) => this.mapLogItem(row),
    );

    return { items, total, page, pageSize };
  }

  async setPassword(
    userId: string,
    password: string,
    oldPassword?: string,
  ): Promise<void> {
    const rows = await this.db
      .select({
        id: appUsers.id,
        passwordHash: appUsers.passwordHash,
        provider: appUsers.provider,
      })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('用户不存在');
    }

    const user = rows[0];
    const isOauthPlaceholder = user.passwordHash?.startsWith('oauth_');
    if (user.passwordHash && !isOauthPlaceholder && user.provider !== 'access_code') {
      if (!oldPassword) {
        throw new BadRequestException('需要提供正确的原密码');
      }
      const valid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!valid) {
        throw new BadRequestException('需要提供正确的原密码');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const patch: Partial<typeof appUsers.$inferInsert> = { passwordHash };
    if (user.provider === 'access_code') {
      patch.provider = 'email';
    }

    await this.db
      .update(appUsers)
      .set(patch)
      .where(eq(appUsers.id, userId));
  }
}
