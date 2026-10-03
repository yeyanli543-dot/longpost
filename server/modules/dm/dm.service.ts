import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import {
  dmConversations,
  dmConversationParticipants,
  dmMessages,
  appUsers,
} from '@server/database/schema';
import {
  eq,
  and,
  desc,
  isNull,
  sql,
  inArray,
  ne,
  or,
  ilike,
} from 'drizzle-orm';
import type {
  DMConversation,
  DMConversationListResponse,
  DMMessage,
  DMMessageListResponse,
  DMCreateConversationResponse,
  DMSendMessageResponse,
  DMUnreadCountResponse,
  DMSearchUserResponse,
  AuthUser,
  NotificationType,
} from '@shared/api.interface';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DmService {
  private readonly logger = new Logger(DmService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 获取当前用户会话列表
   */
  async getConversations(
    userId: string,
  ): Promise<DMConversationListResponse> {
    // 1. 找出当前用户参与且未删除的所有会话
    const myParticipants = await this.db
      .select({
        conversationId: dmConversationParticipants.conversationId,
        lastReadAt: dmConversationParticipants.lastReadAt,
      })
      .from(dmConversationParticipants)
      .where(
        and(
          eq(dmConversationParticipants.userId, userId),
          isNull(dmConversationParticipants.deletedAt),
        ),
      );

    if (myParticipants.length === 0) {
      return { items: [] };
    }

    const conversationIds = myParticipants.map(
      (p: { conversationId: string; lastReadAt: Date | null }) =>
        p.conversationId,
    );
    const lastReadMap = new Map<string, Date | null>();
    for (const p of myParticipants) {
      lastReadMap.set(p.conversationId, p.lastReadAt);
    }

    // 2. 找到每个会话的对方用户
    const otherParticipants = await this.db
      .select({
        conversationId: dmConversationParticipants.conversationId,
        userId: dmConversationParticipants.userId,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
      })
      .from(dmConversationParticipants)
      .innerJoin(
        appUsers,
        eq(dmConversationParticipants.userId, appUsers.id),
      )
      .where(
        and(
          inArray(dmConversationParticipants.conversationId, conversationIds),
          ne(dmConversationParticipants.userId, userId),
        ),
      );

    const otherUserMap = new Map<
      string,
      { userId: string; nickname: string; avatarUrl: string | null }
    >();
    for (const p of otherParticipants) {
      otherUserMap.set(p.conversationId, {
        userId: p.userId,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl ?? null,
      });
    }

    // 3. 获取每个会话的最新消息（用窗口函数取每组第一条）
    const lastMessages = await this.db.execute<{
      conversation_id: string;
      message_id: string;
      content: string;
      sender_id: string;
      _created_at: Date;
    }>(sql`
      SELECT conversation_id, message_id, content, sender_id, _created_at
      FROM (
        SELECT
          m.conversation_id,
          m.id AS message_id,
          m.content,
          m.sender_id,
          m._created_at,
          ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m._created_at DESC) AS rn
        FROM ${dmMessages} m
        WHERE m.conversation_id = ANY(ARRAY[${sql.join(
          conversationIds.map((id: string) => sql`${id}`),
          sql`, `,
        )}]::uuid[])
          AND m.is_deleted = false
      ) sub
      WHERE rn = 1
    `);

    const lastMessageMap = new Map<
      string,
      {
        id: string;
        content: string;
        senderId: string;
        createdAt: Date;
      }
    >();
    for (const row of lastMessages) {
      lastMessageMap.set(row.conversation_id, {
        id: row.message_id,
        content: row.content,
        senderId: row.sender_id,
        createdAt:
          row._created_at instanceof Date
            ? row._created_at
            : new Date(row._created_at as unknown as string),
      });
    }

    // 4. 计算未读消息数（对方发的、时间 > last_read_at）
    const unreadCounts = await this.db.execute<{
      conversation_id: string;
      unread_count: string;
    }>(sql`
      SELECT
        p.conversation_id,
        COUNT(m.id) AS unread_count
      FROM ${dmConversationParticipants} p
      LEFT JOIN ${dmMessages} m
        ON m.conversation_id = p.conversation_id
        AND m.sender_id != p.user_id
        AND m.is_deleted = false
        AND (p.last_read_at IS NULL OR m._created_at > p.last_read_at)
      WHERE p.user_id = ${userId}
        AND p.deleted_at IS NULL
      GROUP BY p.conversation_id
    `);

    const unreadMap = new Map<string, number>();
    for (const row of unreadCounts) {
      unreadMap.set(row.conversation_id, Number(row.unread_count));
    }

    // 5. 取会话 updated_at 用于排序
    const convRows = await this.db
      .select({
        id: dmConversations.id,
        updatedAt: dmConversations.updatedAt,
      })
      .from(dmConversations)
      .where(inArray(dmConversations.id, conversationIds));

    const updatedAtMap = new Map<string, Date>();
    for (const c of convRows) {
      updatedAtMap.set(
        c.id,
        c.updatedAt instanceof Date ? c.updatedAt : new Date(c.updatedAt as unknown as string),
      );
    }

    // 6. 组装结果
    const items: DMConversation[] = conversationIds.map((convId: string) => {
      const other = otherUserMap.get(convId);
      const lastMsg = lastMessageMap.get(convId);
      const updatedAt = updatedAtMap.get(convId) ?? new Date(0);

      return {
        id: convId,
        otherUserId: other?.userId ?? '',
        otherUserName: other?.nickname ?? '未知用户',
        otherUserAvatarUrl: other?.avatarUrl ?? null,
        lastMessage: lastMsg?.content ?? null,
        lastMessageAt: lastMsg?.createdAt
          ? lastMsg.createdAt.toISOString()
          : null,
        lastMessageSenderId: lastMsg?.senderId ?? null,
        unreadCount: unreadMap.get(convId) ?? 0,
        updatedAt: updatedAt.toISOString(),
      };
    });

    // 按 lastMessageAt 或 updatedAt 倒序
    items.sort((a: DMConversation, b: DMConversation) => {
      const aTime = a.lastMessageAt ?? a.updatedAt;
      const bTime = b.lastMessageAt ?? b.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return { items };
  }

  /**
   * 发起新会话（两人会话，若已存在则返回已有）
   */
  async createConversation(
    currentUserId: string,
    targetUserId: string,
  ): Promise<DMCreateConversationResponse> {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('不能给自己发送私信');
    }

    // 检查目标用户是否存在且未被封禁
    const targetUser = await this.db
      .select({
        id: appUsers.id,
        isBanned: appUsers.isBanned,
      })
      .from(appUsers)
      .where(eq(appUsers.id, targetUserId));

    if (targetUser.length === 0) {
      throw new BadRequestException('用户不存在');
    }

    if (targetUser[0].isBanned) {
      throw new BadRequestException('该用户已被封禁，无法发送私信');
    }

    // 查找两人都是参与者且都未删除的会话
    const existingConvs = await this.db.execute<{
      conversation_id: string;
      cnt: string;
    }>(sql`
      SELECT p.conversation_id, COUNT(*) AS cnt
      FROM ${dmConversationParticipants} p
      WHERE p.user_id = ANY(ARRAY[${sql.join(
        [currentUserId, targetUserId].map((id: string) => sql`${id}`),
        sql`, `,
      )}]::uuid[])
        AND p.deleted_at IS NULL
      GROUP BY p.conversation_id
      HAVING COUNT(*) = 2
      LIMIT 1
    `);

    if (existingConvs.length > 0) {
      return { conversationId: existingConvs[0].conversation_id };
    }

    // 创建新会话
    const [newConv] = await this.db
      .insert(dmConversations)
      .values({})
      .returning({ id: dmConversations.id });

    if (!newConv) {
      throw new BadRequestException('创建会话失败');
    }

    await this.db.insert(dmConversationParticipants).values([
      { conversationId: newConv.id, userId: currentUserId },
      { conversationId: newConv.id, userId: targetUserId },
    ]);

    return { conversationId: newConv.id };
  }

  /**
   * 获取会话消息（游标分页，按 _created_at DESC）
   */
  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit?: number,
  ): Promise<DMMessageListResponse> {
    // 检查是否是参与者
    const participant = await this.db
      .select({
        id: dmConversationParticipants.id,
        userId: dmConversationParticipants.userId,
      })
      .from(dmConversationParticipants)
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, userId),
        ),
      );

    if (participant.length === 0) {
      throw new ForbiddenException('无权访问该会话');
    }

    const pageSize = Math.min(limit ?? 30, 100);
    const fetchLimit = pageSize + 1;

    const whereConditions = [
      eq(dmMessages.conversationId, conversationId),
      eq(dmMessages.isDeleted, false),
    ];

    if (cursor) {
      const { createdAt: cursorCreatedAt, id: cursorId } =
        this.parseCursor(cursor);
      const cursorIso = cursorCreatedAt.toISOString();
      whereConditions.push(
        sql`((${dmMessages.createdAt} < ${cursorIso}::timestamptz) OR (${dmMessages.createdAt} = ${cursorIso}::timestamptz AND ${dmMessages.id} < ${cursorId}))`,
      );
    }

    const rows = await this.db
      .select({
        id: dmMessages.id,
        conversationId: dmMessages.conversationId,
        senderId: dmMessages.senderId,
        content: dmMessages.content,
        createdAt: dmMessages.createdAt,
      })
      .from(dmMessages)
      .where(and(...whereConditions))
      .orderBy(desc(dmMessages.createdAt), desc(dmMessages.id))
      .limit(fetchLimit);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    const items: DMMessage[] = pageRows.map(
      (row: {
        id: string;
        conversationId: string;
        senderId: string;
        content: string;
        createdAt: Date;
      }) => ({
        id: row.id,
        conversationId: row.conversationId,
        senderId: row.senderId,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        isOwn: row.senderId === userId,
      }),
    );

    let nextCursor: string | undefined;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      nextCursor = this.makeCursor(lastRow.createdAt, lastRow.id);
    }

    // 标记已读（更新 last_read_at 为 now）
    const now = new Date();
    await this.db
      .update(dmConversationParticipants)
      .set({ lastReadAt: now })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, userId),
        ),
      );

    // 同时更新会话的 updated_at
    await this.db
      .update(dmConversations)
      .set({ updatedAt: now })
      .where(eq(dmConversations.id, conversationId));

    return {
      items,
      hasMore,
      nextCursor,
    };
  }

  /**
   * 发送消息
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<DMSendMessageResponse> {
    // 检查是否是参与者
    const participants = await this.db
      .select({
        id: dmConversationParticipants.id,
        userId: dmConversationParticipants.userId,
      })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.conversationId, conversationId));

    if (participants.length === 0) {
      throw new NotFoundException('会话不存在');
    }

    const isParticipant = participants.some(
      (p: { id: string; userId: string }) => p.userId === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('无权向该会话发送消息');
    }

    const now = new Date();

    // 插入消息
    const [message] = await this.db
      .insert(dmMessages)
      .values({
        conversationId,
        senderId: userId,
        content,
      })
      .returning({
        id: dmMessages.id,
        conversationId: dmMessages.conversationId,
        senderId: dmMessages.senderId,
        content: dmMessages.content,
        createdAt: dmMessages.createdAt,
      });

    if (!message) {
      throw new BadRequestException('发送消息失败');
    }

    // 更新会话 updated_at
    await this.db
      .update(dmConversations)
      .set({ updatedAt: now })
      .where(eq(dmConversations.id, conversationId));

    // 重置对方参与者的 deleted_at（新消息让会话重新出现）
    const otherParticipant = participants.find(
      (p: { id: string; userId: string }) => p.userId !== userId,
    );
    if (otherParticipant) {
      await this.db
        .update(dmConversationParticipants)
        .set({ deletedAt: null })
        .where(
          and(
            eq(dmConversationParticipants.conversationId, conversationId),
            eq(dmConversationParticipants.userId, otherParticipant.userId),
          ),
        );
    }

    // 创建通知给接收方
    if (otherParticipant && otherParticipant.userId !== userId) {
      void this.notificationsService
        .createNotification(
          otherParticipant.userId,
          'dm' as NotificationType,
          userId,
          null,
          null,
          undefined,
          {
            conversationId,
            messagePreview:
              content.length > 100
                ? content.slice(0, 100) + '...'
                : content,
          },
        )
        .catch((err: Error) => {
          this.logger.error(
            `Failed to create dm notification: ${err.message}`,
            err.stack,
          );
        });
    }

    return {
      message: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        isOwn: true,
      },
    };
  }

  /**
   * 删除会话（软删除，仅当前用户视角）
   */
  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ success: true }> {
    const result = await this.db
      .update(dmConversationParticipants)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(dmConversationParticipants.conversationId, conversationId),
          eq(dmConversationParticipants.userId, userId),
        ),
      )
      .returning({ id: dmConversationParticipants.id });

    if (result.length === 0) {
      throw new ForbiddenException('无权操作该会话');
    }

    return { success: true };
  }

  /**
   * 未读消息总数
   */
  async getUnreadCount(userId: string): Promise<DMUnreadCountResponse> {
    const result = await this.db.execute<{ total_unread: string }>(sql`
      SELECT COALESCE(SUM(unread_count), 0) AS total_unread
      FROM (
        SELECT
          COUNT(m.id) AS unread_count
        FROM ${dmConversationParticipants} p
        LEFT JOIN ${dmMessages} m
          ON m.conversation_id = p.conversation_id
          AND m.sender_id != p.user_id
          AND m.is_deleted = false
          AND (p.last_read_at IS NULL OR m._created_at > p.last_read_at)
        WHERE p.user_id = ${userId}
          AND p.deleted_at IS NULL
        GROUP BY p.conversation_id
      ) sub
    `);

    const total = result[0] ? Number(result[0].total_unread) : 0;

    return { totalUnread: total };
  }

  /**
   * 搜索用户发起私信
   */
  async searchUsers(
    currentUserId: string,
    query: string,
    limit?: number,
  ): Promise<DMSearchUserResponse> {
    if (!query || query.trim().length === 0) {
      return { items: [] };
    }

    const pageSize = Math.min(limit ?? 20, 50);
    const searchTerm = `%${query.trim()}%`;

    const rows = await this.db
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
      .where(
        and(
          ne(appUsers.id, currentUserId),
          eq(appUsers.isBanned, false),
          or(
            ilike(appUsers.nickname, searchTerm),
            ilike(appUsers.email, searchTerm),
          ),
        ),
      )
      .orderBy(desc(appUsers.nickname))
      .limit(pageSize);

    const items: AuthUser[] = rows.map(
      (row: {
        id: string;
        email: string;
        nickname: string;
        avatarUrl: string | null;
        provider: string;
        role: string;
        bio: string | null;
        createdAt: Date;
      }) => ({
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl ?? null,
        provider: row.provider,
        role: row.role as 'admin' | 'user',
        bio: row.bio ?? null,
        createdAt: row.createdAt.toISOString(),
      }),
    );

    return { items };
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
