import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { FileText, Image as ImageIcon, Paperclip, LogIn, Megaphone } from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { postsApi, siteSettingsApi } from '@client/src/api';
import ActionButtons from '@client/src/components/ActionButtons';
import RichTextContent from '@client/src/components/RichTextContent';
import ErrorFallback from '@client/src/components/ErrorFallback';
import { useAuth } from '@client/src/hooks/useAuth';
import type { TimelineItem, PostItem, ArticleSummary, TimelineView } from '@shared/api.interface';

dayjs.extend(relativeTime);

// ---------- PostCard ----------

interface PostCardProps {
  post: PostItem;
}

const PostCard = ({ post }: PostCardProps) => {
  const navigate = useNavigate();

  const handleArticleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.article) {
      navigate(`/article/${post.article.id}`);
    }
  };

  const handleShare = async () => {
    const shareUrl = resolveAppUrl(
      post.article ? `/article/${post.article.id}` : `/post/${post.id}`,
    );
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('链接已复制');
    } catch (err) {
      logger.error('复制链接失败', err);
      toast.error('复制失败');
    }
  };

  const handleCommentClick = () => {
    if (post.article) {
      navigate(`/article/${post.article.id}`);
    } else {
      toast.info('帖子评论功能即将上线');
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      whileHover={{ backgroundColor: 'rgba(22, 24, 28, 0.5)' }}
      className="flex gap-3 px-4 py-3 border-b border-gray-800 cursor-pointer"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Link
          to={`/user/${post.authorId}`}
          className="block w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-700 flex items-center justify-center hover:opacity-80 transition-opacity"
        >
          <FileText className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <Link
            to={`/user/${post.authorId}`}
            className="font-bold text-gray-100 truncate hover:underline"
          >
            {post.authorName}
          </Link>
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
      </div>
    </motion.article>
  );
};

// ---------- ArticleCard ----------

interface ArticleCardProps {
  article: ArticleSummary;
}

const ArticleCard = ({ article }: ArticleCardProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleShare = async () => {
    try {
      const shareUrl = resolveAppUrl(`/article/${article.id}`);
      await navigator.clipboard.writeText(shareUrl);
      toast.success('文章链接已复制');
    } catch (err) {
      logger.error('复制链接失败', err);
      toast.error('复制失败');
    }
  };

  const handleCommentClick = () => {
    navigate(`/article/${article.id}`);
  };

  return (
    <motion.article
      onClick={handleClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      whileHover={{ backgroundColor: 'rgba(22, 24, 28, 0.5)' }}
      className="flex gap-3 px-4 py-3 border-b border-gray-800 cursor-pointer"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Link
          to={`/user/${article.authorId}`}
          className="block w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-700 flex items-center justify-center hover:opacity-80 transition-opacity"
        >
          <FileText className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <Link
            to={`/user/${article.authorId}`}
            className="font-bold text-gray-100 truncate hover:underline"
          >
            {article.authorName}
          </Link>
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
      </div>
    </motion.article>
  );
};

// ---------- Skeleton ----------

const SkeletonCard = () => (
  <div className="flex gap-3 px-4 py-3 border-b border-gray-800">
    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full shimmer flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-4 rounded w-1/3 shimmer" />
      <div className="h-4 rounded w-full shimmer" />
      <div className="h-4 rounded w-5/6 shimmer" />
    </div>
  </div>
);

// ---------- HomePage ----------

const HomePage = () => {
  const { user } = useAuth();
  const [view, setView] = useState<TimelineView>('all');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [announcementLoading, setAnnouncementLoading] = useState(true);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch site settings for announcement
  useEffect(() => {
    const fetchSiteSettings = async () => {
      try {
        const settings = await siteSettingsApi.getSiteSettings();
        if (settings.siteAnnouncement && settings.siteAnnouncement.trim()) {
          setAnnouncement(settings.siteAnnouncement);
        }
      } catch (err) {
        // Silently ignore errors - don't show announcement bar on failure
        logger.error('获取站点设置失败', err);
      } finally {
        setAnnouncementLoading(false);
      }
    };
    void fetchSiteSettings();
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await postsApi.getTimeline(
        nextCursor ?? undefined,
        20,
        view,
      );
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      logger.error('加载时间线失败', err);
      setError('加载失败，请稍后重试');
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor, view]);

  // Reset and reload when view changes
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    setLoading(true);
    setError(null);
    void loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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

  const handleRetry = () => {
    setNextCursor(null);
    setHasMore(true);
    setLoading(true);
    setError(null);
    void loadMore();
  };

  const viewTabs: { key: TimelineView; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'following', label: '关注' },
    { key: 'hot', label: '热门' },
  ];

  const navigate = useNavigate();

  const showFollowingLoginPrompt = view === 'following' && !user;

  return (
    <div className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-black/70 backdrop-blur-md border-b border-gray-800">
        <div className="px-4 py-2.5 md:py-3">
          <h1 className="text-lg md:text-xl font-bold text-gray-100">首页</h1>
        </div>
        {/* View tabs */}
        <div className="flex border-t border-gray-800 overflow-x-auto md:overflow-visible">
          {viewTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.key === 'following' && !user) {
                  setView(tab.key);
                  return;
                }
                setView(tab.key);
              }}
              className={`flex-1 min-w-20 min-h-11 md:min-h-0 py-3 md:py-4 text-center cursor-pointer transition-colors hover:bg-[#16181c] ${
                view === tab.key
                  ? 'text-gray-100 font-bold border-b-2 border-[#1d9bf0]'
                  : 'text-gray-500 border-b-2 border-transparent'
              }`}
              data-ai-section-type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Announcement bar */}
      {!announcementLoading && announcement && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20">
          <Megaphone className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm text-blue-400">{announcement}</span>
        </div>
      )}

      {/* Following login prompt */}
      {showFollowingLoginPrompt && (
        <div className="px-4 py-8 text-center border-b border-gray-800">
          <LogIn className="w-10 h-10 mx-auto mb-3 text-blue-500" />
          <p className="text-lg font-bold text-gray-100">登录后查看关注动态</p>
          <p className="text-sm text-gray-500 mt-1">
            登录后可查看你关注的用户发布的内容
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full transition-colors"
            data-ai-section-type="button"
          >
            登录
          </button>
        </div>
      )}

      {/* Timeline */}
      <div>
        {loading && items.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
         ) : error && items.length === 0 ? (
           <ErrorFallback message={error} onRetry={handleRetry} />
         ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无内容</div>
        ) : (
          items.map((item, index) =>
            item.type === 'post' && item.post ? (
              <PostCard key={`post-${item.post.id}-${index}`} post={item.post} />
            ) : item.type === 'article' && item.article ? (
              <ArticleCard
                key={`article-${item.article.id}-${index}`}
                article={item.article}
              />
            ) : null,
          )
        )}

        {/* Loading more indicator */}
        <div ref={sentinelRef} className="py-6 pb-24 md:pb-6 text-center">
          {loadingMore && (
            <div className="flex items-center justify-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-0" />
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-1" />
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-2" />
            </div>
          )}
         {!hasMore && items.length > 0 && !loadingMore && error && (
           <div className="py-4 px-4 text-center">
             <button
               onClick={() => {
                 setHasMore(true);
                 setError(null);
                 void loadMore();
               }}
               className="text-sm text-[#1d9bf0] hover:underline"
               data-ai-section-type="button"
             >
               {error}，点击重试
             </button>
           </div>
         )}
          {!hasMore && items.length > 0 && !loadingMore && !error && (
            <p className="text-sm text-gray-600">没有更多了</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
