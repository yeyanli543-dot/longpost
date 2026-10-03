import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import {
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
} from './token-storage';

export { getToken, setToken, clearToken, isAuthenticated };
import type {
  AuthUser,
  UserProfile,
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  UpdatePreferencesRequest,
  BookmarkListResponse,
  UserHomepageResponse,
} from '@shared/api.interface';

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await axiosForBackend.post('/api/auth/register', data);
  return response.data;
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await axiosForBackend.post('/api/auth/login', data);
  return response.data;
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const response = await axiosForBackend.get('/api/auth/me');
  return response.data;
}

export async function updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
  const response = await axiosForBackend.patch('/api/auth/profile', data);
  return response.data;
}

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await axiosForBackend.post('/api/auth/password', data);
}

export async function updatePreferences(data: UpdatePreferencesRequest): Promise<UserProfile> {
  const response = await axiosForBackend.patch('/api/auth/preferences', data);
  return response.data;
}

export async function getUserProfile(userId: string): Promise<AuthUser> {
  const response = await axiosForBackend.get(`/api/auth/users/${userId}`);
  return response.data;
}

export async function getUserHomepage(userId: string): Promise<UserHomepageResponse> {
  try {
    const response = await axiosForBackend.get(`/api/auth/users/${userId}/homepage`);
    return response.data;
  } catch (error) {
    logger.error('获取用户主页失败', error);
    throw error;
  }
}

export async function getGoogleAuthUrl(redirectTo?: string): Promise<{ url: string }> {
  const params = redirectTo
    ? `?redirectTo=${encodeURIComponent(redirectTo)}`
    : '';
  const response = await axiosForBackend.get(`/api/auth/google/url${params}`);
  return response.data;
}

export async function handleGoogleCallback(code: string, state?: string): Promise<AuthResponse & { redirectTo?: string }> {
  const params = new URLSearchParams({ code });
  if (state) params.set('state', state);
  const response = await axiosForBackend.get(`/api/auth/google/callback?${params.toString()}`);
  return response.data;
}

export async function getMyBookmarks(): Promise<BookmarkListResponse> {
  try {
    const response = await axiosForBackend.get('/api/auth/me/bookmarks');
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      logger.warn('未登录，跳过获取收藏');
    } else {
      logger.error('获取收藏失败', error);
    }
    throw error;
  }
}
