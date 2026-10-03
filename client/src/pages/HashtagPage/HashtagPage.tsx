import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import PostCard from '@client/src/components/PostCard';
import ArticleCard from '@client/src/components/ArticleCard';
import { hashtagsApi } from '@client/src/api';
import type {
  TimelineItem,
  HashtagItem,
} from '@shared/api.interface';

// ---------- Skeleton ----------

const SkeletonCard = () => (
  <div className="flex gap-3 px-4 py-3 border-b border-gray-800">
    <div className="w-12 h-12 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-800 rounded w-1/3 animate-pulse" />
      <div className="h-4 bg-gray-800 rounded w-full animate-pulse" />
      <div className="h-4 bg-gray-800 rounded w-5/6 animate-pulse" />
    </div>
  </div>
);

// ---------- HashtagPage ----------

const HashtagPage: React.FC = () => {
  const { tag } = useParams<{ tag: string }>();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [hashtagInfo, setHashtagInfo] = useState<HashtagItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !tag) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await hashtagsApi.getHashtagTimeline(
        tag,
        nextCursor ?? undefined,
        20,
      );
      setHashtagInfo(response.tag);
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      logger.error(`获取话题 #${tag} 时间线失败`, err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setError('该话题不存在');
      } else {
        setError('加载失败，请稍后重试');
      }
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor, tag]);

  // Initial load when tag changes
  useEffect(() => {
    if (!tag) return;
    setItems([]);
    setHashtagInfo(null);
    setNextCursor(null);
    setHasMore(true);
    setLoading(true);
    setError(null);
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

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

  const totalCount = hashtagInfo
    ? hashtagInfo.postCount + hashtagInfo.articleCount
    : 0;

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-black/70 backdrop-blur-md border-b border-gray-800">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold text-gray-100">
            #{decodeURIComponent(tag ?? '')}
          </h1>
          {hashtagInfo && (
            <p className="text-sm text-gray-500 mt-1">
              {totalCount.toLocaleString()} 条内容
            </p>
          )}
        </div>
      </header>

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
          <div className="p-8 text-center text-gray-500">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center text-gray-500">
            <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">暂无相关内容</p>
            <p className="text-sm mt-1">
              该话题下还没有内容，快来发布第一条吧
            </p>
          </div>
        ) : (
          items.map((item: TimelineItem, index: number) =>
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
        <div ref={sentinelRef} className="py-6 text-center">
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
              <span>加载中...</span>
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

export default HashtagPage;
