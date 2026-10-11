import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  FileText,
  Trash2,
  Edit3,
  Image as ImageIcon,
  Paperclip,
  Bookmark,
  Settings,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@client/src/hooks/useAuth';
import { postsApi, articlesApi, authApi, interactionsApi } from '@client/src/api';
import RichTextContent from '@client/src/components/RichTextContent';
import type { PostItem, ArticleSummary, ToggleBookmarkRequest } from '@shared/api.interface';
import { showConfirm } from '@/lib';
import { Image } from '@client/src/components/ui/image';
import LoginGate from '@client/src/components/LoginGate';

type TabType = 'posts' | 'articles' | 'bookmarks';

// ---------- MyPostCard ----------

interface MyPostCardProps {
  post: PostItem;
  onDelete: (id: string) => void;
}

const MyPostCard = ({ post, onDelete }: MyPostCardProps) => {
  const navigate = useNavigate();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await showConfirm('确定删除这条帖子吗？')) return;
    onDelete(post.id);
  };

  const handleArticleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.article) {
      navigate(`/article/${post.article.id}`);
    }
  };

  return (
    <article
      className="flex gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 transition-colors"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
          <FileText className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <span className="font-bold text-gray-100 truncate">
            {post.authorName}
          </span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-500 flex-shrink-0">
            {dayjs(post.createdAt).format('YYYY-MM-DD HH:mm')}
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
          </div>
        )}

        {/* Action bar */}
        <div className="mt-3 flex items-center gap-4 text-gray-500">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 text-sm hover:text-red-500 transition-colors"
            data-ai-section-type="button"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除</span>
          </button>
        </div>
      </div>
    </article>
  );
};

// ---------- MyArticleCard ----------

interface MyArticleCardProps {
  article: ArticleSummary;
  onDelete: (id: string) => void;
}

const MyArticleCard = ({ article, onDelete }: MyArticleCardProps) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/compose?articleId=${article.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await showConfirm('确定删除这篇文章吗？')) return;
    onDelete(article.id);
  };

  return (
    <article
      onClick={handleCardClick}
      className="flex gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 transition-colors cursor-pointer"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
          <FileText className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <span className="text-gray-500">发布了文章</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-500 flex-shrink-0">
            {dayjs(article.createdAt).format('YYYY-MM-DD HH:mm')}
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

        {/* Action bar */}
        <div className="mt-3 flex items-center gap-6 text-sm text-gray-500">
          <span>阅读 · {article.readCount} 次</span>
          <button
            onClick={handleEdit}
            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
            data-ai-section-type="button"
          >
            <Edit3 className="w-4 h-4" />
            <span>编辑</span>
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 hover:text-red-500 transition-colors"
            data-ai-section-type="button"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除</span>
          </button>
        </div>
      </div>
    </article>
  );
};

// ---------- BookmarkCard ----------

interface BookmarkCardProps {
  article: ArticleSummary;
  onUnbookmark: (id: string) => void;
}

const BookmarkCard = ({ article, onUnbookmark }: BookmarkCardProps) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleUnbookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await showConfirm('确定取消收藏这篇文章吗？')) return;
    onUnbookmark(article.id);
  };

  return (
    <article
      onClick={handleCardClick}
      className="flex gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 transition-colors cursor-pointer"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
          <Bookmark className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-1 text-sm">
          <span className="text-gray-500">{article.authorName}</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-500 flex-shrink-0">
            {dayjs(article.createdAt).format('YYYY-MM-DD HH:mm')}
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

        {/* Action bar */}
        <div className="mt-3 flex items-center gap-6 text-sm text-gray-500">
          <span>阅读 · {article.readCount} 次</span>
          <button
            onClick={handleUnbookmark}
            className="flex items-center gap-1 hover:text-yellow-500 transition-colors"
            data-ai-section-type="button"
          >
            <Bookmark className="w-4 h-4 fill-current" />
            <span>取消收藏</span>
          </button>
        </div>
      </div>
    </article>
  );
};

// ---------- EmptyState ----------

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
    <FileText className="w-12 h-12 mb-3 opacity-50" />
    <p className="text-base">{message}</p>
  </div>
);

// ---------- MyPage ----------

const MyPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [bookmarks, setBookmarks] = useState<ArticleSummary[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [bookmarksLoading, setBookmarksLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const response = await postsApi.getMyPosts();
      setPosts(response.items);
    } catch {
      toast.error('加载帖子失败');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const loadArticles = useCallback(async () => {
    setArticlesLoading(true);
    try {
      const response = await articlesApi.getMyArticles();
      setArticles(response.items);
    } catch {
      toast.error('加载文章失败');
    } finally {
      setArticlesLoading(false);
    }
  }, []);

  const loadBookmarks = useCallback(async () => {
    setBookmarksLoading(true);
    try {
      const response = await authApi.getMyBookmarks();
      setBookmarks(response.items);
    } catch {
      toast.error('加载收藏失败');
    } finally {
      setBookmarksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      void loadPosts();
      void loadArticles();
      void loadBookmarks();
    }
  }, [user, authLoading, loadPosts, loadArticles, loadBookmarks]);

  const handleDeletePost = async (id: string) => {
    try {
      await postsApi.deletePost(id);
      setPosts((prev) => prev.filter((p: PostItem) => p.id !== id));
      toast.success('帖子已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const handleDeleteArticle = async (id: string) => {
    try {
      await articlesApi.deleteArticle(id);
      setArticles((prev) => prev.filter((a: ArticleSummary) => a.id !== id));
      toast.success('文章已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const handleUnbookmark = async (articleId: string) => {
    try {
      const data: ToggleBookmarkRequest = { articleId };
      await interactionsApi.toggleBookmark(data);
      setBookmarks((prev) => prev.filter((a: ArticleSummary) => a.id !== articleId));
      toast.success('已取消收藏');
    } catch {
      toast.error('取消收藏失败');
    }
  };

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
        title="登录后查看我的内容"
        description="登录后即可管理你发布的帖子、文章和收藏"
      />
    );
  }

  const emailPrefix = user.email.split('@')[0] ?? user.email;
  const avatarInitial = user.nickname?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-gray-800 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-100">我的内容</h1>
      </div>

      {/* Profile section */}
      <div className="px-4 py-6 border-b border-gray-800">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-3xl font-bold text-gray-300 flex-shrink-0">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.nickname}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              avatarInitial
            )}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-2xl font-bold text-gray-100 truncate">
              {user.nickname}
            </h2>
            <p className="mt-1 text-gray-500 truncate">@{emailPrefix}</p>
            <p className="mt-2 text-sm text-gray-500">
              注册时间：{dayjs(user.createdAt).format('YYYY年MM月DD日')}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex gap-6 text-sm">
          <span className="text-gray-500">
            <span className="text-gray-100 font-bold">{posts.length}</span>{' '}
            帖子
          </span>
          <span className="text-gray-500">
            <span className="text-gray-100 font-bold">{articles.length}</span>{' '}
            文章
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-4 py-3 border-b border-gray-800 space-y-1">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-900 transition-colors text-left"
          data-ai-section-type="button"
        >
          <Settings className="w-5 h-5 text-[#71767b]" />
          <span className="flex-1 text-base text-gray-100">设置</span>
          <ChevronRight className="w-4 h-4 text-[#71767b]" />
        </button>
        {user?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-900 transition-colors text-left"
            data-ai-section-type="button"
          >
            <Shield className="w-5 h-5 text-blue-500" />
            <span className="flex-1 text-base text-gray-100">管理后台</span>
            <ChevronRight className="w-4 h-4 text-[#71767b]" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex-1 py-4 text-base font-medium transition-colors relative ${
            activeTab === 'posts'
              ? 'text-gray-100 font-bold'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          data-ai-section-type="button"
        >
          帖子
          {activeTab === 'posts' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-blue-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('articles')}
          className={`flex-1 py-4 text-base font-medium transition-colors relative ${
            activeTab === 'articles'
              ? 'text-gray-100 font-bold'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          data-ai-section-type="button"
        >
          文章
          {activeTab === 'articles' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-blue-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('bookmarks')}
          className={`flex-1 py-4 text-base font-medium transition-colors relative ${
            activeTab === 'bookmarks'
              ? 'text-gray-100 font-bold'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          data-ai-section-type="button"
        >
          收藏
          {activeTab === 'bookmarks' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-blue-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'posts' && (
        <div>
          {postsLoading ? (
            <EmptyState message="加载中..." />
          ) : posts.length === 0 ? (
            <EmptyState message="还没有发布过帖子" />
          ) : (
            posts.map((post: PostItem) => (
              <MyPostCard
                key={post.id}
                post={post}
                onDelete={handleDeletePost}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'articles' && (
        <div>
          {articlesLoading ? (
            <EmptyState message="加载中..." />
          ) : articles.length === 0 ? (
            <EmptyState message="还没有发布过文章" />
          ) : (
            articles.map((article: ArticleSummary) => (
              <MyArticleCard
                key={article.id}
                article={article}
                onDelete={handleDeleteArticle}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'bookmarks' && (
        <div>
          {bookmarksLoading ? (
            <EmptyState message="加载中..." />
          ) : bookmarks.length === 0 ? (
            <EmptyState message="还没有收藏的文章" />
          ) : (
            bookmarks.map((article: ArticleSummary) => (
              <BookmarkCard
                key={article.id}
                article={article}
                onUnbookmark={handleUnbookmark}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MyPage;
