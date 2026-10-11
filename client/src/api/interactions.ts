import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import type {
  ToggleLikeRequest,
  ToggleLikeResponse,
  ToggleBookmarkRequest,
  ToggleBookmarkResponse,
  ToggleRepostRequest,
  ToggleRepostResponse,
} from '@shared/api.interface';

export async function toggleLike(
  data: ToggleLikeRequest,
): Promise<ToggleLikeResponse> {
  try {
    const response = await axiosForBackend.post(
      '/api/interactions/like',
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('点赞操作失败', error);
    throw error;
  }
}

export async function toggleBookmark(
  data: ToggleBookmarkRequest,
): Promise<ToggleBookmarkResponse> {
  try {
    const response = await axiosForBackend.post(
      '/api/interactions/bookmark',
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('收藏操作失败', error);
    throw error;
  }
}

export async function toggleRepost(
  data: ToggleRepostRequest,
): Promise<ToggleRepostResponse> {
  try {
    const response = await axiosForBackend.post(
      '/api/interactions/repost',
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('转发操作失败', error);
    throw error;
  }
}
