import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@client/src/utils/error-message';
import {
  X,
  Link2,
  Loader2,
  FileText,
  User,
} from 'lucide-react';
import { useAuth } from '@client/src/hooks/useAuth';
import { postsApi, articlesApi } from '@client/src/api';
import type { ArticleDetail, ArticleSummary } from '@shared/api.interface';
import ArticleComposer from './ArticleComposer';

const POST_CHAR_LIMIT = 280;

const ComposePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const articleId = searchParams.get('articleId');
  const shareTitle = (searchParams.get('title') || '').trim();
  const shareText = (searchParams.get('text') || '').trim();
  const shareUrl = (searchParams.get('url') || '').trim();
  const shareType = (searchParams.get('type') || searchParams.get('tab') || '').trim();

  // 是否判定为由外部应用分享的长文
  const isIncomingArticle =
    !articleId && (shareType === 'article' || (shareTitle && shareText.length > 200));

  // 拼接长文正文与短帖内容
  const initialArticleContent = shareText
    ? (shareUrl ? `${shareText}\n\n> 来源引用：${shareUrl}` : shareText)
    : (shareUrl ? `> 来源引用：${shareUrl}` : '');

  const initialPostContent = [shareTitle, shareText, shareUrl].filter(Boolean).join('\n');

  const [activeTab, setActiveTab] = useState<'post' | 'article'>(
    articleId || isIncomingArticle ? 'article' : 'post',
  );
  const [articleData, setArticleData] = useState<ArticleDetail | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  // If articleId or incoming article is present, switch to article tab
  useEffect(() => {
    if (articleId || isIncomingArticle) {
      setActiveTab('article');
    }
  }, [articleId, isIncomingArticle]);

  // 外部分享内容载入通知
  const hasNotifiedShareRef = useRef(false);
  useEffect(() => {
    if ((shareTitle || shareText || shareUrl) && !hasNotifiedShareRef.current) {
      hasNotifiedShareRef.current = true;
      toast.info('已载入来自外部应用分享的内容');
    }
  }, [shareTitle, shareText, shareUrl]);

  // Load article data for edit mode
  useEffect(() => {
    if (!articleId || !user) return;
    let cancelled = false;
    setArticleLoading(true);

    const loadArticle = async () => {
      try {
        const article = await articlesApi.getArticle(articleId);
        if (!cancelled) {
          setArticleData(article);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        const err = error as { response?: { status: number } };
        if (err.response?.status === 403) {
          toast.error('你没有权限编辑这篇文章');
          navigate('/me');
        } else {
          toast.error(getFriendlyErrorMessage(error, '加载文章失败'));
        }
      } finally {
        if (!cancelled) setArticleLoading(false);
      }
    };

    loadArticle();
    return () => {
      cancelled = true;
    };
  }, [articleId, user, navigate]);

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  // Not logged in - show login prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-100 mb-2">登录后即可发布</h1>
            <p className="text-gray-500 mb-8">
              登录 LongPost，发布你的短帖和长文
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full transition-colors text-base"
              data-ai-section-type="button"
            >
              登录 / 注册
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEditMode = !!articleId && !!articleData;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-0">
      {/* Sticky header with tabs */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border pt-safe">
        <div className="flex">
          <button
             onClick={() => setActiveTab('post')}
             className={`flex-1 min-h-[44px] md:min-h-0 py-3 md:py-4 text-sm md:text-base font-medium transition-colors relative ${
               activeTab === 'post' ? 'text-gray-100' : 'text-gray-500 hover:text-gray-300'
             }`}
           >
             发布短帖
             {activeTab === 'post' && (
               <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-blue-500 rounded-full" />
             )}
           </button>
           <button
             onClick={() => setActiveTab('article')}
             className={`flex-1 min-h-[44px] md:min-h-0 py-3 md:py-4 text-sm md:text-base font-medium transition-colors relative ${
               activeTab === 'article' ? 'text-gray-100' : 'text-gray-500 hover:text-gray-300'
             }`}
           >
            {isEditMode ? '编辑长文' : '发布长文'}
            {activeTab === 'article' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-blue-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

       <div className="p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {activeTab === 'post' ? (
          <PostComposer initialContent={initialPostContent} />
        ) : articleLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <ArticleComposer
             editId={articleId ?? undefined}
             initialTitle={articleData?.title || (isIncomingArticle ? shareTitle : undefined)}
             initialContent={articleData?.content || (isIncomingArticle ? initialArticleContent : undefined)}
             initialExcerpt={articleData?.excerpt ?? undefined}
             initialCoverUrl={articleData?.coverUrl ?? undefined}
             initialStatus={articleData?.status}
             initialImages={articleData?.images}
             initialAttachments={articleData?.attachments}
           />
        )}
      </div>
    </div>
  );
};

// ---------- Post Composer ----------

interface PostComposerProps {
  initialContent?: string;
}

const PostComposer = ({ initialContent = '' }: PostComposerProps) => {
  const navigate = useNavigate();
  const [content, setContent] = useState(initialContent);
  const [showArticleSelector, setShowArticleSelector] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<ArticleSummary | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
    }
  }, [initialContent]);

  const charCount = content.length;
  const isOverLimit = charCount > POST_CHAR_LIMIT;
  const isEmpty = content.trim().length === 0;
  const canPublish = !isEmpty && !isOverLimit && !isPublishing;

  const handlePublish = async () => {
    if (!canPublish) return;
    setIsPublishing(true);
    try {
      await postsApi.createPost({
        content: content.trim(),
        articleId: selectedArticle?.id,
      });
      toast.success('发布成功');
      setContent('');
      setSelectedArticle(null);
      setShowArticleSelector(false);
      navigate('/');
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error, '发布失败，请重试'));
    } finally {
      setIsPublishing(false);
    }
  };

  const charRemaining = POST_CHAR_LIMIT - charCount;
  const charColor = isOverLimit
    ? 'text-red-500'
    : charRemaining <= 20
      ? 'text-yellow-500'
      : 'text-gray-500';

  return (
    <div className="flex gap-3">
      {/* Avatar placeholder */}
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
         <textarea
           ref={textareaRef}
           value={content}
           onChange={(e) => setContent(e.target.value)}
           placeholder="说点什么..."
           rows={4}
           className="w-full bg-transparent text-base md:text-lg text-gray-100 placeholder:text-gray-500 resize-none outline-none border-none"
         />

        {/* Selected article display */}
        {selectedArticle && (
          <div className="mt-3 p-3 border border-gray-700 rounded-xl bg-gray-900/50 flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-100 truncate">
                {selectedArticle.title}
              </p>
              <p className="text-xs text-gray-500">已关联此文章</p>
            </div>
            <button
               onClick={() => setSelectedArticle(null)}
               className="p-2 md:p-1 hover:bg-gray-700 rounded-full transition-colors"
               aria-label="移除关联文章"
             >
               <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}

        {/* Article selector toggle + search */}
        {showArticleSelector && !selectedArticle && (
          <ArticleSelector
            onSelect={(article) => {
              setSelectedArticle(article);
              setShowArticleSelector(false);
            }}
            onClose={() => setShowArticleSelector(false)}
          />
        )}

        {/* Action bar */}
        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!showArticleSelector && !selectedArticle && (
               <button
                 onClick={() => setShowArticleSelector(true)}
                 className="flex items-center gap-1.5 min-h-[44px] md:min-h-0 text-sm text-blue-500 hover:text-blue-400 transition-colors"
               >
                 <Link2 className="w-4 h-4" />
                 添加文章链接
               </button>
             )}
             {showArticleSelector && !selectedArticle && (
               <button
                 onClick={() => setShowArticleSelector(false)}
                 className="flex items-center gap-1.5 min-h-[44px] md:min-h-0 text-sm text-gray-500 hover:text-gray-300 transition-colors"
               >
                 <X className="w-4 h-4" />
                 取消
               </button>
             )}
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-sm ${charColor}`}>
              {charCount}/{POST_CHAR_LIMIT}
            </span>
            <button
               onClick={handlePublish}
               disabled={!canPublish}
               className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-bold min-h-[44px] px-6 rounded-full transition-colors text-sm flex items-center justify-center"
               data-ai-section-type="button"
             >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                '发布'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Article Selector ----------

interface ArticleSelectorProps {
  onSelect: (article: ArticleSummary) => void;
  onClose: () => void;
}

const ArticleSelector = ({ onSelect, onClose }: ArticleSelectorProps) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<ArticleSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchArticles = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await articlesApi.search(q.trim());
      setResults(res.articles || []);
    } catch {
      toast.error('搜索失败');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchArticles(keyword);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, searchArticles]);

  return (
    <div className="mt-3 border border-gray-700 rounded-xl overflow-hidden bg-gray-900/50">
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索已有文章..."
            className="w-full bg-transparent text-sm text-gray-100 placeholder:text-gray-500 outline-none pl-0"
          />
          {isSearching && (
            <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
          )}
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto">
        {keyword.trim() && !isSearching && results.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">
            没有找到相关文章
          </div>
        )}
        {!keyword.trim() && (
          <div className="p-4 text-center text-sm text-gray-500">
            输入关键词搜索文章
          </div>
        )}
        {results.map((article) => (
          <button
            key={article.id}
            onClick={() => onSelect(article)}
            className="w-full text-left p-3 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0"
          >
            <p className="text-sm font-medium text-gray-100 truncate">
              {article.title}
            </p>
            {article.excerpt && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                {article.excerpt}
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="p-2 border-t border-gray-800">
        <button
          onClick={onClose}
          className="w-full text-xs text-gray-500 hover:text-gray-300 py-1 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
};

export default ComposePage;
