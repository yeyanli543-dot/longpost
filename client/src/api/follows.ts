import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import type {
  FollowUserResponse,
  FollowListResponse,
  UserPublicProfile,
} from '@shared/api.interface';

export async function toggleFollow(
  userId: string,
): Promise<FollowUserResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/follows/${userId}`,
    );
    return response.data;
  } catch (error) {
    logger.error('关注操作失败', error);
    throw error;
  }
}

export async function getFollowing(
  userId: string,
  cursor?: string,
  limit: number = 20,
): Promise<FollowListResponse> {
  try {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    const response = await axiosForBackend.get(
      `/api/follows/following/${userId}?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取关注列表失败', error);
    throw error;
  }
}

export async function getFollowers(
  userId: string,
  cursor?: string,
  limit: number = 20,
): Promise<FollowListResponse> {
  try {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    const response = await axiosForBackend.get(
      `/api/follows/followers/${userId}?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取粉丝列表失败', error);
    throw error;
  }
}

export async function getMyFollowing(): Promise<UserPublicProfile[]> {
  try {
    const response = await axiosForBackend.get('/api/follows/me/following');
    return response.data;
  } catch (error) {
    logger.error('获取我的关注列表失败', error);
    throw error;
  }
}
