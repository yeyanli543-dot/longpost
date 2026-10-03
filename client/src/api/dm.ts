import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { getToken } from './auth';
import type {
  DMConversationListResponse,
  DMMessageListResponse,
  DMCreateConversationRequest,
  DMCreateConversationResponse,
  DMSendMessageRequest,
  DMSendMessageResponse,
  DMUnreadCountResponse,
  DMSearchUserResponse,
} from '@shared/api.interface';

export async function getConversations(): Promise<DMConversationListResponse> {
  try {
    const response = await axiosForBackend.get('/api/dm/conversations');
    return response.data;
  } catch (error) {
    logger.error('获取会话列表失败', error);
    throw error;
  }
}

export async function createConversation(
  userId: string,
): Promise<DMCreateConversationResponse> {
  try {
    const data: DMCreateConversationRequest = { userId };
    const response = await axiosForBackend.post('/api/dm/conversations', data);
    return response.data;
  } catch (error) {
    logger.error('创建会话失败', error);
    throw error;
  }
}

export async function getMessages(
  conversationId: string,
  cursor?: string,
  limit = 30,
): Promise<DMMessageListResponse> {
  try {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const response = await axiosForBackend.get(
      `/api/dm/conversations/${conversationId}/messages`,
      { params },
    );
    return response.data;
  } catch (error) {
    logger.error('获取消息列表失败', error);
    throw error;
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<DMSendMessageResponse> {
  try {
    const data: DMSendMessageRequest = { content };
    const response = await axiosForBackend.post(
      `/api/dm/conversations/${conversationId}/messages`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('发送消息失败', error);
    throw error;
  }
}

export async function deleteConversation(
  conversationId: string,
): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.delete(
      `/api/dm/conversations/${conversationId}`,
    );
    return response.data;
  } catch (error) {
    logger.error('删除会话失败', error);
    throw error;
  }
}

export async function getUnreadCount(): Promise<DMUnreadCountResponse> {
  if (!getToken()) {
    return { totalUnread: 0 };
  }
  try {
    const response = await axiosForBackend.get('/api/dm/unread-count');
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      logger.warn('未登录，跳过获取未读消息数');
    } else {
      logger.error('获取未读消息数失败', error);
    }
    throw error;
  }
}

export async function searchUsers(
  q: string,
  limit = 10,
): Promise<DMSearchUserResponse> {
  try {
    const response = await axiosForBackend.get('/api/dm/search-users', {
      params: { q, limit },
    });
    return response.data;
  } catch (error) {
    logger.error('搜索用户失败', error);
    throw error;
  }
}
