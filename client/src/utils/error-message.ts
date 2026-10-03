/**
 * 将技术性错误信息转换为用户友好的文案
 * 用于 toast.error 等展示场景
 */

export function getFriendlyErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error === null || error === undefined) return fallback;

  let message = '';

  // 从 Error 对象提取
  if (error instanceof Error) {
    message = error.message;
  }
  // 从 axios 响应错误提取
  else if (typeof error === 'object') {
    const err = error as {
      response?: { status?: number; statusText?: string; data?: { message?: string } };
      message?: string;
      code?: string;
    };
    if (err.response?.data?.message) {
      message = err.response.data.message;
    } else if (err.response?.statusText) {
      message = err.response.statusText;
    } else if (err.message) {
      message = err.message;
    }
    // 加入状态码用于匹配
    if (err.response?.status) {
      message = `${message} ${err.response.status}`;
    }
    if (err.code) {
      message = `${message} ${err.code}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  if (!message) return fallback;

  const lower = message.toLowerCase();

  // 401 / Unauthorized / token
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('token')
  ) {
    return '登录已过期，请重新登录';
  }

  // 403 / Forbidden / 权限
  if (
    lower.includes('403') ||
    lower.includes('forbidden') ||
    lower.includes('权限')
  ) {
    return '你没有权限执行此操作';
  }

  // 404 / Not Found
  if (
    lower.includes('404') ||
    lower.includes('not found')
  ) {
    return '请求的资源不存在';
  }

  // 500 / 502 / 503 / Network Error / timeout
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('network error') ||
    lower.includes('timeout') ||
    lower.includes('网络错误')
  ) {
    return '网络异常，请稍后重试';
  }

  // 其他业务类错误保持原样
  return message || fallback;
}
