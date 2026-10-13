export type ThemeMode =
  | 'light'
  | 'dark'
  | 'system'
  | 'oled'
  | 'sepia'
  | 'nord'
  | 'forest'
  | 'lavender';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type CommentContentType = 'post' | 'article';
export type TimelineView = 'all' | 'following' | 'hot';
export type CommentSortMode = 'time' | 'hot';
export type NotificationType = 'like' | 'repost' | 'comment' | 'follow' | 'mention' | 'content_removed' | 'user_banned' | 'dm' | 'meeting_invite';

export type RegistrationMode = 'google_only' | 'email_and_google';

export type ReportContentType = 'post' | 'article' | 'comment';
export type ReportStatus = 'pending' | 'resolved' | 'ignored';
export type ReportReason = 'spam' | 'misinformation' | 'harassment' | 'infringement' | 'other';

export type ContentModerationStatus = 'published' | 'pending_review' | 'rejected' | 'hidden';

export type ModerationStatus = 'approved' | 'pending_moderation' | 'rejected';

export interface ModerationReviewRequest {
  status: 'approved' | 'rejected';
  reason?: string;
}

export interface AdminModerationPostListResponse {
  items: PostItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminModerationArticleListResponse {
  items: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PostItem {
  id: string;
  content: string;
  articleId: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: string;
  createdAt: string;
  article?: ArticleSummary | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  isPinned: boolean;
  isFeatured: boolean;
  moderationStatus: string;
  isLiked?: boolean;
  isReposted?: boolean;
  hashtags?: string[];
  mentions?: string[];
}

export interface ArticleImage {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ArticleAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  fileType: string | null;
  sortOrder: number;
}

export interface ArticleSummary {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  readCount: number;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: string;
  status: 'published' | 'draft';
  createdAt: string;
  imageCount: number;
  attachmentCount: number;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  bookmarkCount: number;
  isPinned: boolean;
  isFeatured: boolean;
  moderationStatus: string;
  isLiked?: boolean;
  isBookmarked?: boolean;
  isReposted?: boolean;
  hashtags?: string[];
}

export interface ArticleDetail {
  id: string;
  slug: string | null;
  title: string;
  content: string;
  excerpt: string | null;
  coverUrl: string | null;
  readCount: number;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: string;
  status: 'published' | 'draft';
  createdAt: string;
  linkedPosts: PostItem[];
  images: ArticleImage[];
  attachments: ArticleAttachment[];
  likeCount: number;
  commentCount: number;
  repostCount: number;
  bookmarkCount: number;
  isPinned: boolean;
  isFeatured: boolean;
  moderationStatus: string;
  isLiked?: boolean;
  isBookmarked?: boolean;
  isReposted?: boolean;
  hashtags?: string[];
}

// --- Admin Dashboard ---
export interface AdminDashboardStats {
  totalUsers: number;
  totalPosts: number;
  totalArticles: number;
  totalComments: number;
  totalLikes: number;
  totalBookmarks: number;
  totalReposts: number;
  todayNewUsers: number;
  todayNewPosts: number;
  todayNewArticles: number;
  todayNewComments: number;
  pendingReports: number;
  pendingReviewCount: number;
  bannedUsers: number;
}

// --- Admin Content Management ---
export interface AdminPostListResponse {
  items: PostItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminArticleListResponse {
  items: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCommentListResponse {
  items: CommentItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminContentActionRequest {
  action: 'pin' | 'unpin' | 'feature' | 'unfeature' | 'hide' | 'unhide';
}

export interface AdminBatchDeleteRequest {
  ids: string[];
}

// --- Admin User Management ---
export interface AdminUserItem {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  bio: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  postCount: number;
  articleCount: number;
  likeCount: number;
  followerCount: number;
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserActionRequest {
  action: 'ban' | 'unban' | 'promote' | 'demote';
  reason?: string;
}

// --- Reports ---
export interface ReportItem {
  id: string;
  reporterId: string;
  reporterName: string;
  reporterAvatarUrl: string | null;
  contentType: ReportContentType;
  contentId: string;
  contentTitle?: string;
  contentPreview?: string;
  contentAuthorId?: string;
  contentAuthorName?: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  handlerId: string | null;
  handlerName: string | null;
  handledAt: string | null;
  createdAt: string;
}

export interface CreateReportRequest {
  contentType: ReportContentType;
  contentId: string;
  reason: ReportReason;
  description?: string;
}

export interface ReportListResponse {
  items: ReportItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportActionRequest {
  action: 'resolve_delete' | 'resolve_ignore' | 'ban_author';
  reason?: string;
}

export interface ModerationReviewRequest {
  status: 'approved' | 'rejected';
  reason?: string;
}

export interface TimelineResponse {
  items: TimelineItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TimelineItem {
  type: 'post' | 'article';
  post?: PostItem;
  article?: ArticleSummary;
}

export interface CreatePostRequest {
  content: string;
  articleId?: string;
}

export interface CreateArticleRequest {
  title: string;
  content: string;
  excerpt?: string;
  coverUrl?: string;
  status?: 'published' | 'draft';
  images?: Array<{ imageUrl: string; sortOrder: number }>;
  attachments?: Array<{ fileName: string; fileUrl: string; fileSize?: number; fileType?: string; sortOrder: number }>;
}

export interface CreatePostResponse {
  id: string;
}

export interface CreateArticleResponse {
  id: string;
  slug: string;
}

export interface SearchResponse {
  posts: PostItem[];
  articles: ArticleSummary[];
  users: UserPublicProfile[];
  hashtags: HashtagItem[];
}

export interface UserArticlesResponse {
  items: ArticleSummary[];
}

export interface UserPostsResponse {
  items: PostItem[];
}

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  provider: string;
  role: UserRole;
  bio: string | null;
  createdAt: string;
}

export interface UserPreferences {
  notifyOnRead: boolean;
  notifyOnDelete: boolean;
  theme: ThemeMode;
  fontSize: FontSize;
}

export interface UserProfile extends AuthUser {
  notifyOnRead: boolean;
  notifyOnDelete: boolean;
  theme: ThemeMode;
  fontSize: FontSize;
}

export interface RegisterRequest {
  email: string;
  password: string;
  nickname: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface UpdateArticleRequest {
  title?: string;
  content?: string;
  excerpt?: string;
  coverUrl?: string;
  status?: 'published' | 'draft';
  images?: Array<{ imageUrl: string; sortOrder: number }>;
  attachments?: Array<{ fileName: string; fileUrl: string; fileSize?: number; fileType?: string; sortOrder: number }>;
}

export interface UpdateProfileRequest {
  nickname?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface UpdatePreferencesRequest {
  notifyOnRead?: boolean;
  notifyOnDelete?: boolean;
  theme?: ThemeMode;
  fontSize?: FontSize;
}

export interface SiteSettings {
  siteName: string;
  siteDescription: string | null;
  siteLogoUrl: string | null;
  allowRegister: boolean;
  googleLoginEnabled: boolean;
  registrationMode: RegistrationMode;
  siteAnnouncement: string | null;
  contentModerationEnabled: boolean;
}

export interface UpdateSiteSettingsRequest {
  siteName?: string;
  siteDescription?: string;
  siteLogoUrl?: string;
  allowRegister?: boolean;
  googleLoginEnabled?: boolean;
  registrationMode?: RegistrationMode;
  siteAnnouncement?: string;
  contentModerationEnabled?: boolean;
}

export interface AdminContentListResponse {
  posts: PostItem[];
  articles: ArticleSummary[];
  totalPosts: number;
  totalArticles: number;
}

// --- Social: Comments ---
export interface CommentItem {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  contentTypeId: string;
  contentId: string;
  parentId: string | null;
  body: string;
  isDeleted: boolean;
  createdAt: string;
  likeCount: number;
  isLiked?: boolean;
  replyCount?: number;
}

export interface CreateCommentRequest {
  contentType: CommentContentType;
  contentId: string;
  body: string;
  parentId?: string;
}

export interface CommentListResponse {
  items: CommentItem[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Social: Likes / Bookmarks / Reposts ---
export interface ToggleLikeRequest {
  contentType: CommentContentType;
  contentId: string;
}

export interface ToggleLikeResponse {
  liked: boolean;
  likeCount: number;
}

export interface ToggleBookmarkRequest {
  articleId: string;
}

export interface ToggleBookmarkResponse {
  bookmarked: boolean;
  bookmarkCount: number;
}

export interface ToggleRepostRequest {
  contentType: CommentContentType;
  contentId: string;
  quoteContent?: string;
}

export interface ToggleRepostResponse {
  reposted: boolean;
  repostCount: number;
}

export interface ToggleCommentLikeRequest {
  commentId: string;
}

export interface ToggleCommentLikeResponse {
  liked: boolean;
  likeCount: number;
}

// --- User Public Profile ---
export interface UserPublicProfile {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  createdAt: string;
  postCount: number;
  articleCount: number;
  likeCount: number;
  followerCount: number;
  followingCount: number;
  isBanned: boolean;
  isFollowing?: boolean;
}

export interface UserHomepageResponse {
  profile: UserPublicProfile;
  posts: PostItem[];
  articles: ArticleSummary[];
  reposts: PostItem[];
  likedPosts: PostItem[];
}

// --- Follow ---
export interface FollowUserRequest {
  userId: string;
}

export interface FollowUserResponse {
  following: boolean;
  followerCount: number;
}

export interface FollowListResponse {
  items: UserPublicProfile[];
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Notifications ---
export interface NotificationItem {
  id: string;
  type: NotificationType;
  actor: UserPublicProfile | null;
  contentType: CommentContentType | null;
  contentId: string | null;
  commentId: string | null;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MarkNotificationsReadRequest {
  ids?: string[];
  all?: boolean;
}

// --- Hashtags ---
export interface HashtagItem {
  id: string;
  tag: string;
  postCount: number;
  articleCount: number;
}

export interface HashtagTimelineResponse {
  tag: HashtagItem;
  items: TimelineItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TrendingHashtagsResponse {
  items: HashtagItem[];
}

// --- My Bookmarks ---
export interface BookmarkListResponse {
  items: ArticleSummary[];
}

// --- Google OAuth ---
export interface GoogleAuthUrlResponse {
  url: string;
}

export interface OAuthCallbackResponse {
  token: string;
  user: AuthUser;
  isNewUser: boolean;
}

// --- Direct Messages ---
export interface DMConversation {
  id: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  updatedAt: string;
}

export interface DMConversationListResponse {
  items: DMConversation[];
}

export interface DMMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
}

export interface DMMessageListResponse {
  items: DMMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface DMCreateConversationRequest {
  userId: string;
}

export interface DMCreateConversationResponse {
  conversationId: string;
}

export interface DMSendMessageRequest {
  content: string;
}

export interface DMSendMessageResponse {
  message: DMMessage;
}

export interface DMUnreadCountResponse {
  totalUnread: number;
}

export interface DMSearchUserResponse {
  items: AuthUser[];
}

// --- Meetings ---
export type MeetingStatus = 'scheduled' | 'ongoing' | 'ended' | 'cancelled';

export type MeetingParticipantStatus = 'invited' | 'online' | 'offline' | 'left';

export interface MeetingItem {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: MeetingStatus;
  isPublic: boolean;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  participantCount: number;
  code: string;
  createdAt: string;
}

export interface MeetingDetail {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: MeetingStatus;
  isPublic: boolean;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  participants: MeetingParticipant[];
  code: string;
  createdAt: string;
  updatedAt: string;
  isCurrentUserCreator: boolean;
  isCurrentUserParticipant: boolean;
}

export interface MeetingParticipant {
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  status: MeetingParticipantStatus;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface MeetingListResponse {
  items: MeetingItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MeetingDetailResponse {
  meeting: MeetingDetail;
  minutes: MeetingMinutes | null;
}

export interface CreateMeetingRequest {
  title: string;
  description?: string;
  startTime: string;
  durationMinutes: number;
  isPublic?: boolean;
  participantIds?: string[];
}

export interface CreateMeetingResponse {
  meetingId: string;
}

export interface UpdateMeetingRequest {
  title?: string;
  description?: string;
  startTime?: string;
  durationMinutes?: number;
  isPublic?: boolean;
  status?: MeetingStatus;
}

export interface AddParticipantsRequest {
  userIds: string[];
}

export interface MeetingChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
}

export interface MeetingChatListResponse {
  items: MeetingChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SendMeetingChatRequest {
  content: string;
}

export interface SendMeetingChatResponse {
  message: MeetingChatMessage;
}

export interface MeetingMinutes {
  id: string;
  meetingId: string;
  content: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

export interface UpdateMeetingMinutesRequest {
  content: string;
}

export interface UpdateMeetingMinutesResponse {
  minutes: MeetingMinutes;
}

export interface MeetingCodeLookupResponse {
  meetingId: string;
}

export interface MeetingParticipantsResponse {
  items: MeetingParticipant[];
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfigResponse {
  iceServers: IceServer[];
  iceTransportPolicy?: 'all' | 'relay';
}

export interface RoomParticipant {
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
  screenSharing: boolean;
}

// --- Access Codes ---
export type AccessCodeStatus = 'active' | 'disabled' | 'expired' | 'exhausted';

export interface AccessCodeItem {
  id: string;
  code: string;
  nickname: string;
  username: string | null;
  role: UserRole;
  avatarUrl: string | null;
  bio: string | null;
  status: AccessCodeStatus;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  lastUsedAt: string | null;
  note: string | null;
  appUserId: string | null;
  createdAt: string;
}

export interface CreateAccessCodeRequest {
  nickname: string;
  username?: string;
  role: UserRole;
  avatarUrl?: string;
  bio?: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  note?: string;
  code?: string;
}

export interface UpdateAccessCodeRequest {
  nickname?: string;
  username?: string;
  role?: UserRole;
  avatarUrl?: string;
  bio?: string;
  status?: AccessCodeStatus;
  expiresAt?: string | null;
  maxUses?: number | null;
  note?: string;
}

export interface AccessCodeListResponse {
  items: AccessCodeItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BatchCreateAccessCodeRequest {
  count: number;
  role?: UserRole;
  expiresAt?: string | null;
  maxUses?: number | null;
  note?: string;
}

export interface BatchCreateAccessCodeResponse {
  items: AccessCodeItem[];
}

export interface AccessCodeLoginRequest {
  code: string;
}

export interface AccessCodeLogItem {
  id: string;
  accessCodeId: string | null;
  attemptedCode?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorReason: string | null;
  loggedInUserId: string | null;
  createdAt: string;
}

export interface AccessCodeLogListResponse {
  items: AccessCodeLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SetPasswordRequest {
  password: string;
  oldPassword?: string;
}
