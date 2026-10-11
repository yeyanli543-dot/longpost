import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import type {
  AdminDashboardStats,
  AdminPostListResponse,
  AdminArticleListResponse,
  AdminCommentListResponse,
  AdminContentActionRequest,
  AdminBatchDeleteRequest,
  AdminUserListResponse,
  AdminUserActionRequest,
  ReportListResponse,
  ReportActionRequest,
  CreateReportRequest,
  ReportStatus,
  ModerationReviewRequest,
} from '@shared/api.interface';

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  try {
    const response = await axiosForBackend.get('/api/admin/stats');
    return response.data;
  } catch (error) {
    logger.error('获取仪表盘统计失败', error);
    throw error;
  }
}

export async function getAdminPosts(
  page: number,
  pageSize: number,
  keyword?: string,
): Promise<AdminPostListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (keyword) params.set('keyword', keyword);
    const response = await axiosForBackend.get(
      `/api/admin/posts?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取管理端帖子列表失败', error);
    throw error;
  }
}

export async function getAdminArticles(
  page: number,
  pageSize: number,
  keyword?: string,
): Promise<AdminArticleListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (keyword) params.set('keyword', keyword);
    const response = await axiosForBackend.get(
      `/api/admin/articles?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取管理端文章列表失败', error);
    throw error;
  }
}

export async function getAdminComments(
  page: number,
  pageSize: number,
  keyword?: string,
): Promise<AdminCommentListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (keyword) params.set('keyword', keyword);
    const response = await axiosForBackend.get(
      `/api/admin/comments?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取管理端评论列表失败', error);
    throw error;
  }
}

export async function postContentAction(
  contentType: 'post' | 'article',
  id: string,
  action: AdminContentActionRequest['action'],
): Promise<void> {
  try {
    const path = contentType === 'post' ? 'posts' : 'articles';
    await axiosForBackend.patch(`/api/admin/${path}/${id}/action`, { action });
  } catch (error) {
    logger.error(`内容操作失败: ${action}`, error);
    throw error;
  }
}

export async function batchDeletePosts(ids: string[]): Promise<void> {
  try {
    const body: AdminBatchDeleteRequest = { ids };
    await axiosForBackend.post('/api/admin/posts/batch-delete', body);
  } catch (error) {
    logger.error('批量删除帖子失败', error);
    throw error;
  }
}

export async function batchDeleteArticles(ids: string[]): Promise<void> {
  try {
    const body: AdminBatchDeleteRequest = { ids };
    await axiosForBackend.post('/api/admin/articles/batch-delete', body);
  } catch (error) {
    logger.error('批量删除文章失败', error);
    throw error;
  }
}

export async function batchDeleteComments(ids: string[]): Promise<void> {
  try {
    const body: AdminBatchDeleteRequest = { ids };
    await axiosForBackend.post('/api/admin/comments/batch-delete', body);
  } catch (error) {
    logger.error('批量删除评论失败', error);
    throw error;
  }
}

export async function getAdminUsers(
  page: number,
  pageSize: number,
  keyword?: string,
): Promise<AdminUserListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (keyword) params.set('keyword', keyword);
    const response = await axiosForBackend.get(
      `/api/admin/users?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取管理端用户列表失败', error);
    throw error;
  }
}

export async function userAction(
  userId: string,
  action: AdminUserActionRequest['action'],
  reason?: string,
): Promise<void> {
  try {
    const body: AdminUserActionRequest = { action };
    if (reason !== undefined) body.reason = reason;
    await axiosForBackend.patch(`/api/admin/users/${userId}/action`, body);
  } catch (error) {
    logger.error(`用户操作失败: ${action}`, error);
    throw error;
  }
}

export async function getReports(
  page: number,
  pageSize: number,
  status?: ReportStatus,
): Promise<ReportListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.set('status', status);
    const response = await axiosForBackend.get(
      `/api/admin/reports?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取举报列表失败', error);
    throw error;
  }
}

export async function reportAction(
  reportId: string,
  action: ReportActionRequest['action'],
  reason?: string,
): Promise<void> {
  try {
    const body: ReportActionRequest = { action };
    if (reason !== undefined) body.reason = reason;
    await axiosForBackend.patch(`/api/admin/reports/${reportId}/action`, body);
  } catch (error) {
    logger.error(`举报处理失败: ${action}`, error);
    throw error;
  }
}

export async function createReport(data: CreateReportRequest): Promise<void> {
  try {
    await axiosForBackend.post('/api/reports', data);
  } catch (error) {
    logger.error('提交举报失败', error);
    throw error;
  }
}

// ─── Moderation Queue ──────────────────────────────────────

export async function getModerationPosts(
  page: number,
  pageSize: number,
): Promise<AdminPostListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await axiosForBackend.get(
      `/api/admin/moderation/posts?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取待审核帖子列表失败', error);
    throw error;
  }
}

export async function getModerationArticles(
  page: number,
  pageSize: number,
): Promise<AdminArticleListResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await axiosForBackend.get(
      `/api/admin/moderation/articles?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取待审核文章列表失败', error);
    throw error;
  }
}

export async function reviewPost(
  id: string,
  status: ModerationReviewRequest['status'],
  reason?: string,
): Promise<void> {
  try {
    const body: ModerationReviewRequest = { status };
    if (reason !== undefined) body.reason = reason;
    await axiosForBackend.patch(`/api/admin/moderation/posts/${id}`, body);
  } catch (error) {
    logger.error(`帖子审核失败: ${status}`, error);
    throw error;
  }
}

export async function reviewArticle(
  id: string,
  status: ModerationReviewRequest['status'],
  reason?: string,
): Promise<void> {
  try {
    const body: ModerationReviewRequest = { status };
    if (reason !== undefined) body.reason = reason;
    await axiosForBackend.patch(`/api/admin/moderation/articles/${id}`, body);
  } catch (error) {
    logger.error(`文章审核失败: ${status}`, error);
    throw error;
  }
}

// ─── CSV Export ────────────────────────────────────────────

async function downloadCsv(url: string, filename: string): Promise<void> {
  try {
    const response = await axiosForBackend.get(url, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    logger.error(`导出 CSV 失败: ${filename}`, error);
    throw error;
  }
}

export async function exportUsers(): Promise<void> {
  await downloadCsv('/api/admin/export/users.csv', 'users.csv');
}

export async function exportPosts(): Promise<void> {
  await downloadCsv('/api/admin/export/posts.csv', 'posts.csv');
}

export async function exportArticles(): Promise<void> {
  await downloadCsv('/api/admin/export/articles.csv', 'articles.csv');
}

export async function exportComments(): Promise<void> {
  await downloadCsv('/api/admin/export/comments.csv', 'comments.csv');
}
