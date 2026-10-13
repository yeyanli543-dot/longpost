import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';

export * as postsApi from './posts';
export * as articlesApi from './articles';
export * as authApi from './auth';
export * as siteSettingsApi from './site-settings';
export * as interactionsApi from './interactions';
export * as commentsApi from './comments';
export * as followsApi from './follows';
export * as notificationsApi from './notifications';
export * as hashtagsApi from './hashtags';
export * as adminApi from './admin';
export * as dmApi from './dm';
export * as meetingsApi from './meetings';
export * as accessCodesApi from './access-codes';
export * as uploadsApi from './upload';

// Add more API functions here, use axios instance (`axiosForBackend`) to make requests.
// 
// 使用示例：
// export async function getUserData(userId: string) {
//   try {
//     const response = await axiosForBackend({
//       url: `/api/users/${userId}`,
//       method: 'GET'
//     });
//     return response.data;
//   } catch (error) {
//     logger.error('获取用户数据失败', error);
//     throw error;
//   }
// }
