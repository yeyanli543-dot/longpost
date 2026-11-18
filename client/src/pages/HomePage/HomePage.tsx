import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { FileText, Image as ImageIcon, Paperclip, LogIn, Megaphone } from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { postsApi, siteSettingsApi } from '@client/src/api';
import ActionButtons from '@client/src/components/ActionButtons';
import RichTextContent from '@client/src/components/RichTextContent';
import ErrorFallback from '@client/src/components/ErrorFallback';
import { useAuth } from '@client/src/hooks/useAuth';
import type { TimelineItem, PostItem, ArticleSummary, TimelineView } from '@shared/api.interface';
import ShareDialog from '@/components/share/ShareDialog';
import { WorkspaceModeSwitcher } from '@/components/WorkspaceMode/WorkspaceModeSwitcher';
import './home.css';

dayjs.extend(relativeTime);

// ---------- PostCard ----------

interface PostCardProps {
  post: PostItem;
}

const PostCard = ({ post }: PostCardProps) => {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const handlePostClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    navigate(`/post/${post.id}`);
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleCommentClick = () => {
    navigate(`/post/${post.id}#comments`);
  };

  return (
    <article
      onClick={handlePostClick}
      className="home-entry flex gap-3 border-b border-border cursor-pointer transition-colors"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Link
          to={`/user/${post.authorId}`}
          onClick={(e) => e.stopPropagation()}
          className="flex w-10 h-10 md:w-12 md:h-12 rounded-full bg-secondary items-center justify-center hover:opacity-80 transition-opacity"
        >
          <FileText className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <Link
            to={`/user/${post.authorId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-foreground truncate hover:underline"
          >
            {post.authorName}
          </Link>
          <span className="text-muted-foreground truncate">
            @{post.authorId.slice(0, 8)}
          </span>
          <span className="text-muted-foreground">·</span>
          <Link to={`/post/${post.id}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground flex-shrink-0 hover:underline" aria-label="查看这条动态">
            {dayjs(post.createdAt).locale('zh-cn').fromNow()}
          </Link>
        </div>

        {/* Post body */}
        <div className="mt-1 text-base leading-relaxed text-foreground">
          <RichTextContent content={post.content} />
        </div>

         {/* Linked article card */}
         {post.article && (
           <Link
             to={post.article.slug ? `/p/${post.article.slug}` : `/article/${post.article.id}`}
             onClick={(e) => e.stopPropagation()}
             className="block mt-3 border border-border rounded-xl p-4 hover:bg-muted/60 transition-colors"
           >
             <h4 className="font-semibold text-foreground truncate">
               {post.article.title}
             </h4>
             {post.article.excerpt && (
               <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                 {post.article.excerpt}
               </p>
             )}
             {(post.article.imageCount > 0 || post.article.attachmentCount > 0) && (
               <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
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
           </Link>
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

// ---------- ArticleCard ----------

interface ArticleCardProps {
  article: ArticleSummary;
}

const ArticleCard = ({ article }: ArticleCardProps) => {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const handleClick = () => {
    navigate(article.slug ? `/p/${article.slug}` : `/article/${article.id}`);
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleCommentClick = () => {
    navigate(article.slug ? `/p/${article.slug}` : `/article/${article.id}`);
  };

  return (
    <article
      onClick={handleClick}
      className="home-entry flex gap-3 border-b border-border cursor-pointer transition-colors"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Link
          to={`/user/${article.authorId}`}
          onClick={(e) => e.stopPropagation()}
          className="flex w-10 h-10 md:w-12 md:h-12 rounded-full bg-secondary items-center justify-center hover:opacity-80 transition-opacity"
        >
          <FileText className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <Link
            to={`/user/${article.authorId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-foreground truncate hover:underline"
          >
            {article.authorName}
          </Link>
          <span className="text-muted-foreground">发布了文章</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground flex-shrink-0">
            {dayjs(article.createdAt).locale('zh-cn').fromNow()}
          </span>
        </div>

        {/* Title */}
        <h3 className="mt-2 text-xl font-semibold text-foreground leading-snug">
          <Link to={article.slug ? `/p/${article.slug}` : `/article/${article.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
            {article.title}
          </Link>
        </h3>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="mt-2 text-base text-muted-foreground leading-relaxed line-clamp-3">
            {article.excerpt}
          </p>
        )}

        {/* Media indicators */}
        {(article.imageCount > 0 || article.attachmentCount > 0) && (
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
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
          <div className="mt-3 text-xs text-muted-foreground">
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

const SkeletonCard = () => (
  <div className="home-entry flex gap-3 border-b border-border" aria-hidden="true">
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
  const [reloadKey, setReloadKey] = useState(0);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

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

  const loadMore = useCallback(async (retry = false) => {
    if (loadingMore || (!hasMore && !retry)) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await postsApi.getTimeline(
        nextCursor ?? undefined,
        20,
        view,
      );
      if (requestId !== requestIdRef.current) return;
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      logger.error('加载时间线失败', err);
      setError('加载失败，请稍后重试');
      setHasMore(false);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [loadingMore, hasMore, nextCursor, view]);

  // Each view starts at the first page; ignore any slower response from the previous view.
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    setLoadingMore(false);
    setError(null);
    if (view === 'following' && !user) {
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void postsApi.getTimeline(undefined, 20, view).then((response) => {
      if (requestId !== requestIdRef.current) return;
      setItems(response.items);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    }).catch((err) => {
      if (requestId !== requestIdRef.current) return;
      logger.error('加载时间线失败', err);
      setError('加载失败，请稍后重试');
      setHasMore(false);
    }).finally(() => {
      if (requestId === requestIdRef.current) setLoading(false);
    });
    return () => { requestIdRef.current += 1; };
  }, [view, user?.id, reloadKey]);

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
    setReloadKey((value) => value + 1);
  };

  const viewTabs: { key: TimelineView; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'following', label: '关注' },
    { key: 'hot', label: '热门' },
  ];

  const navigate = useNavigate();

  const showFollowingLoginPrompt = view === 'following' && !user;

  return (
    <div className="home-page min-h-screen">
      <header className="home-header border-b border-border pt-safe">
        <div className="home-heading">
          <div className="home-heading-top">
            <p className="home-eyebrow">LONGPOST / 发现</p>
            <div className="md:hidden"><WorkspaceModeSwitcher compact /></div>
          </div>
          <h1>发现值得读的内容。</h1>
          <p className="home-intro">从一个想法，到一篇长文。</p>
        </div>
        <div className="home-tabs flex overflow-x-auto" role="group" aria-label="内容筛选">
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
              aria-pressed={view === tab.key}
              className={`home-tab flex-1 min-w-20 min-h-11 text-center cursor-pointer transition-colors ${
                view === tab.key
                  ? 'text-foreground font-semibold is-active'
                  : 'text-muted-foreground'
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
        <div className="px-4 py-8 text-center border-b border-border">
          <LogIn className="w-10 h-10 mx-auto mb-3 text-blue-500" />
          <p className="text-lg font-bold text-foreground">登录后查看关注动态</p>
          <p className="text-sm text-muted-foreground mt-1">
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
          !showFollowingLoginPrompt && <div className="home-empty text-center text-muted-foreground">这里还没有内容，稍后再来看看。</div>
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
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-0" />
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-1" />
              <span className="w-2 h-2 rounded-full bg-blue-500 dot-bounce dot-bounce-2" />
            </div>
          )}
         {!hasMore && items.length > 0 && !loadingMore && error && (
           <div className="py-4 px-4 text-center">
             <button
               onClick={() => {
                 void loadMore(true);
               }}
               className="text-sm text-[#1d9bf0] hover:underline"
               data-ai-section-type="button"
             >
               {error}，点击重试
             </button>
           </div>
         )}
          {!hasMore && items.length > 0 && !loadingMore && !error && (
            <p className="text-sm text-muted-foreground">已经看到最后了</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
