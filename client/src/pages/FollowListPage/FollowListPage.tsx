import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import FollowButton from '@client/src/components/FollowButton';
import { getFollowing, getFollowers } from '@client/src/api/follows';
import { useAuth } from '@client/src/hooks/useAuth';
import type { UserPublicProfile } from '@shared/api.interface';

// ---------- User Card ----------

interface UserCardProps {
  user: UserPublicProfile;
}

const UserCard = ({ user }: UserCardProps) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const handleClick = () => {
    navigate(`/user/${user.id}`);
  };

  const isOwnProfile = currentUser?.id === user.id;

  const avatarInitial = user.nickname?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 transition-colors cursor-pointer"
      onClick={handleClick}
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.nickname}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-base font-bold text-gray-300">
              {avatarInitial}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="font-bold text-gray-100 truncate">
            {user.nickname}
          </span>
          <span className="text-sm text-gray-500 truncate">
            @{user.id.slice(0, 8)}
          </span>
        </div>
        {user.bio && (
          <p className="mt-1 text-sm text-gray-400 line-clamp-2 break-words">
            {user.bio}
          </p>
        )}
        <div className="mt-1 flex gap-4 text-xs text-gray-500">
          <span>
            <span className="text-gray-100 font-medium">
              {user.followingCount ?? 0}
            </span>{' '}
            关注
          </span>
          <span>
            <span className="text-gray-100 font-medium">
              {user.followerCount ?? 0}
            </span>{' '}
            粉丝
          </span>
        </div>
      </div>

      {/* Follow button */}
      {!isOwnProfile && (
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <FollowButton
            userId={user.id}
            isFollowing={user.isFollowing}
            size="sm"
          />
        </div>
      )}
    </div>
  );
};

// ---------- Skeleton ----------

const SkeletonCard = () => (
  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
    <div className="w-12 h-12 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-800 rounded w-1/3 animate-pulse" />
      <div className="h-3 bg-gray-800 rounded w-1/4 animate-pulse" />
    </div>
  </div>
);

// ---------- FollowListPage ----------

type FollowTab = 'following' | 'followers';

const FollowListPage: React.FC = () => {
  const { id: userId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<UserPublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Determine active tab from URL
  const getTabFromPath = (): FollowTab => {
    if (location.pathname.includes('/followers')) return 'followers';
    return 'following';
  };

  const activeTab = getTabFromPath();

  const handleTabChange = (tab: FollowTab) => {
    if (!userId) return;
    navigate(`/user/${userId}/${tab}`);
  };

  const fetchList = useCallback(
    async (cursor?: string, isInitial: boolean = false) => {
      if (!userId) return;
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const response =
          activeTab === 'followers'
            ? await getFollowers(userId, cursor, 20)
            : await getFollowing(userId, cursor, 20);

        if (isInitial) {
          setUsers(response.items);
        } else {
          setUsers((prev) => [...prev, ...response.items]);
        }
        setNextCursor(response.nextCursor);
        setHasMore(response.hasMore);
      } catch (err) {
        logger.error(`获取${activeTab === 'followers' ? '粉丝' : '关注'}列表失败`, err);
        setError('加载失败，请稍后重试');
        setHasMore(false);
        toast.error('加载失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId, activeTab],
  );

  // Initial load when tab or userId changes
  useEffect(() => {
    setUsers([]);
    setNextCursor(null);
    setHasMore(true);
    void fetchList(undefined, true);
  }, [userId, activeTab, fetchList]);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          !loading &&
          !loadingMore &&
          hasMore
        ) {
          void fetchList(nextCursor ?? undefined, false);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, nextCursor, fetchList]);

  const tabs: { key: FollowTab; label: string }[] = [
    { key: 'following', label: '关注' },
    { key: 'followers', label: '粉丝' },
  ];

  const emptyText =
    activeTab === 'followers'
      ? { title: '暂无粉丝', desc: '还没有人关注该用户' }
      : { title: '暂无关注', desc: '该用户还没有关注任何人' };

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-black/70 backdrop-blur-md border-b border-gray-800">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold text-gray-100">
            {activeTab === 'followers' ? '粉丝' : '关注'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            @{userId?.slice(0, 8) ?? ''}
          </p>
        </div>
        {/* Tabs */}
        <div className="flex border-t border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex-1 relative py-4 text-sm font-medium transition-colors hover:bg-gray-900/50 ${
                activeTab === tab.key ? 'text-gray-100' : 'text-gray-500'
              }`}
              data-ai-section-type="button"
            >
              <span>{tab.label}</span>
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* List */}
      <div>
        {loading && users.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error && users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{error}</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-16 text-center text-gray-500">
            <UserIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">{emptyText.title}</p>
            <p className="text-sm mt-1">{emptyText.desc}</p>
          </div>
        ) : (
          users.map((u: UserPublicProfile) => (
            <UserCard key={u.id} user={u} />
          ))
        )}

        {/* Loading more indicator */}
        <div ref={sentinelRef} className="py-6 text-center">
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
              <span>加载中...</span>
            </div>
          )}
          {!hasMore && users.length > 0 && !loadingMore && (
            <p className="text-sm text-gray-600">没有更多了</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FollowListPage;
