import axios, { type AxiosInstance } from 'axios';

const CLIENT_BASE_PATH = (typeof process !== 'undefined' && process.env?.CLIENT_BASE_PATH) || '/';

export const axiosForBackend: AxiosInstance = axios.create({
  baseURL: CLIENT_BASE_PATH,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 响应拦截器：统一处理错误响应与登录跳转提示
axiosForBackend.interceptors.response.use(
  (response) => response,
  (error) => {
    // 处理未授权或失效
    if (error.response?.status === 401) {
      const loginUrl = error.response.headers?.['x-login-url'];
      if (loginUrl && typeof window !== 'undefined') {
        window.location.href = loginUrl;
      }
    }
    return Promise.reject(error);
  },
);

export function getAxiosForBackend(): AxiosInstance {
  return axiosForBackend;
}
