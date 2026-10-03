import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  MeetingListResponse,
  MeetingDetailResponse,
  CreateMeetingRequest,
  CreateMeetingResponse,
  UpdateMeetingRequest,
  AddParticipantsRequest,
  MeetingChatListResponse,
  SendMeetingChatRequest,
  SendMeetingChatResponse,
  MeetingMinutes,
  UpdateMeetingMinutesRequest,
  UpdateMeetingMinutesResponse,
  MeetingCodeLookupResponse,
} from '@shared/api.interface';

export async function getMeetings(
  params: { status?: string; page?: number; pageSize?: number } = {},
): Promise<MeetingListResponse> {
  try {
    const query: Record<string, string | number> = {};
    if (params.status) query.status = params.status;
    if (params.page) query.page = params.page;
    if (params.pageSize) query.pageSize = params.pageSize;
    const response = await axiosForBackend.get('/api/meetings', { params: query });
    return response.data;
  } catch (error) {
    logger.error('获取会议列表失败', error);
    throw error;
  }
}

export async function createMeeting(
  data: CreateMeetingRequest,
): Promise<CreateMeetingResponse> {
  try {
    const response = await axiosForBackend.post('/api/meetings', data);
    return response.data;
  } catch (error) {
    logger.error('创建会议失败', error);
    throw error;
  }
}

export async function getMeeting(id: string): Promise<MeetingDetailResponse> {
  try {
    const response = await axiosForBackend.get(`/api/meetings/${id}`);
    return response.data;
  } catch (error) {
    logger.error('获取会议详情失败', error);
    throw error;
  }
}

export async function updateMeeting(
  id: string,
  data: UpdateMeetingRequest,
): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.patch(`/api/meetings/${id}`, data);
    return response.data;
  } catch (error) {
    logger.error('更新会议失败', error);
    throw error;
  }
}

export async function cancelMeeting(id: string): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.delete(`/api/meetings/${id}`);
    return response.data;
  } catch (error) {
    logger.error('取消会议失败', error);
    throw error;
  }
}

export async function addParticipants(
  id: string,
  userIds: string[],
): Promise<{ success: boolean }> {
  try {
    const data: AddParticipantsRequest = { userIds };
    const response = await axiosForBackend.post(
      `/api/meetings/${id}/participants`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('添加参会人失败', error);
    throw error;
  }
}

export async function removeParticipant(
  meetingId: string,
  userId: string,
): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.delete(
      `/api/meetings/${meetingId}/participants/${userId}`,
    );
    return response.data;
  } catch (error) {
    logger.error('移除参会人失败', error);
    throw error;
  }
}

export async function joinMeeting(id: string): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.post(`/api/meetings/${id}/join`);
    return response.data;
  } catch (error) {
    logger.error('加入会议失败', error);
    throw error;
  }
}

export async function leaveMeeting(id: string): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.post(`/api/meetings/${id}/leave`);
    return response.data;
  } catch (error) {
    logger.error('退出会议失败', error);
    throw error;
  }
}

export async function endMeeting(id: string): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.post(`/api/meetings/${id}/end`);
    return response.data;
  } catch (error) {
    logger.error('结束会议失败', error);
    throw error;
  }
}

export async function getChatMessages(
  meetingId: string,
  cursor?: string,
  limit = 50,
): Promise<MeetingChatListResponse> {
  try {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const response = await axiosForBackend.get(
      `/api/meetings/${meetingId}/chat`,
      { params },
    );
    return response.data;
  } catch (error) {
    logger.error('获取会议聊天消息失败', error);
    throw error;
  }
}

export async function sendChatMessage(
  meetingId: string,
  content: string,
): Promise<SendMeetingChatResponse> {
  try {
    const data: SendMeetingChatRequest = { content };
    const response = await axiosForBackend.post(
      `/api/meetings/${meetingId}/chat`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('发送会议聊天消息失败', error);
    throw error;
  }
}

export async function getMinutes(
  meetingId: string,
): Promise<MeetingMinutes | null> {
  try {
    const response = await axiosForBackend.get(
      `/api/meetings/${meetingId}/minutes`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取会议纪要失败', error);
    throw error;
  }
}

export async function updateMinutes(
  meetingId: string,
  content: string,
): Promise<UpdateMeetingMinutesResponse> {
  try {
    const data: UpdateMeetingMinutesRequest = { content };
    const response = await axiosForBackend.put(
      `/api/meetings/${meetingId}/minutes`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('更新会议纪要失败', error);
    throw error;
  }
}

export async function getMeetingByCode(
  code: string,
): Promise<MeetingCodeLookupResponse> {
  try {
    const response = await axiosForBackend.get(`/api/meetings/code/${code}`);
    return response.data;
  } catch (error) {
    logger.error('通过会议码查询会议失败', error);
    throw error;
  }
}
