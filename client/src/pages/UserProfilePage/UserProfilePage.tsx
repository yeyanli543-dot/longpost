import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  User as UserIcon,
  Calendar,
  FileText,
  Bookmark,
  Heart,
  Image as ImageIcon,
  Paperclip,
  ShieldCheck,
  Settings,
  Mail,
} from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import ActionButtons from '@client/src/components/ActionButtons';
import FollowButton from '@client/src/components/FollowButton';
import RichTextContent from '@client/src/components/RichTextContent';
import { authApi, postsApi, dmApi } from '@client/src/api';
import { useAuth } from '@client/src/hooks/useAuth';
import type {
  UserPublicProfile,
  PostItem,
  ArticleSummary,
} from '@shared/api.interface';
import ShareDialog from '@/components/share/ShareDialog';

dayjs.extend(relativeTime);

type TabType = 'posts' | 'articles' | 'reposts' | 'bookmarks' | 'likes';

// ---------- Profile Post Card (no avatar) ----------

interface ProfilePostCardProps {
  post: PostItem;
}

const ProfilePostCard = ({ post }: ProfilePostCardProps) => {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const handleArticleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.article) {
      navigate(`/article/${post.article.id}`);
    }
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleCommentClick = () => {
    if (post.article) {
      navigate(`/article/${post.article.id}`);
    } else {
      toast.info('帖子评论功能即将上线');
    }
  };

  return (
    <article
      className="px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 transition-colors cursor-pointer"
      data-ai-section-type="card-list"
    >
      {/* Header */}
      <div className="flex items-baseline gap-1 text-sm">
        <span className="font-bold text-gray-100 truncate">
          {post.authorName}
        </span>
        <span className="text-gray-500 truncate">
          @{post.authorId.slice(0, 8)}
        </span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-500 flex-shrink-0">
          {dayjs(post.createdAt).fromNow()}
        </span>
      </div>

      {/* Post body */}
      <div className="mt-1 text-base leading-relaxed text-gray-100">
        <RichTextContent content={post.content} />
      </div>

      {/* Linked article card */}
      {post.article && (
        <div
          onClick={handleArticleClick}
          className="mt-3 border border-gray-800 rounded-xl p-3 hover:bg-gray-900/50 transition-colors cursor-pointer"
        >
          <h4 className="font-bold text-gray-100 truncate">
            {post.article.title}
          </h4>
          {post.article.excerpt && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {post.article.excerpt}
            </p>
          )}
          {(post.article.imageCount > 0 || post.article.attachmentCount > 0) && (
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              {post.article.imageCount > 0 && (
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" />
                  {post.article.imageCount}张图
                </span>
              )}
              {post.article.attachmentCount > 0 && (
                <span className="flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  {post.article.attachmentCount}个附件
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <ActionButtons
        contentType="post"
        contentId={post.id}
        commentCount={post.commentCount}
        likeCount={post.likeCount}
        repostCount={post.repostCount}
        isLiked={post.isLiked}
        isReposted={post.isReposted}
        onCommentClick={handleCommentClick}
        onShareClick={handleShare}
      />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={{
          title: post.article ? post.article.title : `${post.authorName} 的动态`,
          url: resolveAppUrl(post.article ? (post.article.slug ? `/p/${post.article.slug}` : `/article/${post.article.id}`) : `/post/${post.id}`),
          summary: post.article ? (post.article.excerpt || post.content) : post.content,
          authorName: post.authorName,
          coverUrl: post.article?.coverUrl || null,
        }}
      />
    </article>
  );
};

// ---------- Profile Article Card (no avatar) ----------

interface ProfileArticleCardProps {
  article: ArticleSummary;
}

const ProfileArticleCard = ({ article }: ProfileArticleCardProps) => {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const handleClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleCommentClick = () => {
    navigate(`/article/${article.id}`);
  };

  return (
    <article
      onClick={handleClick}
      className="px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 transition-colors cursor-pointer"
      data-ai-section-type="card-list"
    >
      {/* Header */}
      <div className="flex items-baseline gap-1 text-sm">
        <span className="font-bold text-gray-100 truncate">
          {article.authorName}
        </span>
        <span className="text-gray-500">发布了文章</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-500 flex-shrink-0">
          {dayjs(article.createdAt).fromNow()}
        </span>
      </div>

      {/* Title */}
      <h3 className="mt-2 text-xl font-bold text-gray-100 leading-snug">
        {article.title}
      </h3>

      {/* Excerpt */}
      {article.excerpt && (
        <p className="mt-2 text-base text-gray-400 leading-relaxed line-clamp-3">
          {article.excerpt}
        </p>
      )}

      {/* Media indicators */}
      {(article.imageCount > 0 || article.attachmentCount > 0) && (
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
          {article.imageCount > 0 && (
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              {article.imageCount}张配图
            </span>
          )}
          {article.attachmentCount > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" />
              {article.attachmentCount}个附件
            </span>
          )}
        </div>
      )}

      {/* Read count */}
      <div className="mt-3 text-xs text-gray-500">
        阅读 · {article.readCount} 次
      </div>

      {/* Action buttons */}
      <ActionButtons
        contentType="article"
        contentId={article.id}
        commentCount={article.commentCount}
        likeCount={article.likeCount}
        repostCount={article.repostCount}
        isLiked={article.isLiked}
        isReposted={article.isReposted}
        bookmarkCount={article.bookmarkCount}
        isBookmarked={article.isBookmarked}
        showBookmark
        onCommentClick={handleCommentClick}
        onShareClick={handleShare}
      />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={{
          title: article.title,
          url: resolveAppUrl(article.slug ? `/p/${article.slug}` : `/article/${article.id}`),
          summary: article.excerpt || '',
          authorName: article.authorName,
          coverUrl: article.coverUrl || null,
        }}
      />
    </article>
  );
};

// ---------- Skeleton ----------

const ProfileSkeleton = () => (
  <div className="px-4 py-3 border-b border-gray-800">
    <div className="h-4 bg-gray-800 rounded w-1/4 animate-pulse" />
    <div className="mt-2 h-5 bg-gray-800 rounded w-full animate-pulse" />
    <div className="mt-2 h-5 bg-gray-800 rounded w-4/5 animate-pulse" />
  </div>
);

// ---------- UserProfilePage ----------

const UserProfilePage = () => {
  const { id: userId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [reposts, setReposts] = useState<PostItem[]>([]);
  const [likedPosts, setLikedPosts] = useState<PostItem[]>([]);
  const [bookmarks, setBookmarks] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('posts');

  const isOwnProfile = currentUser?.id === userId;

  const loadUserHomepage = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.getUserHomepage(userId);
      setProfile(response.profile);
      setPosts(response.posts);
      setArticles(response.articles);
      setReposts(response.reposts ?? []);
      setLikedPosts(response.likedPosts ?? []);
    } catch (err) {
      setError('加载用户资料失败，请稍后重试');
      logger.error('加载用户资料失败', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadBookmarks = useCallback(async () => {
    if (!isOwnProfile) return;
    setBookmarksLoading(true);
    try {
      const response = await authApi.getMyBookmarks();
      setBookmarks(response.items);
    } catch (err) {
      logger.error('加载收藏失败', err);
      toast.error('加载收藏失败');
    } finally {
      setBookmarksLoading(false);
    }
  }, [isOwnProfile]);

  useEffect(() => {
    void loadUserHomepage();
  }, [loadUserHomepage]);

  useEffect(() => {
    if (activeTab === 'bookmarks' && isOwnProfile && bookmarks.length === 0 && !bookmarksLoading) {
      void loadBookmarks();
    }
  }, [activeTab, isOwnProfile, bookmarks.length, bookmarksLoading, loadBookmarks]);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'posts', label: '帖子', count: profile?.postCount ?? posts.length },
    { key: 'articles', label: '文章', count: profile?.articleCount ?? articles.length },
    { key: 'reposts', label: '转发', count: reposts.length },
  ];

  if (isOwnProfile) {
    tabs.push({ key: 'bookmarks', label: '收藏', count: bookmarks.length });
    tabs.push({ key: 'likes', label: '点赞', count: likedPosts.length });
  }

  const renderContent = () => {
    if (activeTab === 'posts') {
      if (loading) {
        return (
          <>
            <ProfileSkeleton />
            <ProfileSkeleton />
            <ProfileSkeleton />
          </>
        );
      }
      if (posts.length === 0) {
        return (
          <div className="px-4 py-16 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无帖子</p>
            <p className="text-sm mt-1">该用户还没有发布过帖子</p>
          </div>
        );
      }
      return posts.map((post: PostItem) => (
        <ProfilePostCard key={post.id} post={post} />
      ));
    }

    if (activeTab === 'articles') {
      if (loading) {
        return (
          <>
            <ProfileSkeleton />
            <ProfileSkeleton />
            <ProfileSkeleton />
          </>
        );
      }
      if (articles.length === 0) {
        return (
          <div className="px-4 py-16 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无文章</p>
            <p className="text-sm mt-1">该用户还没有发布过长文</p>
          </div>
        );
      }
      return articles.map((article: ArticleSummary) => (
        <ProfileArticleCard key={article.id} article={article} />
      ));
    }

    if (activeTab === 'reposts') {
      if (loading) {
        return (
          <>
            <ProfileSkeleton />
            <ProfileSkeleton />
            <ProfileSkeleton />
          </>
        );
      }
      if (reposts.length === 0) {
        return (
          <div className="px-4 py-16 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无转发</p>
            <p className="text-sm mt-1">该用户还没有转发过内容</p>
          </div>
        );
      }
      return reposts.map((post: PostItem) => (
        <ProfilePostCard key={post.id} post={post} />
      ));
    }

    if (activeTab === 'bookmarks' && isOwnProfile) {
      if (bookmarksLoading) {
        return (
          <>
            <ProfileSkeleton />
            <ProfileSkeleton />
            <ProfileSkeleton />
          </>
        );
      }
      if (bookmarks.length === 0) {
        return (
          <div className="px-4 py-16 text-center text-gray-500">
            <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无收藏</p>
            <p className="text-sm mt-1">你还没有收藏任何文章</p>
          </div>
        );
      }
      return bookmarks.map((article: ArticleSummary) => (
        <ProfileArticleCard key={article.id} article={article} />
      ));
    }

    if (activeTab === 'likes' && isOwnProfile) {
      if (loading) {
        return (
          <>
            <ProfileSkeleton />
            <ProfileSkeleton />
            <ProfileSkeleton />
          </>
        );
      }
      if (likedPosts.length === 0) {
        return (
          <div className="px-4 py-16 text-center text-gray-500">
            <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无点赞</p>
            <p className="text-sm mt-1">你还没有点赞过任何帖子</p>
          </div>
        );
      }
      return likedPosts.map((post: PostItem) => (
        <ProfilePostCard key={post.id} post={post} />
      ));
    }

    return null;
  };

  if (error && !profile) {
    return (
      <div className="flex-1 min-w-0">
        <div className="px-4 py-16 text-center text-gray-500">
          <p className="text-lg">{error}</p>
          <button
            onClick={() => void loadUserHomepage()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
            data-ai-section-type="button"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      {/* Profile header */}
      <div className="relative">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-gray-800 to-gray-900" />

        {/* Avatar */}
        <div className="px-4 -mt-12">
          <div className="w-24 h-24 rounded-full bg-gray-700 border-4 border-black flex items-center justify-center overflow-hidden">
            {profile?.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={profile.nickname}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-10 h-10 text-gray-400" />
            )}
          </div>
        </div>

        {/* Profile info */}
        <div className="px-4 pt-3 pb-4">
          {/* Action button (right-aligned, above name on desktop) */}
          {!loading && profile && (
            <div className="flex justify-end mb-2">
              {isOwnProfile ? (
                 <button
                   onClick={() => navigate('/settings')}
                   className="px-5 min-h-[40px] md:min-h-[44px] text-sm font-bold rounded-full border border-gray-600 text-gray-100 hover:bg-gray-800 transition-colors flex items-center gap-2"
                   data-ai-section-type="button"
                 >
                   <Settings className="w-4 h-4" />
                   编辑资料
                 </button>
              ) : (
                <div className="flex items-center gap-2">
                   {currentUser && (
                     <button
                       onClick={async () => {
                         try {
                           const response = await dmApi.createConversation(profile.id);
                           navigate(`/messages?conversationId=${response.conversationId}`);
                         } catch (err) {
                           logger.error('创建私信会话失败', err);
                           navigate('/messages');
                         }
                       }}
                       className="px-4 min-h-[40px] md:min-h-[44px] text-sm font-bold rounded-full border border-gray-600 text-gray-100 hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                       data-ai-section-type="button"
                     >
                       <Mail className="w-4 h-4" />
                       <span className="hidden sm:inline">发私信</span>
                     </button>
                   )}
                  <FollowButton
                    userId={profile.id}
                    isFollowing={profile.isFollowing}
                    size="md"
                  />
                </div>
              )}
            </div>
          )}

          {loading && !profile ? (
            <div className="space-y-2">
              <div className="h-7 bg-gray-800 rounded w-1/3 animate-pulse" />
              <div className="h-5 bg-gray-800 rounded w-1/4 animate-pulse" />
              <div className="h-5 bg-gray-800 rounded w-2/3 animate-pulse" />
              <div className="h-4 bg-gray-800 rounded w-1/4 animate-pulse" />
            </div>
          ) : profile ? (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-100">
                  {profile.nickname}
                </h1>
                {profile.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-400 bg-blue-500/10 rounded-full border border-blue-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    管理员
                  </span>
                )}
              </div>
              <p className="text-gray-500 mt-0.5">
                @{profile.id.slice(0, 8)}
              </p>

              {profile.bio && (
                <p className="mt-2 text-gray-200 leading-relaxed break-words">
                  {profile.bio}
                </p>
              )}

              <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  加入于 {dayjs(profile.createdAt).format('YYYY年MM月')}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm">
                <button
                  onClick={() => navigate(`/user/${profile.id}/following`)}
                  className="hover:underline transition-colors"
                  data-ai-section-type="button"
                >
                  <span className="font-bold text-gray-100">
                    {profile.followingCount}
                  </span>
                  <span className="text-gray-500 ml-1">关注</span>
                </button>
                <button
                  onClick={() => navigate(`/user/${profile.id}/followers`)}
                  className="hover:underline transition-colors"
                  data-ai-section-type="button"
                >
                  <span className="font-bold text-gray-100">
                    {profile.followerCount}
                  </span>
                  <span className="text-gray-500 ml-1">粉丝</span>
                </button>
                <span className="text-gray-100">
                  <span className="font-bold">{profile.postCount}</span>
                  <span className="text-gray-500 ml-1">帖子</span>
                </span>
                <span className="text-gray-100">
                  <span className="font-bold">{profile.articleCount}</span>
                  <span className="text-gray-500 ml-1">文章</span>
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 relative min-w-16 min-h-[44px] text-sm font-medium transition-colors hover:bg-gray-900/50 flex-shrink-0 px-3 ${
              activeTab === tab.key
                ? 'text-gray-100'
                : 'text-gray-500'
            }`}
            data-ai-section-type="button"
          >
            <span>{tab.label}</span>
            <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content list */}
      <div className="pb-24 md:pb-0">{renderContent()}</div>
    </div>
  );
};

export default UserProfilePage;
