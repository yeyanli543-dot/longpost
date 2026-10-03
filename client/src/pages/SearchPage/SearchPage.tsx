import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Hash, User as UserIcon } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { articlesApi } from '@client/src/api';
import type {
  ArticleSummary,
  PostItem,
  SearchResponse,
  UserPublicProfile,
  HashtagItem,
} from '@shared/api.interface';
import FollowButton from '@client/src/components/FollowButton';
import RichTextContent from '@client/src/components/RichTextContent';
import { Image } from '@client/src/components/ui/image';

type SearchTab = 'all' | 'posts' | 'users' | 'hashtags';

const TABS: { key: SearchTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'posts', label: '帖子' },
  { key: 'users', label: '用户' },
  { key: 'hashtags', label: '话题' },
];

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') || '';
  const urlType = (searchParams.get('type') as SearchTab) || 'all';

  const [keyword, setKeyword] = useState(urlQ);
  const [activeTab, setActiveTab] = useState<SearchTab>(
    TABS.some((t) => t.key === urlType) ? urlType : 'all',
  );
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const debounceTimer = useRef<number | null>(null);

  const doSearch = useCallback(
    async (q: string, type: SearchTab) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setSearched(false);
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setSearched(true);
      try {
        const data: SearchResponse = await articlesApi.search(
          trimmed,
          type as 'all' | 'posts' | 'users' | 'hashtags',
        );
        setResults(data);
      } catch (error) {
        logger.error('搜索请求失败', error);
        setResults({
          posts: [],
          articles: [],
          users: [],
          hashtags: [],
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounced search from input
  useEffect(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('type', activeTab);
      setSearchParams(params, { replace: true });
      void doSearch(keyword, activeTab);
    }, 300);
    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, [keyword, activeTab, doSearch, setSearchParams]);

  // Initial load from URL
  useEffect(() => {
    if (urlQ && !searched) {
      void doSearch(urlQ, activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('type', activeTab);
      setSearchParams(params, { replace: true });
      void doSearch(keyword, activeTab);
    }
  };

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
  };

  const hasResults =
    results &&
    (results.posts.length > 0 ||
      results.articles.length > 0 ||
      results.users.length > 0 ||
      results.hashtags.length > 0);

  const showPosts = activeTab === 'all' || activeTab === 'posts';
  const showUsers = activeTab === 'all' || activeTab === 'users';
  const showHashtags = activeTab === 'all' || activeTab === 'hashtags';

  return (
    <div className="min-h-screen bg-black text-gray-100 pb-24 md:pb-0">
      {/* 顶部搜索栏 */}
      <div className="sticky top-0 z-10 bg-black px-4 py-2.5 border-b border-gray-800">
        <div className="relative max-w-xl mx-auto">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-gray-500" />
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索帖子、用户、话题"
            className="w-full bg-gray-900 rounded-full pl-12 pr-4 min-h-[48px] text-base text-gray-100 placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500/50 transition"
            autoFocus
          />
          {loading && (
            <div className="absolute inset-y-0 right-4 flex items-center">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* 分类 Tabs */}
      {searched && (
        <div className="sticky top-[56px] z-10 bg-black border-b border-gray-800">
          <div className="max-w-xl mx-auto flex overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex-1 min-w-16 min-h-[44px] text-sm font-medium transition-colors relative flex-shrink-0 px-4 ${
                  activeTab === tab.key
                    ? 'text-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                data-ai-section-type="button"
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div className="max-w-xl mx-auto">
        {!searched && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Search className="w-12 h-12 mb-4 opacity-40" />
            <p className="text-lg">搜索帖子和文章</p>
            <p className="text-sm mt-2">输入关键词开始搜索</p>
          </div>
        )}

        {searched && loading && (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <div className="w-6 h-6 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin mr-3" />
            <span>搜索中...</span>
          </div>
        )}

        {searched && !loading && !hasResults && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <p className="text-lg">没有找到相关内容</p>
            <p className="text-sm mt-2">换个关键词试试吧</p>
          </div>
        )}

        {searched && !loading && hasResults && (
          <div data-ai-section-type="card-list">
            {/* 用户分区 */}
            {showUsers && results!.users.length > 0 && (
              <div>
                {activeTab === 'all' && (
                  <div className="px-4 py-3 text-sm font-semibold text-gray-500 border-b border-gray-800 bg-gray-900/30">
                    用户
                  </div>
                )}
                {results!.users.map((user: UserPublicProfile) => (
                  <UserResultItem key={user.id} user={user} />
                ))}
              </div>
            )}

            {/* 话题分区 */}
            {showHashtags && results!.hashtags.length > 0 && (
              <div>
                {activeTab === 'all' && (
                  <div className="px-4 py-3 text-sm font-semibold text-gray-500 border-b border-gray-800 bg-gray-900/30">
                    话题
                  </div>
                )}
                {results!.hashtags.map((tag: HashtagItem) => (
                  <HashtagResultItem key={tag.id} tag={tag} />
                ))}
              </div>
            )}

            {/* 帖子分区 */}
            {showPosts && results!.posts.length > 0 && (
              <div>
                {activeTab === 'all' && (
                  <div className="px-4 py-3 text-sm font-semibold text-gray-500 border-b border-gray-800 bg-gray-900/30">
                    帖子
                  </div>
                )}
                {results!.posts.map((post: PostItem) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}

            {/* 文章分区 (only in "all" tab) */}
            {activeTab === 'all' && results!.articles.length > 0 && (
              <div>
                <div className="px-4 py-3 text-sm font-semibold text-gray-500 border-b border-gray-800 bg-gray-900/30">
                  文章
                </div>
                {results!.articles.map((article: ArticleSummary) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- User Result Item ----------

interface UserResultItemProps {
  user: UserPublicProfile;
}

function UserResultItem({ user }: UserResultItemProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/user/${user.id}`);
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800 hover:bg-gray-900/50 transition cursor-pointer"
      onClick={handleClick}
    >
      <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.nickname}
            className="w-12 h-12 object-cover"
          />
        ) : (
          <UserIcon className="w-6 h-6 text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-100 truncate">
            {user.nickname}
          </span>
          {user.role === 'admin' && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
              管理员
            </span>
          )}
        </div>
        {user.bio && (
          <p className="text-sm text-gray-500 mt-0.5 truncate">{user.bio}</p>
        )}
        <div className="text-xs text-gray-500 mt-1">
          {user.postCount + user.articleCount} 条内容 ·{' '}
          {user.followerCount} 粉丝
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <FollowButton userId={user.id} isFollowing={user.isFollowing} size="sm" />
      </div>
    </div>
  );
}

// ---------- Hashtag Result Item ----------

interface HashtagResultItemProps {
  tag: HashtagItem;
}

function HashtagResultItem({ tag }: HashtagResultItemProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/hashtag/${encodeURIComponent(tag.tag)}`);
  };

  const totalCount = tag.postCount + tag.articleCount;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800 hover:bg-gray-900/50 transition cursor-pointer"
      onClick={handleClick}
    >
      <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
        <Hash className="w-5 h-5 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-100 truncate">
          <span className="text-blue-500">#</span>
          {tag.tag}
        </div>
        <div className="text-sm text-gray-500">{totalCount} 条内容</div>
      </div>
    </div>
  );
}

// ---------- PostCard ----------

interface PostCardProps {
  post: PostItem;
}

function PostCard({ post }: PostCardProps) {
  const navigate = useNavigate();

  const truncateContent = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const handleClick = () => {
    navigate(`/post/${post.id}`);
  };

  return (
    <div
      className="px-4 py-3.5 border-b border-gray-800 hover:bg-gray-900/50 transition cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <Link
          to={`/user/${post.authorId}`}
          className="font-medium text-gray-100 truncate hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {post.authorName}
        </Link>
        <span className="text-sm text-gray-500 shrink-0">
          {formatTime(post.createdAt)}
        </span>
      </div>
      <div className="text-base leading-relaxed text-gray-100">
        <RichTextContent content={truncateContent(post.content, 140)} />
      </div>
    </div>
  );
}

// ---------- ArticleCard ----------

interface ArticleCardProps {
  article: ArticleSummary;
}

function ArticleCard({ article }: ArticleCardProps) {
  const truncateExcerpt = (text: string | null, maxLen: number) => {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

  return (
    <Link
      to={`/article/${article.id}`}
      className="block px-4 py-3.5 border-b border-gray-800 hover:bg-gray-900/50 transition"
    >
      <h3 className="text-lg font-semibold text-gray-100 mb-1 line-clamp-2">
        {article.title}
      </h3>
      {article.excerpt && (
        <p className="text-sm text-gray-500 mb-2 line-clamp-2 leading-relaxed">
          {truncateExcerpt(article.excerpt, 100)}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="truncate">{article.authorName}</span>
        <span>·</span>
        <span>{article.readCount} 阅读</span>
      </div>
    </Link>
  );
}
