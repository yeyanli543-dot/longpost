import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import type {
  CommentListResponse,
  CommentItem,
  CommentContentType,
  CreateCommentRequest,
  CommentSortMode,
  ToggleCommentLikeResponse,
} from '@shared/api.interface';

export async function getComments(
  contentType: CommentContentType,
  contentId: string,
  options?: {
    sort?: CommentSortMode;
    cursor?: string;
    limit?: number;
  },
): Promise<CommentListResponse> {
  try {
    const params = new URLSearchParams({
      contentType,
      contentId,
    });
    if (options?.sort) params.set('sort', options.sort);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    const response = await axiosForBackend.get(
      `/api/comments?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取评论列表失败', error);
    throw error;
  }
}

export async function getReplies(
  commentId: string,
  cursor?: string,
  limit: number = 10,
): Promise<CommentListResponse> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const response = await axiosForBackend.get(
      `/api/comments/${commentId}/replies?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取回复列表失败', error);
    throw error;
  }
}

export async function createComment(
  data: CreateCommentRequest,
): Promise<CommentItem> {
  try {
    const response = await axiosForBackend.post('/api/comments', data);
    return response.data;
  } catch (error) {
    logger.error('发布评论失败', error);
    throw error;
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  try {
    await axiosForBackend.delete(`/api/comments/${commentId}`);
  } catch (error) {
    logger.error('删除评论失败', error);
    throw error;
  }
}

export async function toggleCommentLike(
  commentId: string,
): Promise<ToggleCommentLikeResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/comments/${commentId}/like`,
    );
    return response.data;
  } catch (error) {
    logger.error('评论点赞操作失败', error);
    throw error;
  }
}
