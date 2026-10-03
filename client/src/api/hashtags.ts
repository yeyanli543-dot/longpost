import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  TrendingHashtagsResponse,
  HashtagTimelineResponse,
} from '@shared/api.interface';

export async function getTrendingHashtags(
  limit: number = 10,
): Promise<TrendingHashtagsResponse> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    const response = await axiosForBackend.get(
      `/api/hashtags/trending?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取热门话题失败', error);
    throw error;
  }
}

export async function getHashtagTimeline(
  tag: string,
  cursor?: string,
  limit: number = 20,
): Promise<HashtagTimelineResponse> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const response = await axiosForBackend.get(
      `/api/hashtags/${encodeURIComponent(tag)}?${params.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error(`获取话题 #${tag} 时间线失败`, error);
    throw error;
  }
}

// 兼容旧调用
export async function getTrending(
  limit: number = 10,
): Promise<TrendingHashtagsResponse> {
  return getTrendingHashtags(limit);
}
