import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  ArticleDetail,
  ArticleSummary,
  CreateArticleRequest,
  CreateArticleResponse,
  SearchResponse,
  AdminContentListResponse,
} from '@shared/api.interface';

export async function getArticle(id: string): Promise<ArticleDetail> {
  try {
    const response = await axiosForBackend.get(`/api/articles/${id}`);
    return response.data;
  } catch (error) {
    logger.error('获取文章失败', error);
    throw error;
  }
}

export async function getArticleBySlug(slug: string): Promise<ArticleDetail> {
  try {
    const response = await axiosForBackend.get(`/api/articles/slug/${slug}`);
    return response.data;
  } catch (error) {
    logger.error('通过 slug 获取文章失败', error);
    throw error;
  }
}

export async function getArticles(authorId?: string): Promise<{ items: ArticleSummary[] }> {
  try {
    const params = new URLSearchParams();
    if (authorId) params.set('authorId', authorId);
    const response = await axiosForBackend.get(
      `/api/articles${params.toString() ? `?${params.toString()}` : ''}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取文章列表失败', error);
    throw error;
  }
}

export async function createArticle(data: CreateArticleRequest): Promise<CreateArticleResponse> {
  try {
    const response = await axiosForBackend.post('/api/articles', data);
    return response.data;
  } catch (error) {
    logger.error('发布文章失败', error);
    throw error;
  }
}

export async function updateArticle(
  id: string,
  data: {
    title?: string;
    content?: string;
    excerpt?: string;
    coverUrl?: string;
    status?: 'published' | 'draft';
    images?: Array<{ imageUrl: string; sortOrder: number }>;
    attachments?: Array<{
      fileName: string;
      fileUrl: string;
      fileSize?: number;
      fileType?: string;
      sortOrder: number;
    }>;
  },
): Promise<void> {
  try {
    await axiosForBackend.patch(`/api/articles/${id}`, data);
  } catch (error) {
    logger.error('更新文章失败', error);
    throw error;
  }
}

export async function deleteArticle(id: string): Promise<void> {
  try {
    await axiosForBackend.delete(`/api/articles/${id}`);
  } catch (error) {
    logger.error('删除文章失败', error);
    throw error;
  }
}

export async function getAdminContent(type?: string, q?: string): Promise<AdminContentListResponse> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (q) params.set('q', q);
  const response = await axiosForBackend.get(`/api/admin/content?${params.toString()}`);
  return response.data;
}

export type SearchType = 'all' | 'posts' | 'users' | 'hashtags';

export async function search(
  q: string,
  type: SearchType = 'all',
  page: number = 1,
  pageSize: number = 20,
): Promise<SearchResponse> {
  try {
    const params = new URLSearchParams({
      q,
      type,
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await axiosForBackend.get(
      `/api/search?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('搜索失败', error);
    throw error;
  }
}

export async function getUserArticles(userId: string): Promise<{ items: ArticleSummary[] }> {
  try {
    const response = await axiosForBackend.get(`/api/users/${userId}/articles`);
    return response.data;
  } catch (error) {
    logger.error('获取用户文章失败', error);
    throw error;
  }
}

export async function getMyArticles(): Promise<{ items: ArticleSummary[] }> {
  try {
    const response = await axiosForBackend.get('/api/me/articles');
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      logger.warn('未登录，跳过获取我的文章');
    } else {
      logger.error('获取我的文章失败', error);
    }
    throw error;
  }
}
