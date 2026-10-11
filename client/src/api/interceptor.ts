import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';
import { getToken, clearToken } from './token-storage';
import type { AxiosError, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';

let interceptorInstalled = false;

const RETRY_COUNT_HEADER = 'x-retry-count';
const AUTH_RETRY_HEADER = 'x-auth-retry';

function isRetryableError(error: AxiosError): boolean {
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500;
}

function getRetryCount(config: InternalAxiosRequestConfig): number {
  const v = config.headers?.[RETRY_COUNT_HEADER];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getDelayForRetry(retry: number): number {
  return retry === 1 ? 1000 : 2000;
}

export function installAuthInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  axiosForBackend.interceptors.request.use(
    (config) => {
      const token = getToken();
      if (token) {
        if (!config.headers) {
          config.headers = {} as InternalAxiosRequestConfig['headers'];
        }
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  axiosForBackend.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig | undefined;
      if (!config) return Promise.reject(error);

      const url = config.url || '';
      const isAuthEndpoint =
        url.includes('/api/auth/login') ||
        url.includes('/api/auth/register');

      if (error.response?.status === 401) {
        if (isAuthEndpoint) return Promise.reject(error);

        const alreadyRetried = config.headers?.[AUTH_RETRY_HEADER] === '1';
        if (!alreadyRetried) {
          const tokenBefore = getToken();
          clearToken();
          const recovered = getToken();
          if (recovered && recovered !== tokenBefore) {
            logger.info('[auth-retry] 从备份通道恢复 token 后重试请求', url);
            const headers = config.headers || ({} as AxiosHeaders);
            headers[AUTH_RETRY_HEADER] = '1';
            headers.Authorization = `Bearer ${recovered}`;
            config.headers = headers;
            return axiosForBackend(config);
          }
          logger.warn('[auth] 401 且所有通道均无有效 token，登出', url);
          window.dispatchEvent(new CustomEvent('auth:logout', { detail: { url } }));
          (error as { isAuthError?: boolean }).isAuthError = true;
          return Promise.reject(error);
        }
        logger.warn('[auth] 401 重试后仍失败，登出', url);
        clearToken();
        window.dispatchEvent(new CustomEvent('auth:logout', { detail: { url } }));
        (error as { isAuthError?: boolean }).isAuthError = true;
        return Promise.reject(error);
      }

      if (isRetryableError(error)) {
        const retryCount = getRetryCount(config);
        if (retryCount < 2) {
          const next = retryCount + 1;
          const delay = getDelayForRetry(next);
          logger.info(`[retry] ${url} 第 ${next} 次重试，延迟 ${delay}ms`);
          const headers = config.headers || ({} as AxiosHeaders);
          headers[RETRY_COUNT_HEADER] = String(next);
          config.headers = headers;
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delay);
          });
          return axiosForBackend(config);
        }
        logger.warn(`[retry] ${url} 重试 ${retryCount} 次仍失败，放弃`);
      }

      return Promise.reject(error);
    },
  );
}
