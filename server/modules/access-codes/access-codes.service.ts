import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
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

  async loginWithCode(code: string): Promise<AuthResponse> {
    const rows = await this.db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.code, code.toUpperCase().trim()))
      .limit(1);

    if (rows.length === 0) {
      throw new BadRequestException('通行码无效或已失效');
    }

    const accessCode = rows[0];

    if (accessCode.status !== 'active') {
      throw new BadRequestException('通行码无效或已失效');
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      await this.db
        .update(accessCodes)
        .set({ status: 'expired' })
        .where(eq(accessCodes.id, accessCode.id));
      throw new BadRequestException('通行码已过期');
    }

    if (accessCode.maxUses !== null && accessCode.useCount >= accessCode.maxUses) {
      await this.db
        .update(accessCodes)
        .set({ status: 'exhausted' })
        .where(eq(accessCodes.id, accessCode.id));
      throw new BadRequestException('通行码使用次数已用尽');
    }

    let appUserId: string = accessCode.appUserId ?? '';
    let userEmail = '';

    if (accessCode.appUserId) {
      const userRows = await this.db
        .select({ id: appUsers.id, email: appUsers.email })
        .from(appUsers)
        .where(eq(appUsers.id, accessCode.appUserId))
        .limit(1);
      if (userRows.length > 0) {
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

    const newUseCount = accessCode.useCount + 1;
    const isExhausted = accessCode.maxUses !== null && newUseCount >= accessCode.maxUses;

    const updateData: Partial<typeof accessCodes.$inferInsert> = {
      useCount: newUseCount,
      lastUsedAt: new Date(),
    };
    if (isExhausted) {
      updateData.status = 'exhausted';
    }

    await this.db
      .update(accessCodes)
      .set(updateData)
      .where(eq(accessCodes.id, accessCode.id));

    const userRows = await this.db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(eq(appUsers.id, appUserId))
      .limit(1);

    if (userRows.length === 0) {
      throw new BadRequestException('用户不存在');
    }

    const userRow = userRows[0];
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
      ipAddress: null,
      userAgent: null,
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

  async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await this.db
      .update(appUsers)
      .set({ passwordHash })
      .where(eq(appUsers.id, userId))
      .returning({ id: appUsers.id });
    if (updated.length === 0) {
      throw new NotFoundException('用户不存在');
    }
  }
}
