import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import { adminApi, siteSettingsApi } from '@client/src/api';
import AccessCodesManager from '@client/src/pages/AccessCodesPage/AccessCodesManager';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Badge } from '@client/src/components/ui/badge';
import { Switch } from '@client/src/components/ui/switch';
import { Label } from '@client/src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  MessageSquare,
  Users,
  Flag,
  Settings,
  Search,
  Pin,
  PinOff,
  Star,
  StarOff,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldOff,
  Ban,
  CircleCheck,
  AlertTriangle,
  Loader2,
  ThumbsUp,
  Bookmark,
  Repeat2,
  Eye,
  ClipboardCheck,
  Download,
  X,
  KeyRound,
} from 'lucide-react';
import type {
  AdminDashboardStats,
  PostItem,
  ArticleSummary,
  CommentItem,
  AdminUserItem,
  ReportItem,
  SiteSettings,
  ReportStatus,
  ReportReason,
  RegistrationMode,
} from '@shared/api.interface';
import { showConfirm } from '@/lib';
import { Image } from '@client/src/components/ui/image';

// ─── Tab definitions ────────────────────────────────────────
type AdminTabKey =
  | 'dashboard'
  | 'moderation'
  | 'posts'
  | 'articles'
  | 'comments'
  | 'users'
  | 'access-codes'
  | 'reports'
  | 'settings';

interface AdminTab {
  key: AdminTabKey;
  label: string;
  icon: React.ReactNode;
}

const ADMIN_TABS: AdminTab[] = [
  { key: 'dashboard', label: '仪表盘', icon: <LayoutDashboard size={18} /> },
  { key: 'moderation', label: '审核队列', icon: <ClipboardCheck size={18} /> },
  { key: 'posts', label: '帖子管理', icon: <FileText size={18} /> },
  { key: 'articles', label: '文章管理', icon: <BookOpen size={18} /> },
  { key: 'comments', label: '评论管理', icon: <MessageSquare size={18} /> },
  { key: 'users', label: '用户管理', icon: <Users size={18} /> },
  { key: 'access-codes', label: '通行码管理', icon: <KeyRound size={18} /> },
  { key: 'reports', label: '举报中心', icon: <Flag size={18} /> },
  { key: 'settings', label: '站点设置', icon: <Settings size={18} /> },
];

const PAGE_SIZE = 20;

// ─── Helper: format date ───────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Loading / Empty / Error states ────────────────────────
function StateCard({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
      <div className="mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────
function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  loading,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  loading: boolean;
}): React.ReactElement | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-4 border-t border-[#2f3336]">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={14} />
        上一页
      </Button>
      <span className="text-sm text-gray-500 min-w-[80px] text-center">
        第 {page} / {totalPages} 页
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
        <ChevronRight size={14} />
      </Button>
    </div>
  );
}

// ─── 1. Dashboard Tab ──────────────────────────────────────
function DashboardTab(): React.ReactElement {
  const [data, setData] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const stats = await adminApi.getDashboardStats();
      setData(stats);
    } catch (err) {
      logger.error('获取仪表盘数据失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <StateCard icon={<AlertTriangle size={32} />} text={error} />
        <Button variant="outline" onClick={fetchData} className="mt-4">
          重试
        </Button>
      </div>
    );
  }
  if (!data) return <StateCard icon={<AlertTriangle size={32} />} text="暂无数据" />;

  const totalCards: { label: string; value: number; icon: React.ReactNode; color: string }[] = [
    { label: '用户总数', value: data.totalUsers, icon: <Users size={20} />, color: 'text-blue-400' },
    { label: '帖子总数', value: data.totalPosts, icon: <FileText size={20} />, color: 'text-green-400' },
    { label: '文章总数', value: data.totalArticles, icon: <BookOpen size={20} />, color: 'text-purple-400' },
    { label: '评论总数', value: data.totalComments, icon: <MessageSquare size={20} />, color: 'text-yellow-400' },
    { label: '点赞总数', value: data.totalLikes, icon: <ThumbsUp size={20} />, color: 'text-pink-400' },
    { label: '收藏总数', value: data.totalBookmarks, icon: <Bookmark size={20} />, color: 'text-orange-400' },
    { label: '转发总数', value: data.totalReposts, icon: <Repeat2 size={20} />, color: 'text-cyan-400' },
  ];

  const todayCards: { label: string; value: number }[] = [
    { label: '今日新增用户', value: data.todayNewUsers },
    { label: '今日新增帖子', value: data.todayNewPosts },
    { label: '今日新增文章', value: data.todayNewArticles },
    { label: '今日新增评论', value: data.todayNewComments },
  ];

  const pendingCards: { label: string; value: number; color: string }[] = [
    { label: '待审核内容', value: data.pendingReviewCount, color: 'text-yellow-400' },
    { label: '待处理举报', value: data.pendingReports, color: 'text-red-400' },
    { label: '被封禁用户', value: data.bannedUsers, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-6">
      {/* 总数统计 */}
      <section>
        <h3 className="text-lg font-semibold text-[#e7e9ea] mb-3">数据概览</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" data-ai-section-type="card-stat">
          {totalCards.map((c: { label: string; value: number; icon: React.ReactNode; color: string }) => (
            <div
              key={c.label}
              className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4"
            >
              <div className={`flex items-center gap-2 mb-2 ${c.color}`}>
                {c.icon}
                <span className="text-xs text-gray-500">{c.label}</span>
              </div>
              <div className="text-2xl font-bold text-[#e7e9ea]">{c.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 今日新增 */}
      <section>
        <h3 className="text-lg font-semibold text-[#e7e9ea] mb-3">今日新增</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-ai-section-type="card-stat">
          {todayCards.map((c: { label: string; value: number }) => (
            <div
              key={c.label}
              className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4"
            >
              <div className="text-xs text-gray-500 mb-2">{c.label}</div>
              <div className="text-2xl font-bold text-[#1d9bf0]">+{c.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 待处理 */}
      <section>
        <h3 className="text-lg font-semibold text-[#e7e9ea] mb-3">待处理</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-ai-section-type="card-stat">
          {pendingCards.map((c: { label: string; value: number; color: string }) => (
            <div
              key={c.label}
              className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4"
            >
              <div className={`text-xs mb-2 ${c.color}`}>{c.label}</div>
              <div className={`text-2xl font-bold ${c.color}`}>{c.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── 2. Moderation Tab ─────────────────────────────────────
function ModerationTab(): React.ReactElement {
  const [subTab, setSubTab] = useState<'posts' | 'articles'>('posts');
  const [items, setItems] = useState<(PostItem | ArticleSummary)[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ id: string; type: 'post' | 'article' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (subTab === 'posts') {
        const res = await adminApi.getModerationPosts(page, PAGE_SIZE);
        setItems(res.items);
        setTotal(res.total);
      } else {
        const res = await adminApi.getModerationArticles(page, PAGE_SIZE);
        setItems(res.items);
        setTotal(res.total);
      }
    } catch (err) {
      logger.error(`获取待审核${subTab === 'posts' ? '帖子' : '文章'}列表失败`, err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [subTab, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string): Promise<void> => {
    setActionLoading(id);
    try {
      if (subTab === 'posts') {
        await adminApi.reviewPost(id, 'approved');
      } else {
        await adminApi.reviewArticle(id, 'approved');
      }
      toast.success('已通过审核');
      await fetchData();
    } catch (err) {
      logger.error('审核通过失败', err);
      toast.error('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectClick = (id: string): void => {
    setRejectDialog({ id, type: subTab === 'posts' ? 'post' : 'article' });
    setRejectReason('');
  };

  const handleRejectSubmit = async (): Promise<void> => {
    if (!rejectDialog || !rejectReason.trim()) return;
    setRejectSubmitting(true);
    try {
      if (rejectDialog.type === 'post') {
        await adminApi.reviewPost(rejectDialog.id, 'rejected', rejectReason.trim());
      } else {
        await adminApi.reviewArticle(rejectDialog.id, 'rejected', rejectReason.trim());
      }
      toast.success('已驳回');
      setRejectDialog(null);
      setRejectReason('');
      await fetchData();
    } catch (err) {
      logger.error('审核驳回失败', err);
      toast.error('操作失败');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const subTabs: { key: 'posts' | 'articles'; label: string }[] = [
    { key: 'posts', label: '待审核帖子' },
    { key: 'articles', label: '待审核文章' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-[#2f3336] pb-3 overflow-x-auto scrollbar-hide">
        {subTabs.map((tab: { key: 'posts' | 'articles'; label: string }) => (
          <Button
            key={tab.key}
            size="sm"
            variant={subTab === tab.key ? 'default' : 'ghost'}
            onClick={() => {
              setSubTab(tab.key);
              setPage(1);
            }}
            className="flex-shrink-0 min-h-[44px] md:min-h-[40px]"
           >
             {tab.label}
           </Button>
         ))}
       </div>

       <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {loading && items.length === 0 ? (
          <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <StateCard icon={<AlertTriangle size={32} />} text={error} />
            <Button variant="outline" onClick={fetchData} className="mt-4">
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <StateCard icon={<ClipboardCheck size={32} />} text="暂无待审核内容" />
        ) : subTab === 'posts' ? (
          <div className="divide-y divide-[#2f3336]">
            {items.map((item: PostItem | ArticleSummary) => {
              const post = item as PostItem;
              return (
                <div key={post.id} className="p-4 hover:bg-[#1d1f23] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-[#e7e9ea] text-sm truncate">
                          {post.authorName}
                        </span>
                        <span className="text-xs text-gray-500">{fmtDate(post.createdAt)}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          待审核
                        </Badge>
                      </div>
                      <p className="text-sm text-[#e7e9ea] line-clamp-3 mb-2">
                        {post.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={actionLoading === post.id}
                        onClick={() => handleApprove(post.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CircleCheck size={14} className="mr-1" />
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === post.id}
                        onClick={() => handleRejectClick(post.id)}
                      >
                        <X size={14} className="mr-1" />
                        驳回
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((item: PostItem | ArticleSummary) => {
              const article = item as ArticleSummary;
              return (
                <div key={article.id} className="p-4 hover:bg-[#1d1f23] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold text-[#e7e9ea] truncate">{article.title}</h4>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          待审核
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                        {article.excerpt || '暂无摘要'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span>作者: {article.authorName}</span>
                        <span>{fmtDate(article.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={actionLoading === article.id}
                        onClick={() => handleApprove(article.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CircleCheck size={14} className="mr-1" />
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === article.id}
                        onClick={() => handleRejectClick(article.id)}
                      >
                        <X size={14} className="mr-1" />
                        驳回
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        loading={loading}
      />

      {/* Reject Reason Dialog */}
      {rejectDialog && (
        <div className="fixed inset-0 bg-black/70 z-50" onClick={() => !rejectSubmitting && setRejectDialog(null)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#16181c] border border-[#2f3336] rounded-t-2xl max-h-[85vh] overflow-y-auto sm:top-1/2 sm:left-1/2 sm:right-auto sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:rounded-2xl sm:overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336]">
              <h3 className="text-lg font-bold text-gray-100">驳回原因</h3>
              <button
                onClick={() => setRejectDialog(null)}
                disabled={rejectSubmitting}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <Textarea
                value={rejectReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectReason(e.target.value)}
                placeholder="请输入驳回原因..."
                rows={4}
                maxLength={500}
                className="resize-none"
              />
              <p className="mt-1 text-xs text-gray-500 text-right">
                {rejectReason.length}/500
              </p>
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[#2f3336]">
              <Button
                variant="outline"
                onClick={() => setRejectDialog(null)}
                disabled={rejectSubmitting}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectSubmit}
                disabled={rejectSubmitting || !rejectReason.trim()}
                className="flex-1"
              >
                {rejectSubmitting ? (
                  <>
                    <Loader2 size={14} className="mr-1 animate-spin" />
                    提交中...
                  </>
                ) : (
                  '确认驳回'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3. Posts Tab ──────────────────────────────────────────
function PostsTab(): React.ReactElement {
  const [items, setItems] = useState<PostItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAdminPosts(page, PAGE_SIZE, keyword || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取帖子列表失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = (): void => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleAction = async (
    id: string,
    action: 'pin' | 'unpin' | 'feature' | 'unfeature' | 'hide',
  ): Promise<void> => {
    setActionLoading(id);
    try {
      await adminApi.postContentAction('post', id, action);
      toast.success('操作成功');
      await fetchData();
    } catch (err) {
      logger.error(`帖子操作失败: ${action}`, err);
      toast.error('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!await showConfirm('确定删除该帖子吗？')) return;
    setActionLoading(id);
    try {
      await adminApi.batchDeletePosts([id]);
      toast.success('删除成功');
      await fetchData();
    } catch (err) {
      logger.error('删除帖子失败', err);
      toast.error('删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (): Promise<void> => {
    try {
      await adminApi.exportPosts();
      toast.success('导出成功');
    } catch (err) {
      logger.error('导出帖子 CSV 失败', err);
      toast.error('导出失败，请稍后重试');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="按关键词搜索帖子..."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="min-h-[44px]">
          搜索
        </Button>
        <Button variant="outline" onClick={handleExport} className="md:ml-auto min-h-[44px]">
          <Download size={14} className="mr-1" />
          导出 CSV
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {loading && items.length === 0 ? (
          <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <StateCard icon={<AlertTriangle size={32} />} text={error} />
            <Button variant="outline" onClick={fetchData} className="mt-4">
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <StateCard icon={<FileText size={32} />} text="暂无帖子" />
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((post: PostItem) => (
              <div key={post.id} className="p-4 hover:bg-[#1d1f23] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-[#e7e9ea] text-sm truncate">
                        {post.authorName}
                      </span>
                      <span className="text-xs text-gray-500">{fmtDate(post.createdAt)}</span>
                      {post.isPinned && (
                        <Badge variant="default" className="text-[10px] bg-orange-500 hover:bg-orange-500 text-white border-0">
                          <Pin size={10} className="mr-1" />
                          置顶
                        </Badge>
                      )}
                      {post.isFeatured && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Star size={10} className="mr-1" />
                          加精
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[#e7e9ea] line-clamp-2 mb-2">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <ThumbsUp size={12} />
                        {post.likeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare size={12} />
                        {post.commentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat2 size={12} />
                        {post.repostCount}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading === post.id}
                      onClick={() => handleAction(post.id, post.isPinned ? 'unpin' : 'pin')}
                      title={post.isPinned ? '取消置顶' : '置顶'}
                    >
                      {post.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading === post.id}
                      onClick={() => handleAction(post.id, post.isFeatured ? 'unfeature' : 'feature')}
                      title={post.isFeatured ? '取消加精' : '加精'}
                    >
                      {post.isFeatured ? <StarOff size={14} /> : <Star size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionLoading === post.id}
                      onClick={() => handleDelete(post.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}

// ─── 4. Articles Tab ───────────────────────────────────────
function ArticlesTab(): React.ReactElement {
  const [items, setItems] = useState<ArticleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAdminArticles(page, PAGE_SIZE, keyword || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取文章列表失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = (): void => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleAction = async (
    id: string,
    action: 'pin' | 'unpin' | 'feature' | 'unfeature' | 'hide',
  ): Promise<void> => {
    setActionLoading(id);
    try {
      await adminApi.postContentAction('article', id, action);
      toast.success('操作成功');
      await fetchData();
    } catch (err) {
      logger.error(`文章操作失败: ${action}`, err);
      toast.error('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!await showConfirm('确定删除该文章吗？')) return;
    setActionLoading(id);
    try {
      await adminApi.batchDeleteArticles([id]);
      toast.success('删除成功');
      await fetchData();
    } catch (err) {
      logger.error('删除文章失败', err);
      toast.error('删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (): Promise<void> => {
    try {
      await adminApi.exportArticles();
      toast.success('导出成功');
    } catch (err) {
      logger.error('导出文章 CSV 失败', err);
      toast.error('导出失败，请稍后重试');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="按关键词搜索文章..."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="min-h-[44px]">
          搜索
        </Button>
        <Button variant="outline" onClick={handleExport} className="md:ml-auto min-h-[44px]">
          <Download size={14} className="mr-1" />
          导出 CSV
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {loading && items.length === 0 ? (
          <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <StateCard icon={<AlertTriangle size={32} />} text={error} />
            <Button variant="outline" onClick={fetchData} className="mt-4">
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <StateCard icon={<BookOpen size={32} />} text="暂无文章" />
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((article: ArticleSummary) => (
              <div key={article.id} className="p-4 hover:bg-[#1d1f23] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-semibold text-[#e7e9ea] truncate">{article.title}</h4>
                      {article.isPinned && (
                        <Badge variant="default" className="text-[10px] flex-shrink-0 bg-orange-500 hover:bg-orange-500 text-white border-0">
                          <Pin size={10} className="mr-1" />
                          置顶
                        </Badge>
                      )}
                      {article.isFeatured && (
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          <Star size={10} className="mr-1" />
                          加精
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-1 mb-2">
                      {article.excerpt || '暂无摘要'}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                      <span>作者: {article.authorName}</span>
                      <span className="flex items-center gap-1">
                        <Eye size={12} />
                        {article.readCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp size={12} />
                        {article.likeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare size={12} />
                        {article.commentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bookmark size={12} />
                        {article.bookmarkCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat2 size={12} />
                        {article.repostCount}
                      </span>
                      <span>{fmtDate(article.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading === article.id}
                      onClick={() => handleAction(article.id, article.isPinned ? 'unpin' : 'pin')}
                      title={article.isPinned ? '取消置顶' : '置顶'}
                    >
                      {article.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading === article.id}
                      onClick={() => handleAction(article.id, article.isFeatured ? 'unfeature' : 'feature')}
                      title={article.isFeatured ? '取消加精' : '加精'}
                    >
                      {article.isFeatured ? <StarOff size={14} /> : <Star size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionLoading === article.id}
                      onClick={() => handleDelete(article.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}

// ─── 5. Comments Tab ───────────────────────────────────────
function CommentsTab(): React.ReactElement {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAdminComments(page, PAGE_SIZE, keyword || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取评论列表失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = (): void => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!await showConfirm('确定删除该评论吗？')) return;
    setActionLoading(id);
    try {
      await adminApi.batchDeleteComments([id]);
      toast.success('删除成功');
      await fetchData();
    } catch (err) {
      logger.error('删除评论失败', err);
      toast.error('删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (): Promise<void> => {
    try {
      await adminApi.exportComments();
      toast.success('导出成功');
    } catch (err) {
      logger.error('导出评论 CSV 失败', err);
      toast.error('导出失败，请稍后重试');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="按关键词搜索评论..."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="min-h-[44px]">
          搜索
        </Button>
        <Button variant="outline" onClick={handleExport} className="md:ml-auto min-h-[44px]">
          <Download size={14} className="mr-1" />
          导出 CSV
        </Button>
      </div>

      <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {loading && items.length === 0 ? (
          <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <StateCard icon={<AlertTriangle size={32} />} text={error} />
            <Button variant="outline" onClick={fetchData} className="mt-4">
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <StateCard icon={<MessageSquare size={32} />} text="暂无评论" />
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((comment: CommentItem) => (
              <div
                key={comment.id}
                className={`p-4 hover:bg-[#1d1f23] transition-colors ${comment.isDeleted ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-[#e7e9ea] text-sm">
                        {comment.userName}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {comment.contentTypeId}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {fmtDate(comment.createdAt)}
                      </span>
                      {comment.isDeleted && (
                        <Badge variant="destructive" className="text-[10px]">
                          已删除
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[#e7e9ea] line-clamp-2 mb-1">
                      {comment.body}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <ThumbsUp size={12} />
                        {comment.likeCount}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionLoading === comment.id || comment.isDeleted}
                      onClick={() => handleDelete(comment.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}

// ─── 6. Users Tab ──────────────────────────────────────────
function UsersTab(): React.ReactElement {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAdminUsers(page, PAGE_SIZE, keyword || undefined);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取用户列表失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = (): void => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleUserAction = async (
    userId: string,
    action: 'ban' | 'unban' | 'promote' | 'demote',
  ): Promise<void> => {
    const actionLabel = {
      ban: '封禁',
      unban: '解封',
      promote: '设为管理员',
      demote: '取消管理员',
    }[action];
    if (!await showConfirm(`确定${actionLabel}该用户吗？`)) return;
    setActionLoading(userId);
    try {
      await adminApi.userAction(userId, action);
      toast.success(`${actionLabel}成功`);
      await fetchData();
    } catch (err) {
      logger.error(`用户操作失败: ${action}`, err);
      toast.error(`${actionLabel}失败`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (): Promise<void> => {
    try {
      await adminApi.exportUsers();
      toast.success('导出成功');
    } catch (err) {
      logger.error('导出用户 CSV 失败', err);
      toast.error('导出失败，请稍后重试');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="按昵称或邮箱搜索..."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="min-h-[44px]">
          搜索
        </Button>
        <Button variant="outline" onClick={handleExport} className="md:ml-auto min-h-[44px]">
          <Download size={14} className="mr-1" />
          导出 CSV
        </Button>
      </div>

      <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {loading && items.length === 0 ? (
          <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <StateCard icon={<AlertTriangle size={32} />} text={error} />
            <Button variant="outline" onClick={fetchData} className="mt-4">
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <StateCard icon={<Users size={32} />} text="暂无用户" />
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((user: AdminUserItem) => (
              <div
                key={user.id}
                className={`p-4 hover:bg-[#1d1f23] transition-colors ${user.isBanned ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#2f3336] flex-shrink-0 flex items-center justify-center text-[#e7e9ea] font-medium overflow-hidden">
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt={user.nickname}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      user.nickname.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#e7e9ea] truncate">
                        {user.nickname}
                      </span>
                      {user.role === 'admin' ? (
                        <Badge variant="default" className="text-[10px]">
                          管理员
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          普通用户
                        </Badge>
                      )}
                      {user.isBanned && (
                        <Badge variant="destructive" className="text-[10px]">
                          已封禁
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{user.email}</div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                      <span>注册: {fmtDate(user.createdAt)}</span>
                      <span>帖子: {user.postCount}</span>
                      <span>文章: {user.articleCount}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 justify-end flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === user.id}
                    onClick={() =>
                      handleUserAction(user.id, user.role === 'admin' ? 'demote' : 'promote')
                    }
                    className="min-h-[44px] md:min-h-[36px] text-xs"
                    data-ai-section-type="button"
                  >
                    {user.role === 'admin' ? (
                      <><ShieldOff size={14} className="mr-1" />取消管理员</>
                    ) : (
                      <><Shield size={14} className="mr-1" />设为管理员</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant={user.isBanned ? 'outline' : 'destructive'}
                    disabled={actionLoading === user.id}
                    onClick={() =>
                      handleUserAction(user.id, user.isBanned ? 'unban' : 'ban')
                    }
                      className="min-h-[44px] md:min-h-[36px] text-xs"
                      data-ai-section-type="button"
                    >
                      {user.isBanned ? (
                        <><CircleCheck size={14} className="mr-1" />解封</>
                    ) : (
                      <><Ban size={14} className="mr-1" />封禁</>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}

// ─── 7. Reports Tab ────────────────────────────────────────
function ReportsTab(): React.ReactElement {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReportStatus | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getReports(
        page,
        PAGE_SIZE,
        status === 'all' ? undefined : status,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取举报列表失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const statusTabs: { key: ReportStatus | 'all'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待处理' },
    { key: 'resolved', label: '已处理' },
    { key: 'ignored', label: '已忽略' },
  ];

  const reasonMap: Record<ReportReason, string> = {
    spam: '垃圾信息',
    misinformation: '虚假信息',
    harassment: '骚扰/辱骂',
    infringement: '侵权',
    other: '其他',
  };

  const statusBadgeVariant = (s: ReportStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (s) {
      case 'pending':
        return 'default';
      case 'resolved':
        return 'secondary';
      case 'ignored':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const statusLabel = (s: ReportStatus): string => {
    switch (s) {
      case 'pending':
        return '待处理';
      case 'resolved':
        return '已处理';
      case 'ignored':
        return '已忽略';
      default:
        return s;
    }
  };

  const handleReportAction = async (
    reportId: string,
    action: 'resolve_delete' | 'resolve_ignore' | 'ban_author',
  ): Promise<void> => {
    const actionLabel = {
      resolve_delete: '删除内容并标记已处理',
      resolve_ignore: '忽略举报',
      ban_author: '封禁作者',
    }[action];
    if (!await showConfirm(`确定执行「${actionLabel}」操作吗？`)) return;
    setActionLoading(reportId);
    try {
      await adminApi.reportAction(reportId, action);
      toast.success('操作成功');
      await fetchData();
    } catch (err) {
      logger.error(`举报处理失败: ${action}`, err);
      toast.error('操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-[#2f3336] pb-3 overflow-x-auto scrollbar-hide">
        {statusTabs.map((tab: { key: ReportStatus | 'all'; label: string }) => (
           <Button
             key={tab.key}
             size="sm"
             variant={status === tab.key ? 'default' : 'ghost'}
             onClick={() => {
               setStatus(tab.key);
               setPage(1);
             }}
             className="flex-shrink-0 min-h-[44px] md:min-h-[40px]"
           >
             {tab.label}
           </Button>
        ))}
      </div>

      <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {loading && items.length === 0 ? (
          <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <StateCard icon={<AlertTriangle size={32} />} text={error} />
            <Button variant="outline" onClick={fetchData} className="mt-4">
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <StateCard icon={<Flag size={32} />} text="暂无举报" />
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((report: ReportItem) => (
              <div key={report.id} className="p-4 hover:bg-[#1d1f23] transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#e7e9ea]">
                      {report.reporterName}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {report.contentType}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {reasonMap[report.reason] || report.reason}
                    </Badge>
                    <Badge
                      variant={statusBadgeVariant(report.status)}
                      className="text-[10px]"
                    >
                      {statusLabel(report.status)}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {fmtDate(report.createdAt)}
                  </span>
                </div>
                {report.description && (
                  <p className="text-sm text-gray-400 mb-2">
                    描述: {report.description}
                  </p>
                )}
                {(report.contentPreview || report.contentTitle) && (
                  <div className="bg-black/30 border border-[#2f3336] rounded p-2 mb-2">
                    {report.contentTitle && (
                      <div className="text-sm font-medium text-[#e7e9ea] mb-1">
                        {report.contentTitle}
                      </div>
                    )}
                    {report.contentPreview && (
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {report.contentPreview}
                      </p>
                    )}
                    {report.contentAuthorName && (
                      <p className="text-xs text-gray-500 mt-1">
                        作者: {report.contentAuthorName}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 justify-end flex-wrap">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={actionLoading === report.id || report.status !== 'pending'}
                    onClick={() => handleReportAction(report.id, 'resolve_delete')}
                    className="min-h-[44px] md:min-h-0"
                  >
                    <Trash2 size={14} />
                    删除内容
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === report.id || report.status !== 'pending'}
                    onClick={() => handleReportAction(report.id, 'resolve_ignore')}
                    className="min-h-[44px] md:min-h-0"
                  >
                    忽略
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={actionLoading === report.id || report.status !== 'pending'}
                    onClick={() => handleReportAction(report.id, 'ban_author')}
                    className="min-h-[44px] md:min-h-0"
                  >
                    <Ban size={14} />
                    封禁作者
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}

// ─── 8. Site Settings Tab ──────────────────────────────────
function SiteSettingsTab(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [siteAnnouncement, setSiteAnnouncement] = useState('');
  const [allowRegister, setAllowRegister] = useState(true);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [contentModerationEnabled, setContentModerationEnabled] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('email_and_google');
  const [siteLogoUrl, setSiteLogoUrl] = useState('');

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const settings: SiteSettings = await siteSettingsApi.getSiteSettings();
      setSiteName(settings.siteName);
      setSiteDescription(settings.siteDescription || '');
      setSiteAnnouncement(settings.siteAnnouncement || '');
      setAllowRegister(settings.allowRegister);
      setGoogleLoginEnabled(settings.googleLoginEnabled);
      setContentModerationEnabled(settings.contentModerationEnabled);
      setRegistrationMode(settings.registrationMode);
      setSiteLogoUrl(settings.siteLogoUrl || '');
    } catch (err) {
      logger.error('获取站点设置失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await siteSettingsApi.updateSiteSettings({
        siteName,
        siteDescription,
        siteAnnouncement,
        allowRegister,
        googleLoginEnabled,
        contentModerationEnabled,
        registrationMode,
        siteLogoUrl,
      });
      toast.success('保存成功');
    } catch (err) {
      logger.error('保存站点设置失败', err);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <StateCard icon={<Loader2 size={32} className="animate-spin" />} text="加载中..." />;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <StateCard icon={<AlertTriangle size={32} />} text={error} />
        <Button variant="outline" onClick={fetchData} className="mt-4">
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* 站点名称 */}
      <div className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4">
        <Label htmlFor="siteName" className="text-[#e7e9ea] mb-2 block">
          站点名称
        </Label>
        <Input
          id="siteName"
          value={siteName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSiteName(e.target.value)}
          placeholder="请输入站点名称"
        />
      </div>

      {/* 站点 Logo */}
      <div className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4">
        <Label htmlFor="siteLogoUrl" className="text-[#e7e9ea] mb-2 block">
          站点 Logo URL
          <span className="text-xs text-gray-500 ml-2">（输入图片 URL 地址）</span>
        </Label>
        <Input
          id="siteLogoUrl"
          value={siteLogoUrl}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSiteLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
        />
        {siteLogoUrl && (
          <div className="mt-3 p-3 bg-black/30 rounded inline-block">
            <Image
              src={siteLogoUrl}
              alt="站点 Logo 预览"
              className="h-8 w-auto object-contain"
            />
          </div>
        )}
      </div>

      {/* 站点简介 */}
      <div className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4">
        <Label htmlFor="siteDescription" className="text-[#e7e9ea] mb-2 block">
          站点简介
        </Label>
        <Textarea
          id="siteDescription"
          value={siteDescription}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setSiteDescription(e.target.value)
          }
          placeholder="请输入站点简介"
          rows={3}
        />
      </div>

      {/* 站点公告 */}
      <div className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4">
        <Label htmlFor="siteAnnouncement" className="text-[#e7e9ea] mb-2 block">
          站点公告
          <span className="text-xs text-gray-500 ml-2">（显示在首页顶部公告栏）</span>
        </Label>
        <Textarea
          id="siteAnnouncement"
          value={siteAnnouncement}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setSiteAnnouncement(e.target.value)
          }
          placeholder="请输入站点公告内容"
          rows={3}
        />
      </div>

      {/* 开关设置 */}
      <div className="bg-[#16181c] border border-[#2f3336] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#e7e9ea]">开放注册</div>
            <div className="text-xs text-gray-500">是否允许新用户注册账号</div>
          </div>
          <Switch checked={allowRegister} onCheckedChange={setAllowRegister} />
        </div>

        <div className="border-t border-[#2f3336]" />

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#e7e9ea]">Google 登录</div>
            <div className="text-xs text-gray-500">是否启用 Google 第三方登录</div>
          </div>
          <Switch checked={googleLoginEnabled} onCheckedChange={setGoogleLoginEnabled} />
        </div>

        <div className="border-t border-[#2f3336]" />

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#e7e9ea]">内容审核</div>
            <div className="text-xs text-gray-500">发布内容是否需要审核后展示</div>
          </div>
          <Switch
            checked={contentModerationEnabled}
            onCheckedChange={setContentModerationEnabled}
          />
        </div>

        <div className="border-t border-[#2f3336]" />

        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium text-[#e7e9ea]">注册方式</div>
            <div className="text-xs text-gray-500 mb-2">允许用户使用哪些方式注册账号</div>
          </div>
          <Select value={registrationMode} onValueChange={(v) => setRegistrationMode(v as RegistrationMode)}>
            <SelectTrigger className="w-full bg-black border-[#2f3336] text-[#e7e9ea]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#16181c] border-[#2f3336] text-[#e7e9ea]">
              <SelectItem value="email_and_google">邮箱 + Google 登录</SelectItem>
              <SelectItem value="google_only">仅 Google 登录</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} data-ai-section-type="button">
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              保存中...
            </>
          ) : (
            '保存设置'
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Main AdminPage Component ──────────────────────────────
const AdminPage: React.FC = () => {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabKey>('dashboard');

  // Auth loading state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 size={32} className="animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  // Not admin
  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-[#16181c] border border-[#2f3336] rounded-xl p-8 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-[#e7e9ea] mb-2">无权限访问</h2>
          <p className="text-sm text-gray-500 mb-6">
            您没有管理员权限，无法访问管理后台。请使用管理员账号登录后重试。
          </p>
        </div>
      </div>
    );
  }

  const renderContent = (): React.ReactElement => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'moderation':
        return <ModerationTab />;
      case 'posts':
        return <PostsTab />;
      case 'articles':
        return <ArticlesTab />;
      case 'comments':
        return <CommentsTab />;
      case 'users':
        return <UsersTab />;
      case 'access-codes':
        return <AccessCodesManager />;
      case 'reports':
        return <ReportsTab />;
      case 'settings':
        return <SiteSettingsTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-black pb-24 md:pb-0 overflow-x-hidden">
      {/* 移动端：顶部横向滚动 Tab */}
      <div className="md:hidden sticky top-0 z-10 bg-[#16181c] border-b border-[#2f3336]">
        <div className="px-4 pt-3 pb-2">
          <h1 className="text-lg font-bold text-[#e7e9ea]">管理后台</h1>
        </div>
        <div className="flex overflow-x-auto gap-1.5 px-3 pb-2.5 scrollbar-hide">
          {ADMIN_TABS.map((tab: AdminTab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-full whitespace-nowrap text-sm transition-colors flex-shrink-0 ${
                  isActive
                    ? 'bg-[#1d9bf0]/10 text-[#1d9bf0] font-medium'
                    : 'text-gray-400 hover:bg-[#2f3336] hover:text-[#e7e9ea]'
                }`}
                data-ai-section-type="button"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex">
        {/* 桌面端：左侧侧边栏 Tab */}
        <aside className="hidden md:block w-56 border-r border-[#2f3336] bg-[#16181c] flex-shrink-0 py-4">
          <div className="px-4 mb-4">
            <h1 className="text-lg font-bold text-[#e7e9ea]">管理后台</h1>
            <p className="text-xs text-gray-500 mt-1">Admin Dashboard</p>
          </div>
          <nav className="space-y-1 px-2">
            {ADMIN_TABS.map((tab: AdminTab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm transition-colors text-left ${
                  activeTab === tab.key
                    ? 'bg-[#1d9bf0]/10 text-[#1d9bf0] font-medium'
                    : 'text-gray-400 hover:bg-[#2f3336] hover:text-[#e7e9ea]'
                }`}
                data-ai-section-type="button"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* 右侧内容区 */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 md:p-6">
          <div className="max-w-5xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
