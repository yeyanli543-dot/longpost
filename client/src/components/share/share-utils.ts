import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface SharePayload {
  title: string;
  url: string;
  summary?: string;
  authorName?: string;
  coverUrl?: string | null;
  content?: string;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  tags?: string[];
  slug?: string;
}

/**
 * 格式化用于国内即时通信与朋友圈的长文分享文案
 */
export function formatShareText(payload: SharePayload): string {
  const author = payload.authorName ? `by ${payload.authorName}` : '';
  const summary = payload.summary ? `\n“${payload.summary.trim().slice(0, 80)}...”` : '';
  return `【长文推荐】《${payload.title}》${author ? ' ' + author : ''}${summary}\n👉 完整阅读：${payload.url}`;
}

/**
 * 复制文本并给出防抖提示
 */
export async function copyTextToClipboard(text: string, successMessage = '已复制到剪贴板'): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
      return true;
    }
    // 降级方案：创建临时 textarea 元素
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (successful) {
      toast.success(successMessage);
      return true;
    }
    throw new Error('execCommand copy returned false');
  } catch (err) {
    logger.error('复制到剪贴板失败', err);
    toast.error('复制失败，请手动长按或选择文本复制');
    return false;
  }
}

/**
 * 判断当前是否为移动端触屏设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

/**
 * 判断是否在微信内置浏览器内
 */
export function isWeChatBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

/**
 * 判断是否在手机 QQ 内置浏览器内
 */
export function isQQBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return /\bQQ\//i.test(navigator.userAgent) || /MQQBrowser/i.test(navigator.userAgent);
}

/**
 * 判断 URL 是否属于本地局域网或 localhost
 */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || /^192\.168\./.test(u.hostname) || /^10\./.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * 确保返回完整的绝对 HTTP/HTTPS URL
 */
export function getAbsoluteShareUrl(url: string): string {
  if (!url) {
    return typeof window !== 'undefined' ? window.location.href : '';
  }
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== 'undefined') {
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${window.location.origin}${cleanPath}`;
  }
  return url;
}

/**
 * 格式化用于 QQ 好友与 QQ 群的精炼推荐卡片文案
 */
export function formatQQShareText(payload: SharePayload): string {
  const fullUrl = getAbsoluteShareUrl(payload.url);
  const author = payload.authorName ? ` [作者: @${payload.authorName}]` : '';
  const summary = payload.summary ? `\n> 导读：${payload.summary.trim().slice(0, 100)}...` : '';
  return `📰【长文分享】《${payload.title}》${author}${summary}\n🔗 点击阅读全文：${fullUrl}\n—— 来自 LongPost 本地优先长文平台`;
}

/**
 * 判断当前环境是否支持系统原生分享 (Android / iOS / Safari / Edge 等)
 */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * 调用系统原生分享面板 (直接拉起手机里的微信、QQ、备忘录等已安装 App)
 */
export async function invokeNativeShare(payload: SharePayload): Promise<boolean> {
  if (!canNativeShare()) return false;
  try {
    const fullUrl = getAbsoluteShareUrl(payload.url);
    await navigator.share({
      title: payload.title,
      text: formatShareText({ ...payload, url: fullUrl }),
      url: fullUrl,
    });
    return true;
  } catch (err: unknown) {
    // 用户主动取消分享不报错
    if (err instanceof Error && err.name === 'AbortError') {
      return false;
    }
    logger.warn('系统分享调用中断，降级为复制链接', err);
    return false;
  }
}

/**
 * 分享到外部平台 (QQ / 微博 / QQ空间 / 钉钉 / X)
 */
export function openPlatformShare(
  platform: 'qq' | 'qzone' | 'weibo' | 'dingtalk' | 'twitter',
  payload: SharePayload
) {
  const fullUrl = getAbsoluteShareUrl(payload.url);
  const { title, summary = '', coverUrl = '' } = payload;
  const encodedUrl = encodeURIComponent(fullUrl);
  const encodedTitle = encodeURIComponent(title);
  const encodedSummary = encodeURIComponent(summary.slice(0, 120));
  const encodedPic = encodeURIComponent(coverUrl || '');
  const shareText = formatShareText({ ...payload, url: fullUrl });

  // 在移动端优先尝试调起手机 QQ 原生协议
  if (platform === 'qq' && isMobileDevice()) {
    try {
      const scheme = `mqqapi://share/to_fri?src_type=web&version=1&file_type=news&title=${encodedTitle}&description=${encodedSummary}&url=${encodedUrl}&previewimageUrl=${encodedPic}`;
      window.location.href = scheme;
      // 延迟检查，如果 1.5 秒后未切后台，说明未安装或无法拉起，降级复制文案
      setTimeout(() => {
        copyTextToClipboard(formatQQShareText(payload), '已复制 QQ 分享文案，可直接在 QQ 聊天窗粘贴');
      }, 1500);
      return;
    } catch {
      // 降级走网页端点
    }
  }

  let targetUrl = '';

  switch (platform) {
    case 'qq':
      // 腾讯 QQ 好友官方网页分享端点，确保传递完整的绝对 URL
      targetUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodedUrl}&title=${encodedTitle}&summary=${encodedSummary}&desc=${encodedSummary}&pics=${encodedPic}&site=LongPost`;
      break;
    case 'qzone':
      // 腾讯 QQ 空间分享
      targetUrl = `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${encodedUrl}&title=${encodedTitle}&summary=${encodedSummary}&pics=${encodedPic}&desc=${encodedSummary}`;
      break;
    case 'weibo':
      // 新浪微博分享
      targetUrl = `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodeURIComponent(shareText)}&pic=${encodedPic}&searchPic=true`;
      break;
    case 'dingtalk':
      // 钉钉分享
      targetUrl = `https://service.dingtalk.com/share?url=${encodedUrl}&title=${encodedTitle}`;
      break;
    case 'twitter':
      // X (Twitter)
      targetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodedUrl}`;
      break;
  }

  if (targetUrl) {
    const width = 640;
    const height = 560;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    window.open(
      targetUrl,
      `_blank_${platform}`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=1,location=no,status=no`
    );
  }
}
