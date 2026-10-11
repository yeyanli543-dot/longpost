import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import { getToken } from './auth';
import type {
  NotificationListResponse,
  MarkNotificationsReadRequest,
} from '@shared/api.interface';

export async function getNotifications(
  cursor?: string,
  limit = 20,
): Promise<NotificationListResponse> {
  try {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const response = await axiosForBackend.get('/api/notifications', {
      params,
    });
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      logger.warn('未登录，跳过获取通知列表');
    } else {
      logger.error('获取通知列表失败', error);
    }
    throw error;
  }
}

export async function getUnreadCount(): Promise<{ unreadCount: number }> {
  if (!getToken()) {
    return { unreadCount: 0 };
  }
  try {
    const response = await axiosForBackend.get(
      '/api/notifications/unread-count',
    );
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      logger.warn('未登录，跳过获取未读计数');
    } else {
      logger.error('获取未读计数失败', error);
    }
    throw error;
  }
}

export async function markNotificationsRead(
  ids?: string[],
  all?: boolean,
): Promise<{ success: boolean }> {
  try {
    const data: MarkNotificationsReadRequest = {};
    if (ids !== undefined) data.ids = ids;
    if (all !== undefined) data.all = all;
    const response = await axiosForBackend.post('/api/notifications/read', data);
    return response.data;
  } catch (error) {
    logger.error('标记通知已读失败', error);
    throw error;
  }
}

// 兼容旧调用
export async function markRead(
  data: MarkNotificationsReadRequest,
): Promise<void> {
  await markNotificationsRead(data.ids, data.all);
}
