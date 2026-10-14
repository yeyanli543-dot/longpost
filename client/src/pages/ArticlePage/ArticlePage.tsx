import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { resolveAppUrl } from '@/lib/utils';

import { articlesApi } from '@client/src/api';
import ActionButtons from '@client/src/components/ActionButtons';
import CommentsSection from '@client/src/components/CommentsSection';
import type { ArticleDetail, PostItem } from '@shared/api.interface';
import NotFound from '@client/src/pages/NotFound/NotFound';
import dayjs from 'dayjs';

import ReadingProgressBar from './ReadingProgressBar';
import ArticleHeader from './ArticleHeader';
import ArticleContent from './ArticleContent';
import ReadingToolbar from './ReadingToolbar';
import ShareMenu from './ShareMenu';
import ShareDialog from '@/components/share/ShareDialog';

type FontSize = 'small' | 'medium' | 'large';
type Theme = 'dark' | 'light';

function isUUID(str: string): boolean {
  return str.includes('-');
}

export default function ArticlePage() {
  const { id, slug } = useParams<{ id?: string; slug?: string }>();
  const navigate = useNavigate();

  const param = id ?? slug;
  const isSlugMode = !!slug && !id;

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [shareDialogOpen, setShareDialogOpen] = useState<boolean>(false);

  // Reading preferences
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lp-font-size') : null;
    return (saved as FontSize) || 'medium';
  });
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lp-theme') : null;
    return (saved as Theme) || 'dark';
  });

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem('lp-font-size', size);
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('lp-theme', t);
    if (t === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
    return () => {
      document.documentElement.classList.remove('light-mode');
    };
  }, [theme]);

  const fetchArticle = async () => {
    if (!param) return;
    setLoading(true);
    setError(null);
    setIsNotFound(false);
    try {
      let data: ArticleDetail;
      if (isSlugMode || !isUUID(param)) {
        data = await articlesApi.getArticleBySlug(param);
      } else {
        data = await articlesApi.getArticle(param);
      }
      setArticle(data);
    } catch (err) {
      logger.error('加载文章失败', err);
      const status: number | undefined = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        setIsNotFound(true);
      } else {
        setError('文章加载失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (!article) return;
    setShareDialogOpen(true);
  };

  useEffect(() => {
    fetchArticle();
  }, [param]);

  if (isNotFound) {
    return <NotFound />;
  }

  if (loading) {
    return <ArticleSkeleton />;
  }

  if (error || !article) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-[#71767b]">
        <AlertCircle className="w-10 h-10" />
        <p>{error || '加载失败'}</p>
        <button
          onClick={fetchArticle}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#1d9bf0] rounded-full hover:bg-[#1a8cd8] transition-colors"
          data-ai-section-type="button"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReadingProgressBar />
      <ReadingToolbar fontSize={fontSize} setFontSize={setFontSize} theme={theme} setTheme={setTheme} />

      {/* Top nav */}
      <header className="sticky top-0 z-10 flex items-center h-[calc(3.5rem+var(--safe-area-inset-top))] pt-safe px-4 bg-background/80 backdrop-blur border-b border-border">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-[#16181c] transition-colors"
          aria-label="返回"
          data-ai-section-type="button"
        >
          <ArrowLeft className="w-5 h-5 text-[#e7e9ea]" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-base font-semibold text-[#e7e9ea] truncate">{article.authorName}</span>
        </div>
        <ShareMenu
          article={article}
          trigger={
            <button
              className="p-2 -mr-2 rounded-full hover:bg-[#16181c] transition-colors group"
              aria-label="分享"
              title="分享"
              data-ai-section-type="button"
            >
              <Share2 className="w-5 h-5 text-[#71767b] group-hover:text-[#1d9bf0]" />
            </button>
          }
        />
      </header>

      {/* Article body */}
      <article className="max-w-[700px] mx-auto px-4 py-8 sm:px-4">
        <ArticleHeader article={article} />
        <ArticleContent article={article} fontSize={fontSize} />

        {/* Action bar */}
        <div className="py-4 border-y border-[#2f3336]">
          <ActionButtons
            contentType="article"
            contentId={article.id}
            likeCount={article.likeCount}
            commentCount={article.commentCount}
            repostCount={article.repostCount}
            bookmarkCount={article.bookmarkCount}
            showBookmark={true}
            isBookmarked={article.isBookmarked}
            isLiked={article.isLiked}
            isReposted={article.isReposted}
            onCommentClick={() => {
              const el = document.getElementById('comments-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            onShareClick={handleShare}
          />
        </div>

        {/* Comments */}
        <section id="comments-section" className="pt-2 pb-8">
          <CommentsSection contentType="article" contentId={article.id} />
        </section>

        {/* Linked posts */}
        {article.linkedPosts && article.linkedPosts.length > 0 && (
          <section
            className="pt-6 border-t border-[#2f3336]"
            data-ai-section-type="card-list"
          >
            <h2 className="text-xl font-bold mb-4 text-[#e7e9ea]">相关帖子</h2>
            <div className="space-y-0">
              {article.linkedPosts.map((post: PostItem) => (
                <div
                  key={post.id}
                  className="py-4 border-b border-[#2f3336] last:border-b-0 hover:bg-[#0c0d0f] transition-colors px-2 -mx-2"
                >
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#2f3336] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-semibold text-[#e7e9ea] truncate">
                          {post.authorName}
                        </span>
                        <span className="text-[#71767b]">@{post.authorName}</span>
                        <span className="text-[#71767b]">·</span>
                        <span className="text-[#71767b]">
                          {dayjs(post.createdAt).format('MM-DD')}
                        </span>
                      </div>
                      <p className="text-base text-[#e7e9ea] mt-1 whitespace-pre-wrap break-words">
                        {post.content}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </article>

      {article && (
        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          payload={{
            title: article.title,
            url: article.slug
              ? resolveAppUrl(`/p/${article.slug}`)
              : resolveAppUrl(`/article/${article.id}`),
            summary: article.excerpt || article.content.slice(0, 80),
            authorName: article.authorName,
            coverUrl: article.coverUrl || null,
          }}
        />
      )}
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <ReadingProgressBar />
      <header className="sticky top-0 z-10 flex items-center h-[calc(3.5rem+var(--safe-area-inset-top))] pt-safe px-4 bg-background/80 backdrop-blur border-b border-border">
        <div className="w-9 h-9 rounded-full bg-[#2f3336] animate-pulse" />
        <div className="flex-1 flex justify-center">
          <div className="h-4 w-20 bg-[#2f3336] rounded animate-pulse" />
        </div>
        <div className="w-9" />
      </header>

      <div className="max-w-[700px] mx-auto px-4 py-8">
        <div className="h-8 w-3/4 bg-[#2f3336] rounded animate-pulse mb-4" />
        <div className="h-8 w-1/2 bg-[#2f3336] rounded animate-pulse mb-6" />

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[#2f3336] animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-24 bg-[#2f3336] rounded animate-pulse" />
            <div className="h-3 w-32 bg-[#2f3336] rounded animate-pulse" />
          </div>
        </div>

        <div className="h-3 w-20 bg-[#2f3336] rounded animate-pulse mb-8" />

        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-5 bg-[#2f3336] rounded animate-pulse"
              style={{ width: `${85 + Math.random() * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
