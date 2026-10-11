import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Heart,
  Repeat2,
  MessageCircle,
  UserPlus,
  AtSign,
  Bell,
  AlertTriangle,
  Ban,
  Mail,
  Video,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import { notificationsApi } from '@client/src/api';
import { useAuth } from '@client/src/hooks/useAuth';
import LoginGate from '@client/src/components/LoginGate';
import type {
  NotificationItem,
  NotificationType,
} from '@shared/api.interface';

dayjs.extend(relativeTime);

// ---------- Icon & Text helpers ----------

const NOTIFICATION_ICON: Record<NotificationType, typeof Heart> = {
  like: Heart,
  repost: Repeat2,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
  content_removed: AlertTriangle,
  user_banned: Ban,
  dm: Mail,
  meeting_invite: Video,
};

const NOTIFICATION_ICON_COLOR: Record<NotificationType, string> = {
  like: 'text-red-500',
  repost: 'text-green-500',
  comment: 'text-blue-500',
  follow: 'text-blue-500',
  mention: 'text-purple-500',
  content_removed: 'text-orange-500',
  user_banned: 'text-red-500',
  dm: 'text-blue-500',
  meeting_invite: 'text-blue-500',
};

const SYSTEM_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  'content_removed',
  'user_banned',
]);

function isSystemNotification(type: NotificationType): boolean {
  return SYSTEM_NOTIFICATION_TYPES.has(type);
}

function getNotificationText(
  type: NotificationType,
  actorName: string,
): string {
  const map: Record<NotificationType, string> = {
    like: '赞了你的内容',
    repost: '转发了你的内容',
    comment: '评论了你的内容',
    follow: '关注了你',
    mention: '提到了你',
    content_removed: '你的内容因违规被处理',
    user_banned: '你的账号已被封禁',
    dm: '给你发了一条私信',
    meeting_invite: '邀请你参加会议',
  };
  if (isSystemNotification(type)) {
    return map[type];
  }
  return `${actorName} ${map[type]}`;
}

// ---------- Notification Card ----------

interface NotificationCardProps {
  notification: NotificationItem;
  onClick: () => void;
}

const NotificationCard = ({
  notification,
  onClick,
}: NotificationCardProps) => {
  const Icon = NOTIFICATION_ICON[notification.type];
  const iconColor = NOTIFICATION_ICON_COLOR[notification.type];
  const isSystem = isSystemNotification(notification.type);
  const actorName = notification.actor?.nickname ?? '系统通知';
  const text = getNotificationText(notification.type, actorName);
  const avatarInitial = actorName.charAt(0)?.toUpperCase() ?? '?';
  const reason =
    notification.metadata && typeof notification.metadata.reason === 'string'
      ? notification.metadata.reason
      : undefined;

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      whileHover={{ backgroundColor: 'rgba(22, 24, 28, 0.5)' }}
      className={`relative flex gap-3 px-4 py-3.5 border-b border-gray-800 cursor-pointer ${
        !notification.isRead ? 'bg-blue-500/5' : ''
      }`}
      data-ai-section-type="card-list"
    >
      {/* Unread indicator */}
      {!notification.isRead && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
      )}

      {/* Icon */}
      <div className="flex-shrink-0 pt-1">
        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {/* Avatar / System icon */}
          <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
            {isSystem ? (
              <Icon className={`w-4 h-4 ${iconColor}`} />
            ) : notification.actor?.avatarUrl ? (
              <Image
                src={notification.actor.avatarUrl}
                alt={actorName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-gray-300">
                {avatarInitial}
              </span>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-100 leading-snug break-words">
              {isSystem ? (
                <span className="font-bold">{text}</span>
              ) : (
                <>
                  <span className="font-bold">{actorName}</span>{' '}
                  <span className="text-gray-400">
                    {text.replace(actorName, '').trim()}
                  </span>
                </>
              )}
            </p>
            {reason && (
              <p className="mt-1 text-sm text-gray-500 line-clamp-2 break-words">
                原因：{reason}
              </p>
            )}
            {notification.metadata && typeof (notification.metadata as Record<string, unknown>).text === 'string' && !reason && (
              <p className="mt-1 text-sm text-gray-500 line-clamp-2 break-words">
                {(notification.metadata as Record<string, unknown>).text as string}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {dayjs(notification.createdAt).fromNow()}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ---------- Skeleton ----------

const SkeletonCard = () => (
  <div className="flex gap-3 px-4 py-3.5 border-b border-gray-800">
    <div className="w-8 h-8 rounded-full shimmer flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-4 rounded w-2/3 shimmer" />
      <div className="h-3 rounded w-1/3 shimmer" />
    </div>
  </div>
);

// ---------- NotificationsPage ----------

const NotificationsPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await notificationsApi.getNotifications(
        nextCursor ?? undefined,
        20,
      );
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      logger.error('获取通知列表失败', err);
      setError('加载失败，请稍后重试');
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor]);

  useEffect(() => {
    if (authLoading || !user) return;
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    setLoading(true);
    setError(null);
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && !loadingMore && hasMore) {
          void loadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, loadMore]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingRead) return;
    setMarkingRead(true);
    try {
      await notificationsApi.markRead({ all: true });
      setItems((prev) =>
        prev.map((item: NotificationItem) => ({ ...item, isRead: true })),
      );
      toast.success('已全部标记为已读');
    } catch (err) {
      logger.error('标记已读失败', err);
      toast.error('操作失败，请稍后重试');
    } finally {
      setMarkingRead(false);
    }
  }, [markingRead]);

  const handleNotificationClick = useCallback(
    (notification: NotificationItem) => {
      // Mark as read locally
      setItems((prev) =>
        prev.map((item: NotificationItem) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );

      // Navigate to content if available
      if (notification.type === 'user_banned') {
        navigate('/settings');
      } else if (notification.type === 'dm') {
        const conversationId =
          notification.metadata &&
          typeof (notification.metadata as Record<string, unknown>).conversationId === 'string'
            ? (notification.metadata as Record<string, unknown>).conversationId as string
            : null;
        if (conversationId) {
          navigate(`/messages?conversationId=${conversationId}`);
        } else {
          navigate('/messages');
        }
      } else if (notification.contentId && notification.contentType) {
        if (notification.contentType === 'article') {
          navigate(`/article/${notification.contentId}`);
        } else if (notification.contentType === 'post') {
          navigate('/');
        }
      } else if (notification.type === 'follow' && notification.actor) {
        navigate(`/user/${notification.actor.id}`);
      } else if (notification.type === 'meeting_invite') {
        const meetingId = notification.contentId;
        if (meetingId) navigate(`/meetings/${meetingId}`);
      }
    },
    [navigate],
  );

  const unreadCount = items.filter(
    (item: NotificationItem) => !item.isRead,
  ).length;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        加载中...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginGate
        title="登录后查看通知"
        description="登录后即可接收点赞、评论、关注、私信等互动通知"
      />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-black/70 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-[700px] mx-auto flex items-center justify-between px-4 min-h-[52px]">
          <h1 className="text-xl font-bold text-gray-100">通知</h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className="text-sm text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50 min-h-[44px] px-2 flex items-center"
              data-ai-section-type="button"
            >
              {markingRead ? '处理中...' : '全部已读'}
            </button>
          )}
        </div>
      </header>

      {/* List */}
      <div className="max-w-[700px] mx-auto pb-24 md:pb-0">
        {loading && items.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error && items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无通知</p>
            <p className="text-sm mt-1">有新通知时会在这里显示</p>
          </div>
         ) : (
           <motion.div
             initial="hidden"
             animate="visible"
             variants={{
               hidden: {},
               visible: {
                 transition: { staggerChildren: 0.05 },
               },
             }}
           >
             {items.map((item: NotificationItem) => (
               <motion.div
                 key={item.id}
                 variants={{
                   hidden: { opacity: 0, x: -12 },
                   visible: { opacity: 1, x: 0 },
                 }}
                 transition={{ duration: 0.35, ease: 'easeOut' }}
               >
                 <NotificationCard
                   notification={item}
                   onClick={() => handleNotificationClick(item)}
                 />
               </motion.div>
             ))}
           </motion.div>
         )}

        {/* Loading more indicator */}
        <div ref={sentinelRef} className="py-6 text-center">
          {loadingMore && (
            <div className="flex items-center justify-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-0" />
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-1" />
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-2" />
            </div>
          )}
          {!hasMore && items.length > 0 && !loadingMore && (
            <p className="text-sm text-gray-600">没有更多了</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
