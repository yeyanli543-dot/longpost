import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AccessCodeListResponse,
  AccessCodeItem,
  CreateAccessCodeRequest,
  UpdateAccessCodeRequest,
  BatchCreateAccessCodeRequest,
  BatchCreateAccessCodeResponse,
  AccessCodeLogListResponse,
  AuthResponse,
} from '@shared/api.interface';

export async function listAccessCodes(params: {
  page: number;
  pageSize: number;
  keyword?: string;
}): Promise<AccessCodeListResponse> {
  try {
    const search = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
    });
    if (params.keyword) search.set('keyword', params.keyword);
    const response = await axiosForBackend.get(
      `/api/admin/access-codes?${search.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取访问码列表失败', error);
    throw error;
  }
}

export async function createAccessCode(
  data: CreateAccessCodeRequest,
): Promise<AccessCodeItem> {
  try {
    const response = await axiosForBackend.post(
      '/api/admin/access-codes',
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('创建访问码失败', error);
    throw error;
  }
}

export async function batchCreateAccessCodes(
  data: BatchCreateAccessCodeRequest,
): Promise<BatchCreateAccessCodeResponse> {
  try {
    const response = await axiosForBackend.post(
      '/api/admin/access-codes/batch',
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('批量创建访问码失败', error);
    throw error;
  }
}

export async function updateAccessCode(
  id: string,
  data: UpdateAccessCodeRequest,
): Promise<AccessCodeItem> {
  try {
    const response = await axiosForBackend.patch(
      `/api/admin/access-codes/${id}`,
      data,
    );
    return response.data;
  } catch (error) {
    logger.error('更新访问码失败', error);
    throw error;
  }
}

export async function toggleAccessCodeStatus(
  id: string,
  status: 'active' | 'disabled',
): Promise<AccessCodeItem> {
  try {
    const response = await axiosForBackend.post(
      `/api/admin/access-codes/${id}/toggle`,
      { status },
    );
    return response.data;
  } catch (error) {
    logger.error('切换访问码状态失败', error);
    throw error;
  }
}

export async function deleteAccessCode(id: string): Promise<void> {
  try {
    await axiosForBackend.delete(`/api/admin/access-codes/${id}`);
  } catch (error) {
    logger.error('删除访问码失败', error);
    throw error;
  }
}

export async function loginWithCode(code: string): Promise<AuthResponse> {
  try {
    const response = await axiosForBackend.post(
      '/api/auth/access-code/login',
      { code },
    );
    return response.data;
  } catch (error) {
    logger.error('访问码登录失败', error);
    throw error;
  }
}

export async function setPassword(password: string): Promise<void> {
  try {
    await axiosForBackend.post('/api/auth/set-password', { password });
  } catch (error) {
    logger.error('设置密码失败', error);
    throw error;
  }
}

export async function getAccessCodeLogs(
  codeId: string,
  page: number,
  pageSize: number,
): Promise<AccessCodeLogListResponse> {
  try {
    const search = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await axiosForBackend.get(
      `/api/admin/access-codes/${codeId}/logs?${search.toString()}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取访问码使用记录失败', error);
    throw error;
  }
}
