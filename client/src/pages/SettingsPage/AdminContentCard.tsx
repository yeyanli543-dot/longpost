import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { articlesApi, postsApi } from '@client/src/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
import type { AdminContentListResponse, PostItem, ArticleSummary } from '@shared/api.interface';
import { showConfirm } from '@/lib';

interface AdminContentCardProps {
  isAdmin: boolean;
}

const AdminContentCard: React.FC<AdminContentCardProps> = ({ isAdmin }) => {
  const [contentLoading, setContentLoading] = useState(false);
  const [contentData, setContentData] = useState<AdminContentListResponse | null>(null);
  const [contentType, setContentType] = useState<string>('all');
  const [contentQuery, setContentQuery] = useState('');

  const loadAdminContent = async (): Promise<void> => {
    if (!isAdmin) return;
    setContentLoading(true);
    try {
      const data = await articlesApi.getAdminContent(
        contentType === 'all' ? undefined : contentType,
        contentQuery || undefined,
      );
      setContentData(data);
    } catch (err) {
      logger.error('获取内容列表失败', err);
      toast.error('获取内容列表失败');
    } finally {
      setContentLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && !contentData && !contentLoading) {
      void loadAdminContent();
    }
  }, [isAdmin]);

  const handleDeletePost = async (id: string): Promise<void> => {
    if (!await showConfirm('确定要删除这条帖子吗？此操作不可撤销。')) return;
    try {
      await postsApi.deletePost(id);
      setContentData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.filter((p: PostItem) => p.id !== id),
          totalPosts: prev.totalPosts - 1,
        };
      });
      toast.success('帖子已删除');
    } catch (err) {
      logger.error('删除帖子失败', err);
      toast.error('删除失败，请稍后重试');
    }
  };

  const handleDeleteArticle = async (id: string): Promise<void> => {
    if (!await showConfirm('确定要删除这篇文章吗？此操作不可撤销。')) return;
    try {
      await articlesApi.deleteArticle(id);
      setContentData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          articles: prev.articles.filter((a: ArticleSummary) => a.id !== id),
          totalArticles: prev.totalArticles - 1,
        };
      });
      toast.success('文章已删除');
    } catch (err) {
      logger.error('删除文章失败', err);
      toast.error('删除失败，请稍后重试');
    }
  };

  if (!isAdmin) return null;

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <CardTitle className="text-lg">内容管理</CardTitle>
        <CardDescription>查看和管理站点内的所有内容</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={contentQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContentQuery(e.target.value)}
              placeholder="按关键词搜索"
            />
          </div>
          <Select value={contentType} onValueChange={(val: string) => setContentType(val)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="post">帖子</SelectItem>
              <SelectItem value="article">文章</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => { void loadAdminContent(); }} variant="secondary" data-ai-section-type="button">搜索</Button>
        </div>

        {contentLoading ? (
          <p className="text-gray-500 py-4 text-center">加载中...</p>
        ) : contentData ? (
          <div className="space-y-4" data-ai-section-type="card-list">
            {(contentType === 'all' || contentType === 'post') && contentData.posts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">帖子 ({contentData.totalPosts})</h3>
                <div className="space-y-2">
                  {contentData.posts.map((post: PostItem) => (
                    <div key={post.id} className="p-3 border border-gray-800 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200">{post.authorName}</p>
                          <p className="text-sm text-gray-300 mt-1 break-words">{post.content}</p>
                          <p className="text-xs text-gray-500 mt-2">{new Date(post.createdAt).toLocaleString('zh-CN')}</p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { void handleDeletePost(post.id); }}
                          data-ai-section-type="button"
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(contentType === 'all' || contentType === 'article') && contentData.articles.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">文章 ({contentData.totalArticles})</h3>
                <div className="space-y-2">
                  {contentData.articles.map((article: ArticleSummary) => (
                    <div key={article.id} className="p-3 border border-gray-800 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-100 truncate">{article.title}</p>
                          <p className="text-xs text-gray-500 mt-1">作者：{article.authorName} · {new Date(article.createdAt).toLocaleDateString('zh-CN')}</p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { void handleDeleteArticle(article.id); }}
                          data-ai-section-type="button"
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {contentData.posts.length === 0 && contentData.articles.length === 0 && (
              <p className="text-gray-500 py-4 text-center">暂无内容</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default AdminContentCard;
