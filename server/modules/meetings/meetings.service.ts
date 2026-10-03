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
  meetings,
  meetingParticipants,
  meetingChatMessages,
  meetingMinutes,
  appUsers,
} from '@server/database/schema';
import {
  eq,
  and,
  desc,
  asc,
  inArray,
  sql,
} from 'drizzle-orm';
import type {
  MeetingItem,
  MeetingParticipant,
  MeetingChatMessage,
  MeetingMinutes,
  MeetingListResponse,
  MeetingDetailResponse,
  MeetingChatListResponse,
  MeetingStatus,
  MeetingParticipantStatus,
  NotificationType,
} from '@shared/api.interface';
import { NotificationsService } from '../notifications/notifications.service';

interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  durationMinutes: number;
  status: string;
  isPublic: boolean;
  meetingCode: string;
  creatorId: string;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ParticipantRow {
  id: string;
  meetingId: string;
  userId: string;
  userName: string | null;
  userAvatarUrl: string | null;
  status: string;
  joinedAt: Date | string | null;
  leftAt: Date | string | null;
}

interface ChatMessageRow {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: Date;
}

const MEETING_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============== Helpers ==============

  private generateMeetingCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += MEETING_CODE_CHARS.charAt(
        Math.floor(Math.random() * MEETING_CODE_CHARS.length),
      );
    }
    return code;
  }

  private async generateUniqueMeetingCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generateMeetingCode();
      const existing = await this.db
        .select({ id: meetings.id })
        .from(meetings)
        .where(eq(meetings.meetingCode, code))
        .limit(1);
      if (existing.length === 0) return code;
    }
    throw new BadRequestException('生成会议码失败，请稍后重试');
  }

  private toDate(val: Date | string): Date {
    return val instanceof Date ? val : new Date(val);
  }

  private computeEffectiveStatus(
    storedStatus: string,
    startTime: Date | string,
    durationMinutes: number,
  ): MeetingStatus {
    if (storedStatus === 'cancelled') return 'cancelled';
    if (storedStatus === 'ended') return 'ended';
    const now = Date.now();
    const start = this.toDate(startTime).getTime();
    const end = start + durationMinutes * 60 * 1000;
    if (now < start) return 'scheduled';
    if (now < end) return 'ongoing';
    return 'ended';
  }

  private mapMeeting(
    row: MeetingRow,
    participantCount: number = 0,
  ): MeetingItem {
    const startDate = this.toDate(row.startTime);
    const effectiveStatus = this.computeEffectiveStatus(
      row.status,
      startDate,
      row.durationMinutes,
    );
    const endTime = new Date(
      startDate.getTime() + row.durationMinutes * 60 * 1000,
    );
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      startTime: startDate.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: row.durationMinutes,
      status: effectiveStatus,
      isPublic: row.isPublic,
      creatorId: row.creatorId,
      creatorName: row.creatorName ?? '未知用户',
      creatorAvatarUrl: row.creatorAvatarUrl ?? null,
      participantCount,
      code: row.meetingCode,
      createdAt: this.toDate(row.createdAt).toISOString(),
    };
  }

  private mapParticipant(row: ParticipantRow): MeetingParticipant {
    return {
      userId: row.userId,
      userName: row.userName ?? '未知用户',
      userAvatarUrl: row.userAvatarUrl ?? null,
      status: row.status as MeetingParticipantStatus,
      joinedAt: row.joinedAt ? this.toDate(row.joinedAt).toISOString() : null,
      leftAt: row.leftAt ? this.toDate(row.leftAt).toISOString() : null,
    };
  }

  private mapChatMessage(row: ChatMessageRow): MeetingChatMessage {
    return {
      id: row.id,
      meetingId: row.meetingId,
      senderId: row.senderId,
      senderName: row.senderName ?? '未知用户',
      senderAvatarUrl: row.senderAvatarUrl ?? null,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private isValidUuid(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private async findMeetingById(id: string): Promise<MeetingRow> {
    if (!this.isValidUuid(id)) {
      throw new NotFoundException('会议不存在');
    }
    const rows = await this.db
      .select({
        id: meetings.id,
        title: meetings.title,
        description: meetings.description,
        startTime: meetings.startTime,
        durationMinutes: meetings.durationMinutes,
        status: meetings.status,
        isPublic: meetings.isPublic,
        meetingCode: meetings.meetingCode,
        creatorId: meetings.creatorId,
        creatorName: appUsers.nickname,
        creatorAvatarUrl: appUsers.avatarUrl,
        createdAt: meetings.createdAt,
        updatedAt: meetings.updatedAt,
      })
      .from(meetings)
      .leftJoin(appUsers, eq(meetings.creatorId, appUsers.id))
      .where(eq(meetings.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('会议不存在');
    }
    return rows[0] as MeetingRow;
  }

  private async isParticipant(
    meetingId: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: meetingParticipants.id })
      .from(meetingParticipants)
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          eq(meetingParticipants.userId, userId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  private async ensureCanViewMeeting(
    meetingRow: MeetingRow,
    userId: string | null,
  ): Promise<void> {
    if (meetingRow.isPublic) return;
    if (!userId) {
      throw new ForbiddenException('请先登录以查看此会议');
    }
    if (meetingRow.creatorId === userId) return;
    const participant = await this.isParticipant(meetingRow.id, userId);
    if (!participant) {
      throw new ForbiddenException('无权查看此会议');
    }
  }

  private async ensureParticipantOrCreator(
    meetingId: string,
    userId: string,
  ): Promise<void> {
    const meeting = await this.findMeetingById(meetingId);
    if (meeting.creatorId === userId) return;
    const participant = await this.isParticipant(meetingId, userId);
    if (!participant) {
      throw new ForbiddenException('仅参会人可执行此操作');
    }
  }

  private async ensureCreator(meetingId: string, userId: string): Promise<void> {
    const meeting = await this.findMeetingById(meetingId);
    if (meeting.creatorId !== userId) {
      throw new ForbiddenException('仅会议创建人可执行此操作');
    }
  }

  // ============== Public Read APIs ==============

  async getDetail(
    id: string,
    userId: string | null,
  ): Promise<MeetingDetailResponse> {
    const meetingRow = await this.findMeetingById(id);
    await this.ensureCanViewMeeting(meetingRow, userId);

    const [participantRows, minutesRows] = await Promise.all([
      this.db
        .select({
          id: meetingParticipants.id,
          meetingId: meetingParticipants.meetingId,
          userId: meetingParticipants.userId,
          userName: appUsers.nickname,
          userAvatarUrl: appUsers.avatarUrl,
          status: meetingParticipants.status,
          joinedAt: meetingParticipants.joinedAt,
          leftAt: meetingParticipants.leftAt,
        })
        .from(meetingParticipants)
        .leftJoin(appUsers, eq(meetingParticipants.userId, appUsers.id))
        .where(eq(meetingParticipants.meetingId, id))
        .orderBy(asc(meetingParticipants.createdAt)),
      this.db
        .select()
        .from(meetingMinutes)
        .where(eq(meetingMinutes.meetingId, id))
        .limit(1),
    ]);

    const meeting = this.mapMeeting(meetingRow, participantRows.length);
    const participants = (participantRows as ParticipantRow[]).map((p) =>
      this.mapParticipant(p),
    );

    const isCurrentUserCreator = userId
      ? meetingRow.creatorId === userId
      : false;
    const isCurrentUserParticipant = userId
      ? participantRows.some(
          (p: { userId: string }) => p.userId === userId,
        )
      : false;

    const endTime = new Date(
      meetingRow.startTime.getTime() + meetingRow.durationMinutes * 60 * 1000,
    );

    const minutes: MeetingMinutes | null =
      minutesRows.length > 0
        ? {
            id: minutesRows[0].id,
            meetingId: minutesRows[0].meetingId,
            content: minutesRows[0].content,
            updatedBy: meetingRow.creatorId,
            updatedByName: meetingRow.creatorName ?? '未知用户',
            updatedAt: minutesRows[0].updatedAt.toISOString(),
          }
        : null;

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.startTime,
        endTime: endTime.toISOString(),
        durationMinutes: meeting.durationMinutes,
        status: meeting.status,
        isPublic: meeting.isPublic,
        creatorId: meeting.creatorId,
        creatorName: meeting.creatorName,
        creatorAvatarUrl: meeting.creatorAvatarUrl,
        participants,
        code: meeting.code,
        createdAt: meeting.createdAt,
        updatedAt: meetingRow.updatedAt.toISOString(),
        isCurrentUserCreator,
        isCurrentUserParticipant,
      },
      minutes,
    };
  }

  async findByCode(code: string): Promise<{ meetingId: string }> {
    const rows = await this.db
      .select({ id: meetings.id })
      .from(meetings)
      .where(eq(meetings.meetingCode, code.toUpperCase()))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('会议不存在');
    }
    return { meetingId: rows[0].id };
  }

  // ============== Authenticated APIs ==============

  async listMyMeetings(
    userId: string,
    status?: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<MeetingListResponse> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(Math.max(1, pageSize), 100);
    const offset = (safePage - 1) * safeSize;

    // Subquery: meeting IDs where user is creator or participant
    const myMeetingIds = sql`
      (SELECT id FROM ${meetings} WHERE ${meetings.creatorId} = ${userId}
       UNION
       SELECT ${meetingParticipants.meetingId} AS id
       FROM ${meetingParticipants}
       WHERE ${meetingParticipants.userId} = ${userId})
    `;

    const conditions: Array<unknown> = [sql`m.id IN ${myMeetingIds}`];

    if (status && status !== 'all') {
      if (status === 'scheduled') {
        conditions.push(
          sql`m.status = 'scheduled' AND m.start_time > NOW()`,
        );
      } else if (status === 'ongoing') {
        conditions.push(
          sql`m.status = 'scheduled' AND m.start_time <= NOW() AND (m.start_time + (m.duration_minutes || ' minutes')::interval) > NOW()`,
        );
      } else if (status === 'ended') {
        conditions.push(
          sql`(m.status = 'ended' OR (m.status = 'scheduled' AND (m.start_time + (m.duration_minutes || ' minutes')::interval) <= NOW()))`,
        );
      } else if (status === 'cancelled') {
        conditions.push(sql`${meetings.status} = 'cancelled'`);
      }
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const countResult = await this.db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM ${meetings} m ${whereClause}
    `);
    const total = Number(countResult[0]?.total ?? 0);

    const rows = await this.db.execute(sql`
      SELECT
        m.id,
        m.title,
        m.description,
        m.start_time AS "startTime",
        m.duration_minutes AS "durationMinutes",
        m.status,
        m.is_public AS "isPublic",
        m.meeting_code AS "meetingCode",
        m.creator_id AS "creatorId",
        u.nickname AS "creatorName",
        u.avatar_url AS "creatorAvatarUrl",
        m._created_at AS "createdAt",
        m._updated_at AS "updatedAt"
      FROM ${meetings} m
      LEFT JOIN ${appUsers} u ON m.creator_id = u.id
      ${whereClause}
      ORDER BY m.start_time DESC
      LIMIT ${safeSize} OFFSET ${offset}
    `) as unknown as MeetingRow[];

    const participantCounts = new Map<string, number>();
    if (rows.length > 0) {
      const ids: string[] = rows.map((r: MeetingRow) => r.id);
      const countRows = await this.db
        .select({
          meetingId: meetingParticipants.meetingId,
          count: sql<number>`COUNT(*)`,
        })
        .from(meetingParticipants)
        .where(inArray(meetingParticipants.meetingId, ids))
        .groupBy(meetingParticipants.meetingId);
      for (const cr of countRows) {
        participantCounts.set(cr.meetingId, Number(cr.count));
      }
    }

    const items: MeetingItem[] = rows.map((r: MeetingRow) =>
      this.mapMeeting(r, participantCounts.get(r.id) ?? 0),
    );

    return { items, total, page: safePage, pageSize: safeSize };
  }

  async create(
    userId: string,
    dto: {
      title: string;
      description?: string;
      startTime: string;
      durationMinutes: number;
      isPublic?: boolean;
      participantIds?: string[];
    },
  ): Promise<{ meetingId: string }> {
    const startDate = new Date(dto.startTime);
    if (isNaN(startDate.getTime())) {
      throw new BadRequestException('无效的开始时间');
    }

    const meetingCode = await this.generateUniqueMeetingCode();

    const participantIds = (dto.participantIds ?? []).filter(
      (id: string) => id !== userId,
    );

    // 去重
    const uniqueIds = [...new Set(participantIds)];

    const [newMeeting] = await this.db
      .insert(meetings)
      .values({
        title: dto.title,
        description: dto.description ?? null,
        startTime: startDate,
        durationMinutes: dto.durationMinutes,
        isPublic: dto.isPublic ?? false,
        meetingCode,
        creatorId: userId,
      })
      .returning({ id: meetings.id });

    if (!newMeeting) {
      throw new BadRequestException('创建会议失败');
    }

    // 批量插入参会人
    if (uniqueIds.length > 0) {
      const values = uniqueIds.map((uid: string) => ({
        meetingId: newMeeting.id,
        userId: uid,
        status: 'invited' as const,
      }));
      await this.db.insert(meetingParticipants).values(values);

      // 发送通知
      for (const uid of uniqueIds) {
        this.notificationsService
          .createNotification(
            uid,
            'meeting_invite' as NotificationType,
            userId,
            null,
            newMeeting.id,
            undefined,
            { meetingTitle: dto.title, meetingCode },
          )
          .catch((err: unknown) => {
            this.logger.error(
              `Failed to send meeting invite notification: ${JSON.stringify(err)}`,
            );
          });
      }
    }

    return { meetingId: newMeeting.id };
  }

  async update(
    meetingId: string,
    userId: string,
    dto: {
      title?: string;
      description?: string;
      startTime?: string;
      durationMinutes?: number;
      isPublic?: boolean;
      status?: MeetingStatus;
    },
  ): Promise<{ success: true }> {
    await this.ensureCreator(meetingId, userId);

    const patch: Partial<typeof meetings.$inferInsert> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.startTime !== undefined) {
      const d = new Date(dto.startTime);
      if (isNaN(d.getTime())) {
        throw new BadRequestException('无效的开始时间');
      }
      patch.startTime = d;
    }
    if (dto.durationMinutes !== undefined)
      patch.durationMinutes = dto.durationMinutes;
    if (dto.isPublic !== undefined) patch.isPublic = dto.isPublic;
    if (dto.status !== undefined) patch.status = dto.status;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();

    const updated = await this.db
      .update(meetings)
      .set(patch)
      .where(eq(meetings.id, meetingId))
      .returning({ id: meetings.id });

    if (updated.length === 0) {
      throw new NotFoundException('会议不存在');
    }

    return { success: true };
  }

  async cancel(meetingId: string, userId: string): Promise<{ success: true }> {
    await this.ensureCreator(meetingId, userId);

    const updated = await this.db
      .update(meetings)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .returning({ id: meetings.id });

    if (updated.length === 0) {
      throw new NotFoundException('会议不存在');
    }
    return { success: true };
  }

  async addParticipants(
    meetingId: string,
    userId: string,
    userIds: string[],
  ): Promise<{ success: true }> {
    const meeting = await this.findMeetingById(meetingId);

    // 仅创建人或参会人自己可以添加
    const isCreator = meeting.creatorId === userId;
    const isParticipant = await this.isParticipant(meetingId, userId);
    if (!isCreator && !isParticipant) {
      throw new ForbiddenException('无权添加参会人');
    }

    const uniqueIds = [...new Set(userIds.filter((id: string) => id))];
    if (uniqueIds.length === 0) {
      return { success: true };
    }

    // 用 ON CONFLICT DO NOTHING 避免重复添加
    const values = uniqueIds.map((uid: string) => ({
      meetingId,
      userId: uid,
      status: 'invited' as const,
    }));

    await this.db.execute(sql`
      INSERT INTO ${meetingParticipants} (meeting_id, user_id, status)
      SELECT * FROM (
        ${sql.join(
          values.map(
            (v) =>
              sql`SELECT ${v.meetingId}::uuid AS meeting_id, ${v.userId}::uuid AS user_id, ${v.status}::varchar AS status`,
          ),
          sql` UNION ALL `,
        )}
      ) AS vals
      ON CONFLICT (meeting_id, user_id) DO NOTHING
    `);

    // 发送通知给新参会人
    for (const uid of uniqueIds) {
      if (uid === userId) continue;
      this.notificationsService
        .createNotification(
          uid,
          'meeting_invite' as NotificationType,
          userId,
          null,
          meetingId,
          undefined,
          { meetingTitle: meeting.title, meetingCode: meeting.meetingCode },
        )
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to send meeting invite notification: ${JSON.stringify(err)}`,
          );
        });
    }

    return { success: true };
  }

  async removeParticipant(
    meetingId: string,
    userId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    const meeting = await this.findMeetingById(meetingId);
    const isCreator = meeting.creatorId === userId;
    const isSelf = userId === targetUserId;

    // 创建人可移除他人；参会人可以自己退出
    if (!isCreator && !isSelf) {
      throw new ForbiddenException('无权移除此参会人');
    }

    const deleted = await this.db
      .delete(meetingParticipants)
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          eq(meetingParticipants.userId, targetUserId),
        ),
      )
      .returning({ id: meetingParticipants.id });

    if (deleted.length === 0) {
      throw new NotFoundException('参会记录不存在');
    }

    return { success: true };
  }

  async joinMeeting(
    meetingId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const meeting = await this.findMeetingById(meetingId);

    // 非公开会议必须是创建人或受邀
    if (!meeting.isPublic && meeting.creatorId !== userId) {
      const participant = await this.isParticipant(meetingId, userId);
      if (!participant) {
        throw new ForbiddenException('无权加入此会议');
      }
    }

    const now = new Date();

    // 尝试更新已有的 participant 记录
    const updated = await this.db
      .update(meetingParticipants)
      .set({ status: 'accepted', joinedAt: now })
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          eq(meetingParticipants.userId, userId),
        ),
      )
      .returning({ id: meetingParticipants.id });

    // 公开会议且用户不是参会人时，自动创建 participant 记录
    if (updated.length === 0 && meeting.isPublic) {
      await this.db
        .insert(meetingParticipants)
        .values({
          meetingId,
          userId,
          status: 'accepted',
          joinedAt: now,
        })
        .onConflictDoNothing();
    }

    return { success: true };
  }

  async leaveMeeting(
    meetingId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const now = new Date();
    const updated = await this.db
      .update(meetingParticipants)
      .set({ leftAt: now })
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          eq(meetingParticipants.userId, userId),
        ),
      )
      .returning({ id: meetingParticipants.id });

    if (updated.length === 0) {
      throw new NotFoundException('参会记录不存在');
    }

    return { success: true };
  }

  async endMeeting(
    meetingId: string,
    userId: string,
  ): Promise<{ success: true }> {
    await this.ensureCreator(meetingId, userId);

    const updated = await this.db
      .update(meetings)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .returning({ id: meetings.id });

    if (updated.length === 0) {
      throw new NotFoundException('会议不存在');
    }

    return { success: true };
  }

  // ============== Chat ==============

  async getChatMessages(
    meetingId: string,
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<MeetingChatListResponse> {
    await this.ensureParticipantOrCreator(meetingId, userId);

    const pageSize = Math.min(limit, 100);
    const fetchLimit = pageSize + 1;

    const whereConditions = [eq(meetingChatMessages.meetingId, meetingId)];
    if (cursor) {
      const parts = cursor.split('_');
      if (parts.length >= 2) {
        const cursorIso = parts[0];
        const cursorId = parts.slice(1).join('_');
        whereConditions.push(
          sql`((${meetingChatMessages.createdAt} < ${cursorIso}::timestamptz) OR (${meetingChatMessages.createdAt} = ${cursorIso}::timestamptz AND ${meetingChatMessages.id} < ${cursorId}))`,
        );
      }
    }

    const rows = await this.db
      .select({
        id: meetingChatMessages.id,
        meetingId: meetingChatMessages.meetingId,
        senderId: meetingChatMessages.senderId,
        senderName: appUsers.nickname,
        senderAvatarUrl: appUsers.avatarUrl,
        content: meetingChatMessages.content,
        createdAt: meetingChatMessages.createdAt,
      })
      .from(meetingChatMessages)
      .leftJoin(appUsers, eq(meetingChatMessages.senderId, appUsers.id))
      .where(and(...whereConditions))
      .orderBy(desc(meetingChatMessages.createdAt), desc(meetingChatMessages.id))
      .limit(fetchLimit);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = `${last.createdAt.toISOString()}_${last.id}`;
    }

    const items: MeetingChatMessage[] = (
      pageRows as unknown as ChatMessageRow[]
    ).map((r) => this.mapChatMessage(r));

    return { items, hasMore, nextCursor };
  }

  async sendChatMessage(
    meetingId: string,
    userId: string,
    content: string,
  ): Promise<{ message: MeetingChatMessage }> {
    await this.ensureParticipantOrCreator(meetingId, userId);

    const [inserted] = await this.db
      .insert(meetingChatMessages)
      .values({
        meetingId,
        senderId: userId,
        content,
      })
      .returning({
        id: meetingChatMessages.id,
        meetingId: meetingChatMessages.meetingId,
        senderId: meetingChatMessages.senderId,
        content: meetingChatMessages.content,
        createdAt: meetingChatMessages.createdAt,
      });

    if (!inserted) {
      throw new BadRequestException('发送消息失败');
    }

    // 获取发送者信息
    const senderRows = await this.db
      .select({ nickname: appUsers.nickname, avatarUrl: appUsers.avatarUrl })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    const message: MeetingChatMessage = {
      id: inserted.id,
      meetingId: inserted.meetingId,
      senderId: inserted.senderId,
      senderName: senderRows[0]?.nickname ?? '未知用户',
      senderAvatarUrl: senderRows[0]?.avatarUrl ?? null,
      content: inserted.content,
      createdAt: inserted.createdAt.toISOString(),
    };

    return { message };
  }

  // ============== Minutes ==============

  async getMinutes(
    meetingId: string,
    userId: string,
  ): Promise<MeetingMinutes | null> {
    await this.ensureParticipantOrCreator(meetingId, userId);

    const rows = await this.db
      .select()
      .from(meetingMinutes)
      .where(eq(meetingMinutes.meetingId, meetingId))
      .limit(1);

    if (rows.length === 0) return null;

    // Only creator can update minutes, so updatedBy = creator
    const meetingRow = await this.findMeetingById(meetingId);

    return {
      id: rows[0].id,
      meetingId: rows[0].meetingId,
      content: rows[0].content,
      updatedBy: meetingRow.creatorId,
      updatedByName: meetingRow.creatorName ?? '未知用户',
      updatedAt: rows[0].updatedAt.toISOString(),
    };
  }

  async updateMinutes(
    meetingId: string,
    userId: string,
    content: string,
  ): Promise<{ minutes: MeetingMinutes }> {
    await this.ensureCreator(meetingId, userId);

    // 检查会议是否存在
    await this.findMeetingById(meetingId);

    const now = new Date();
    const result = await this.db
      .insert(meetingMinutes)
      .values({
        meetingId,
        content,
      })
      .onConflictDoUpdate({
        target: meetingMinutes.meetingId,
        set: { content, updatedAt: now },
      })
      .returning();

    const row = result[0];
    if (!row) {
      throw new BadRequestException('更新会议纪要失败');
    }

    const [userRows] = await this.db
      .select({ nickname: appUsers.nickname })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);

    return {
      minutes: {
        id: row.id,
        meetingId: row.meetingId,
        content: row.content,
        updatedBy: userId,
        updatedByName: userRows?.nickname ?? '未知用户',
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  }

  async leaveMeetingSilent(
    meetingId: string,
    userId: string,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .update(meetingParticipants)
      .set({ leftAt: now })
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          eq(meetingParticipants.userId, userId),
        ),
      );
  }

  async sendChatWithSender(
    meetingId: string,
    userId: string,
    content: string,
  ): Promise<MeetingChatMessage> {
    const result = await this.sendChatMessage(meetingId, userId, content);
    return result.message;
  }
}
