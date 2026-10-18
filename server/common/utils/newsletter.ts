/**
 * Newsletter 的纯逻辑：邮箱规范化、令牌、邮件正文模板。
 *
 * 这些函数不碰数据库、不发网络请求，所以能被单测直接覆盖 ——
 * 邮件这种「发出去就收不回来」的东西，模板和链接拼错一次就够尴尬的。
 */

import { randomBytes } from 'crypto';

/** 统一小写并去掉首尾空白；不做任何"智能"纠错，错了就是错了 */
export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/**
 * 邮箱校验。
 * 刻意保守：只接受正常形状的地址，允许带 + 号的别名，
 * 拒绝含空格、连续点、以及超长本地部分。
 */
export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  if (email.includes('..')) return false;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64) return false;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) return false;

  return true;
}

/** 一次性令牌：确认订阅与退订各用各的，避免拿一个链接干两件事 */
export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/** HTML 转义，用于把用户可控内容塞进邮件模板 */
export function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/** 邮件外壳：极简、单栏、不依赖任何外部图片 */
function shell(siteName: string, bodyHtml: string, footerHtml: string): string {
  return [
    '<div style="margin:0;padding:24px 12px;background:#f5f6f8;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;font-family:' + FONT + ';color:#1f2328;line-height:1.7;">',
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #e8eaed;margin:28px 0 16px;" />',
    '<div style="font-size:12px;color:#8b949e;line-height:1.8;">' + footerHtml + '</div>',
    '</div></div>',
  ].join('');
}

/** 订阅确认信（双向确认的第一步） */
export function buildConfirmEmail(options: {
  siteName: string;
  email: string;
  confirmUrl: string;
}): RenderedEmail {
  const site = escapeHtml(options.siteName || 'LongPost');
  const confirmUrl = escapeHtml(options.confirmUrl);

  const subject = '确认订阅 ' + (options.siteName || 'LongPost');
  const text = [
    '你好，',
    '',
    '有人用这个邮箱订阅了 ' + (options.siteName || 'LongPost') + ' 的更新。',
    '如果是你本人操作，请打开下面的链接完成确认：',
    '',
    options.confirmUrl,
    '',
    '确认后，每当我发布新文章，你都会收到一封邮件。',
    '如果不是你本人操作，忽略这封邮件即可，不会发生任何事。',
  ].join('\n');

  const html = shell(
    options.siteName,
    [
      '<p style="margin:0 0 16px;font-size:15px;">你好，</p>',
      '<p style="margin:0 0 16px;font-size:15px;">有人用 <strong>' + escapeHtml(options.email) + '</strong> 订阅了 ' + site + ' 的更新。</p>',
      '<p style="margin:0 0 20px;font-size:15px;">如果是你本人操作，点下面的按钮完成确认：</p>',
      '<p style="margin:0 0 24px;"><a href="' + confirmUrl + '" style="display:inline-block;padding:11px 22px;background:#1f6feb;color:#ffffff;text-decoration:none;border-radius:9px;font-size:15px;">确认订阅</a></p>',
      '<p style="margin:0;font-size:13px;color:#6e7781;">按钮点不开的话，复制这个地址到浏览器：<br /><span style="word-break:break-all;">' + confirmUrl + '</span></p>',
    ].join(''),
    '如果不是你本人操作，忽略这封邮件即可，不会发生任何事。',
  );

  return { subject, text, html };
}

/** 新文章推送 */
export function buildArticleIssueEmail(options: {
  siteName: string;
  title: string;
  summary: string;
  url: string;
  authorName?: string;
  unsubscribeUrl: string;
}): RenderedEmail {
  const site = escapeHtml(options.siteName || 'LongPost');
  const title = escapeHtml(options.title || '无标题');
  const summary = escapeHtml(options.summary || '');
  const url = escapeHtml(options.url);
  const author = escapeHtml(options.authorName || '');
  const unsubscribeUrl = escapeHtml(options.unsubscribeUrl);

  const subject = options.title || '新文章';
  const text = [
    (options.authorName ? options.authorName + ' 发布了新文章：' : '新文章：') + (options.title || ''),
    '',
    options.summary || '',
    '',
    '阅读全文：' + options.url,
    '',
    '——',
    '退订（不想再收到邮件）：' + options.unsubscribeUrl,
  ].join('\n');

  const html = shell(
    options.siteName,
    [
      '<p style="margin:0 0 6px;font-size:12px;color:#8b949e;letter-spacing:.04em;">' + site + (author ? ' · ' + author : '') + '</p>',
      '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.4;">' + title + '</h1>',
      summary ? '<p style="margin:0 0 24px;font-size:15px;color:#3d444d;">' + summary + '</p>' : '',
      '<p style="margin:0 0 8px;"><a href="' + url + '" style="display:inline-block;padding:11px 22px;background:#1f6feb;color:#ffffff;text-decoration:none;border-radius:9px;font-size:15px;">阅读全文</a></p>',
    ].join(''),
    '你收到这封邮件，是因为订阅了 ' + site + ' 的更新。<br /><a href="' + unsubscribeUrl + '" style="color:#8b949e;">退订</a>',
  );

  return { subject, text, html };
}

/** 退订确认页用的极简 HTML */
export function buildStatusPage(options: {
  title: string;
  message: string;
  siteName?: string;
}): string {
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<title>' + escapeHtml(options.title) + '</title></head>',
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#e6edf3;font-family:' + FONT + ';">',
    '<div style="max-width:420px;padding:40px 28px;text-align:center;">',
    '<h1 style="font-size:20px;margin:0 0 12px;">' + escapeHtml(options.title) + '</h1>',
    '<p style="margin:0;color:#8b949e;line-height:1.8;">' + escapeHtml(options.message) + '</p>',
    options.siteName
      ? '<p style="margin:24px 0 0;font-size:13px;color:#6e7681;">' + escapeHtml(options.siteName) + '</p>'
      : '',
    '</div></body></html>',
  ].join('');
}
