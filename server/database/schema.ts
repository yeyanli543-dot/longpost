/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { bigint, boolean, foreignKey, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const accessCodeLogs = pgTable("access_code_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accessCodeId: uuid("access_code_id").notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(true),
  errorReason: varchar("error_reason", { length: 100 }),
  loggedInUserId: uuid("logged_in_user_id"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_access_code_logs_code_id").on(table.accessCodeId),
  index("idx_access_code_logs_created_at").on(table.createdAt),
  index("idx_access_code_logs_ip_time").on(table.ipAddress, table.createdAt),
  foreignKey({
    columns: [table.accessCodeId],
    foreignColumns: [accessCodes.id],
    name: "access_code_logs_access_code_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.loggedInUserId],
    foreignColumns: [appUsers.id],
    name: "access_code_logs_logged_in_user_id_fkey",
  }).onDelete("set null"),
]);

export const accessCodes = pgTable("access_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  nickname: varchar("nickname", { length: 100 }).notNull(),
  username: varchar("username", { length: 100 }),
  role: varchar("role", { length: 20 }).notNull().default('user'),
  avatarUrl: text("avatar_url"),
  bio: varchar("bio", { length: 500 }),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  expiresAt: customTimestamptz("expires_at", { precision: 6 }),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").notNull().default(0),
  lastUsedAt: customTimestamptz("last_used_at", { precision: 6 }),
  note: varchar("note", { length: 500 }),
  appUserId: uuid("app_user_id"),
  createdBy: uuid("created_by"),
  failCount: integer("fail_count").notNull().default(0),
  lockedUntil: customTimestamptz("locked_until", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("access_codes_code_key").on(table.code),
  index("idx_access_codes_code").on(table.code),
  index("idx_access_codes_status").on(table.status),
  index("idx_access_codes_app_user_id").on(table.appUserId),
  foreignKey({
    columns: [table.appUserId],
    foreignColumns: [appUsers.id],
    name: "access_codes_app_user_id_fkey",
  }).onDelete("set null"),
]);

export const meetingMinutes = pgTable("meeting_minutes", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().unique(),
  content: text("content").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meeting_minutes_meeting_id_key").on(table.meetingId),
  foreignKey({
    columns: [table.meetingId],
    foreignColumns: [meetings.id],
    name: "meeting_minutes_meeting_id_fkey",
  }).onDelete("cascade"),
]);

export const meetingChatMessages = pgTable("meeting_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  content: text("content").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_meeting_chat_meeting").on(table.meetingId),
  foreignKey({
    columns: [table.meetingId],
    foreignColumns: [meetings.id],
    name: "meeting_chat_messages_meeting_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.senderId],
    foreignColumns: [appUsers.id],
    name: "meeting_chat_messages_sender_id_fkey",
  }),
]);

export const meetingParticipants = pgTable("meeting_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull(),
  userId: uuid("user_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('invited'),
  joinedAt: customTimestamptz("joined_at", { precision: 3 }),
  leftAt: customTimestamptz("left_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meeting_participants_meeting_id_user_id_key").on(table.meetingId, table.userId),
  index("idx_meeting_participants_user").on(table.userId),
  index("idx_meeting_participants_meeting").on(table.meetingId),
  foreignKey({
    columns: [table.meetingId],
    foreignColumns: [meetings.id],
    name: "meeting_participants_meeting_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "meeting_participants_user_id_fkey",
  }),
]);

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  startTime: customTimestamptz("start_time", { precision: 3 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  status: varchar("status", { length: 20 }).notNull().default('scheduled'),
  isPublic: boolean("is_public").notNull().default(false),
  meetingCode: varchar("meeting_code", { length: 20 }).notNull().unique(),
  creatorId: uuid("creator_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meetings_meeting_code_key").on(table.meetingCode),
  index("idx_meetings_creator").on(table.creatorId),
  index("idx_meetings_start_time").on(table.startTime),
  foreignKey({
    columns: [table.creatorId],
    foreignColumns: [appUsers.id],
    name: "meetings_creator_id_fkey",
  }),
]);

export const dmMessages = pgTable("dm_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  content: text("content").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_dm_messages_conv").on(table.conversationId, table.createdAt),
  index("idx_dm_messages_sender").on(table.senderId),
  foreignKey({
    columns: [table.conversationId],
    foreignColumns: [dmConversations.id],
    name: "dm_messages_conversation_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.senderId],
    foreignColumns: [appUsers.id],
    name: "dm_messages_sender_id_fkey",
  }).onDelete("cascade"),
]);

export const dmConversationParticipants = pgTable("dm_conversation_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  userId: uuid("user_id").notNull(),
  lastReadAt: customTimestamptz("last_read_at", { precision: 3 }),
  deletedAt: customTimestamptz("deleted_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("dm_conversation_participants_conversation_id_user_id_key").on(table.conversationId, table.userId),
  index("idx_dm_participants_user").on(table.userId, table.deletedAt),
  index("idx_dm_participants_conv").on(table.conversationId),
  foreignKey({
    columns: [table.conversationId],
    foreignColumns: [dmConversations.id],
    name: "dm_conversation_participants_conversation_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "dm_conversation_participants_user_id_fkey",
  }).onDelete("cascade"),
]);

export const dmConversations = pgTable("dm_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: customTimestamptz("created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz("updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").notNull(),
  contentType: varchar("content_type", { length: 20 }).notNull(),
  contentId: uuid("content_id").notNull(),
  reason: varchar("reason", { length: 50 }).notNull(),
  description: varchar("description", { length: 500 }),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  handlerId: uuid("handler_id"),
  handledAt: customTimestamptz("handled_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_reports_status").on(table.status, table.createdAt),
  index("idx_reports_content").on(table.contentType, table.contentId),
  index("idx_reports_reporter").on(table.reporterId),
  foreignKey({
    columns: [table.reporterId],
    foreignColumns: [appUsers.id],
    name: "reports_reporter_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.handlerId],
    foreignColumns: [appUsers.id],
    name: "reports_handler_id_fkey",
  }).onDelete("set null"),
]);

export const commentLikes = pgTable("comment_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  commentId: uuid("comment_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("idx_comment_likes_user_comment").on(table.userId, table.commentId),
  index("idx_comment_likes_comment").on(table.commentId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "comment_likes_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.commentId],
    foreignColumns: [comments.id],
    name: "comment_likes_comment_id_fkey",
  }).onDelete("cascade"),
]);

export const contentHashtags = pgTable("content_hashtags", {
  id: uuid("id").primaryKey().defaultRandom(),
  hashtagId: uuid("hashtag_id").notNull(),
  contentType: varchar("content_type", { length: 20 }).notNull(),
  contentId: uuid("content_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("idx_content_hashtags_unique").on(table.hashtagId, table.contentType, table.contentId),
  index("idx_content_hashtags_content").on(table.contentType, table.contentId),
  foreignKey({
    columns: [table.hashtagId],
    foreignColumns: [hashtags.id],
    name: "content_hashtags_hashtag_id_fkey",
  }).onDelete("cascade"),
]);

export const hashtags = pgTable("hashtags", {
  id: uuid("id").primaryKey().defaultRandom(),
  tag: varchar("tag", { length: 100 }).notNull().unique(),
  postCount: integer("post_count").notNull().default(0),
  articleCount: integer("article_count").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("hashtags_tag_key").on(table.tag),
  index("idx_hashtags_tag").on(table.tag),
  index("idx_hashtags_post_count").on(table.postCount),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  actorId: uuid("actor_id"),
  contentType: varchar("content_type", { length: 20 }),
  contentId: uuid("content_id"),
  commentId: uuid("comment_id"),
  isRead: boolean("is_read").notNull().default(false),
  /**
   * @type { text?: string; mentionedIndex?: number }
   */
  metadata: jsonb("metadata"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_notifications_user_read").on(table.userId, table.isRead, table.createdAt),
  index("idx_notifications_user_created").on(table.userId, table.createdAt),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "notifications_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.actorId],
    foreignColumns: [appUsers.id],
    name: "notifications_actor_id_fkey",
  }).onDelete("set null"),
  foreignKey({
    columns: [table.commentId],
    foreignColumns: [comments.id],
    name: "notifications_comment_id_fkey",
  }).onDelete("set null"),
]);

export const follows = pgTable("follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerId: uuid("follower_id").notNull(),
  followingId: uuid("following_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("idx_follows_follower_following").on(table.followerId, table.followingId),
  index("idx_follows_following").on(table.followingId),
  index("idx_follows_follower").on(table.followerId),
  foreignKey({
    columns: [table.followerId],
    foreignColumns: [appUsers.id],
    name: "follows_follower_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.followingId],
    foreignColumns: [appUsers.id],
    name: "follows_following_id_fkey",
  }).onDelete("cascade"),
]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  contentType: varchar("content_type", { length: 20 }).notNull(),
  contentId: uuid("content_id").notNull(),
  parentId: uuid("parent_id"),
  body: varchar("body", { length: 500 }).notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  likeCount: integer("like_count").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_comments_content").on(table.contentType, table.contentId, table.createdAt),
  index("idx_comments_user").on(table.userId),
  index("idx_comments_parent").on(table.parentId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "comments_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [comments.id],
    name: "comments_parent_id_fkey",
  }).onDelete("set null"),
]);

export const reposts = pgTable("reposts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  contentType: varchar("content_type", { length: 20 }).notNull(),
  contentId: uuid("content_id").notNull(),
  quoteContent: varchar("quote_content", { length: 280 }),
  isQuote: boolean("is_quote").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("idx_reposts_user_content").on(table.userId, table.contentType, table.contentId),
  index("idx_reposts_content").on(table.contentType, table.contentId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "reposts_user_id_fkey",
  }).onDelete("cascade"),
]);

export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  articleId: uuid("article_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("idx_bookmarks_user_article").on(table.userId, table.articleId),
  index("idx_bookmarks_article").on(table.articleId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "bookmarks_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.articleId],
    foreignColumns: [articles.id],
    name: "bookmarks_article_id_fkey",
  }).onDelete("cascade"),
]);

export const likes = pgTable("likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  contentType: varchar("content_type", { length: 20 }).notNull(),
  contentId: uuid("content_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("idx_likes_user_content").on(table.userId, table.contentType, table.contentId),
  index("idx_likes_content").on(table.contentType, table.contentId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "likes_user_id_fkey",
  }).onDelete("cascade"),
]);

export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteName: varchar("site_name", { length: 100 }).notNull().default('LongPost'),
  siteDescription: varchar("site_description", { length: 500 }),
  siteLogoUrl: text("site_logo_url"),
  allowRegister: boolean("allow_register").notNull().default(true),
  googleLoginEnabled: boolean("google_login_enabled").notNull().default(true),
  siteAnnouncement: varchar("site_announcement", { length: 500 }),
  contentModerationEnabled: boolean("content_moderation_enabled").notNull().default(false),
  registrationMode: varchar("registration_mode", { length: 50 }).notNull().default('google_only'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
});

export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url"),
  provider: varchar("provider", { length: 50 }).notNull().default('email'),
  providerId: varchar("provider_id", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: customTimestamptz("last_login_at", { precision: 3 }),
  role: varchar("role", { length: 20 }).notNull().default('user'),
  bio: varchar("bio", { length: 500 }),
  notifyOnRead: boolean("notify_on_read").notNull().default(true),
  notifyOnDelete: boolean("notify_on_delete").notNull().default(true),
  theme: varchar("theme", { length: 20 }).notNull().default('dark'),
  fontSize: varchar("font_size", { length: 20 }).notNull().default('medium'),
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: varchar("ban_reason", { length: 500 }),
  bannedAt: customTimestamptz("banned_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  uniqueIndex("app_users_email_key").on(table.email),
  uniqueIndex("idx_app_users_email").on(table.email),
  uniqueIndex("idx_app_users_provider").on(table.provider, table.providerId),
  index("idx_app_users_role").on(table.role),
]);

export const articleAttachments = pgTable("article_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: 'number' }),
  fileType: varchar("file_type", { length: 100 }),
  sortOrder: integer("sort_order").notNull().default(0),
  appUserId: uuid("app_user_id"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_article_attachments_article_id").on(table.articleId),
  index("idx_article_attachments_app_user_id").on(table.appUserId),
  foreignKey({
    columns: [table.articleId],
    foreignColumns: [articles.id],
    name: "article_attachments_article_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.appUserId],
    foreignColumns: [appUsers.id],
    name: "article_attachments_app_user_id_fkey",
  }).onDelete("set null"),
]);

export const articleImages = pgTable("article_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id").notNull(),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  appUserId: uuid("app_user_id"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_article_images_article_id").on(table.articleId),
  index("idx_article_images_app_user_id").on(table.appUserId),
  foreignKey({
    columns: [table.articleId],
    foreignColumns: [articles.id],
    name: "article_images_article_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.appUserId],
    foreignColumns: [appUsers.id],
    name: "article_images_app_user_id_fkey",
  }).onDelete("set null"),
]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: varchar("content", { length: 280 }).notNull(),
  articleId: uuid("article_id"),
  author: userProfile("author").notNull(),
  appUserId: uuid("app_user_id"),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  repostCount: integer("repost_count").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  moderationStatus: varchar("moderation_status", { length: 20 }).notNull().default('approved'),
  pinnedAt: customTimestamptz("pinned_at", { precision: 6 }),
  featuredAt: customTimestamptz("featured_at", { precision: 6 }),
  rejectReason: varchar("reject_reason", { length: 500 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_posts_created_at").on(table.createdAt),
  index("idx_posts_moderation_created").on(table.moderationStatus, table.createdAt),
  // Complex index: CREATE INDEX idx_posts_author ON posts USING btree (((author).user_id)),
  index("idx_posts_article_id").on(table.articleId),
  index("idx_posts_app_user_id").on(table.appUserId),
  foreignKey({
    columns: [table.articleId],
    foreignColumns: [articles.id],
    name: "posts_article_id_fkey",
  }).onDelete("set null"),
  foreignKey({
    columns: [table.appUserId],
    foreignColumns: [appUsers.id],
    name: "posts_app_user_id_fkey",
  }).onDelete("set null"),
]);

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  excerpt: varchar("excerpt", { length: 500 }),
  coverUrl: text("cover_url"),
  readCount: integer("read_count").notNull().default(0),
  author: userProfile("author").notNull(),
  appUserId: uuid("app_user_id"),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  repostCount: integer("repost_count").notNull().default(0),
  bookmarkCount: integer("bookmark_count").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  moderationStatus: varchar("moderation_status", { length: 20 }).notNull().default('approved'),
  pinnedAt: customTimestamptz("pinned_at", { precision: 6 }),
  featuredAt: customTimestamptz("featured_at", { precision: 6 }),
  rejectReason: varchar("reject_reason", { length: 500 }),
  slug: varchar("slug", { length: 12 }).unique(),
  status: varchar("status", { length: 20 }).notNull().default('published'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL
    ELSE NULL
  END`),
}, (table) => [
  index("idx_articles_created_at").on(table.createdAt),
  index("idx_articles_status_created").on(table.status, table.moderationStatus, table.createdAt),
  // Complex index: CREATE INDEX idx_articles_author ON articles USING btree (((author).user_id)),
  index("idx_articles_app_user_id").on(table.appUserId),
  uniqueIndex("idx_articles_slug").on(table.slug),
  foreignKey({
    columns: [table.appUserId],
    foreignColumns: [appUsers.id],
    name: "articles_app_user_id_fkey",
  }).onDelete("set null"),
]);

// table aliases
export const accessCodeLogsTable = accessCodeLogs;
export const accessCodesTable = accessCodes;
export const appUsersTable = appUsers;
export const articleAttachmentsTable = articleAttachments;
export const articleImagesTable = articleImages;
export const articlesTable = articles;
export const bookmarksTable = bookmarks;
export const commentLikesTable = commentLikes;
export const commentsTable = comments;
export const contentHashtagsTable = contentHashtags;
export const dmConversationParticipantsTable = dmConversationParticipants;
export const dmConversationsTable = dmConversations;
export const dmMessagesTable = dmMessages;
export const followsTable = follows;
export const hashtagsTable = hashtags;
export const likesTable = likes;
export const meetingChatMessagesTable = meetingChatMessages;
export const meetingMinutesTable = meetingMinutes;
export const meetingParticipantsTable = meetingParticipants;
export const meetingsTable = meetings;
export const notificationsTable = notifications;
export const postsTable = posts;
export const reportsTable = reports;
export const repostsTable = reposts;
export const siteSettingsTable = siteSettings;
