import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  TimelineResponse,
  TimelineView,
  PostItem,
  CreatePostRequest,
  CreatePostResponse,
} from '@shared/api.interface';

export async function getTimeline(
  cursor?: string,
  limit: number = 20,
  view: TimelineView = 'all',
): Promise<TimelineResponse> {
  try {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    params.set('view', view);
    const response = await axiosForBackend.get(`/api/timeline?${params.toString()}`);
    return response.data;
  } catch (error) {
    logger.error('获取时间线失败', error);
    throw error;
  }
}

export async function getPost(id: string): Promise<PostItem> {
  try {
    const response = await axiosForBackend.get(`/api/posts/${id}`);
    return response.data;
  } catch (error) {
    logger.error('获取帖子失败', error);
    throw error;
  }
}

export async function createPost(data: CreatePostRequest): Promise<CreatePostResponse> {
  try {
    const response = await axiosForBackend.post('/api/posts', data);
    return response.data;
  } catch (error) {
    logger.error('发布帖子失败', error);
    throw error;
  }
}

export async function deletePost(id: string): Promise<void> {
  try {
    await axiosForBackend.delete(`/api/posts/${id}`);
  } catch (error) {
    logger.error('删除帖子失败', error);
    throw error;
  }
}

export async function getUserPosts(userId: string): Promise<{ items: PostItem[] }> {
  try {
    const response = await axiosForBackend.get(`/api/users/${userId}/posts`);
    return response.data;
  } catch (error) {
    logger.error('获取用户帖子失败', error);
    throw error;
  }
}

export async function getMyPosts(): Promise<{ items: PostItem[] }> {
  try {
    const response = await axiosForBackend.get('/api/me/posts');
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      logger.warn('未登录，跳过获取我的帖子');
    } else {
      logger.error('获取我的帖子失败', error);
    }
    throw error;
  }
}
