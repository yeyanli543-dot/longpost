import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface SharePayload {
  title: string;
  url: string;
  summary?: string;
  authorName?: string;
  coverUrl?: string | null;
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
    await navigator.share({
      title: payload.title,
      text: formatShareText(payload),
      url: payload.url,
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
  const { title, url, summary = '', coverUrl = '' } = payload;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedSummary = encodeURIComponent(summary.slice(0, 120));
  const encodedPic = encodeURIComponent(coverUrl || '');
  const shareText = formatShareText(payload);

  let targetUrl = '';

  switch (platform) {
    case 'qq':
      // 腾讯 QQ 好友官方网页分享端点
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
