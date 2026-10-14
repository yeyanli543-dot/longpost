import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Link2,
  Copy,
  Check,
  Share2,
  Download,
  Smartphone,
  ExternalLink,
  ChevronLeft,
  Sparkles,
  FileText,
  Rss,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import {
  WeChatIcon,
  QQIcon,
  WeiboIcon,
  QzoneIcon,
  DingTalkIcon,
  XIcon,
} from './ShareIcons';
import {
  SharePayload,
  formatShareText,
  formatQQShareText,
  copyTextToClipboard,
  canNativeShare,
  invokeNativeShare,
  openPlatformShare,
  isMobileDevice,
  isWeChatBrowser,
  isLocalUrl,
  getAbsoluteShareUrl,
} from './share-utils';
import { copyWeChatFormatted } from '@/lib/wechat-formatter';
import { exportObsidianMarkdown } from '@/lib/obsidian-exporter';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: SharePayload;
}

export default function ShareDialog({
  open,
  onOpenChange,
  payload,
}: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'platforms' | 'wechat' | 'qq'>('platforms');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedQQText, setCopiedQQText] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);

  useEffect(() => {
    setHasNativeShare(canNativeShare());
  }, []);

  const fullShareUrl = getAbsoluteShareUrl(payload.url);
  const isLocal = isLocalUrl(fullShareUrl);

  // 当对话框打开时预先生成扫码直达二维码
  useEffect(() => {
    if (open && fullShareUrl) {
      QRCode.toDataURL(fullShareUrl, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error('生成二维码失败:', err));
    } else {
      setActiveTab('platforms');
    }
  }, [open, fullShareUrl]);

  const handleCopyLink = async () => {
    const success = await copyTextToClipboard(fullShareUrl, '链接已复制到剪贴板');
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyShareText = async () => {
    const text = formatShareText({ ...payload, url: fullShareUrl });
    const success = await copyTextToClipboard(text, '微信分享文案已复制，可直接粘贴');
    if (success) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const handleCopyQQShareText = async () => {
    const text = formatQQShareText({ ...payload, url: fullShareUrl });
    const success = await copyTextToClipboard(text, 'QQ 推荐文案已复制，可直接在 QQ 聊天窗粘贴');
    if (success) {
      setCopiedQQText(true);
      setTimeout(() => setCopiedQQText(false), 2000);
    }
  };

  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = qrCodeDataUrl;
    a.download = `longpost-${activeTab === 'qq' ? 'qq' : 'wechat'}-qrcode-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleNativeShare = async () => {
    const invoked = await invokeNativeShare({ ...payload, url: fullShareUrl });
    if (invoked) {
      onOpenChange(false);
    }
  };

  const handleCopyWeChat = async () => {
    await copyWeChatFormatted({
      title: payload.title,
      content: payload.content || payload.summary || '',
      authorName: payload.authorName,
      publishedAt: payload.publishedAt,
      coverUrl: payload.coverUrl,
      url: payload.url,
      excerpt: payload.summary,
    });
  };

  const handleExportObsidian = () => {
    exportObsidianMarkdown({
      title: payload.title,
      content: payload.content || payload.summary || '',
      authorName: payload.authorName,
      publishedAt: payload.publishedAt,
      updatedAt: payload.updatedAt,
      tags: payload.tags,
      slug: payload.slug,
      url: payload.url,
      excerpt: payload.summary,
    });
  };

  const handleCopyRss = async () => {
    const rssUrl = `${window.location.origin}/rss.xml`;
    await copyTextToClipboard(
      rssUrl,
      'RSS 2.0 聚合订阅源已复制，可粘贴至 Follow / Reeder 等阅读器',
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#16181c] border border-[#2f3336] text-[#e7e9ea] p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="pb-2 border-b border-[#2f3336]/60">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <Share2 className="w-5 h-5 text-[#1d9bf0]" />
              {activeTab === 'wechat' ? '微信扫一扫分享' : activeTab === 'qq' ? 'QQ 扫码直达与分享' : '分享长文'}
            </DialogTitle>
            {activeTab !== 'platforms' && (
              <button
                onClick={() => setActiveTab('platforms')}
                className="text-xs text-[#71767b] hover:text-[#1d9bf0] flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                返回平台列表
              </button>
            )}
          </div>
        </DialogHeader>

        {/* 顶部文章导读微卡片 */}
        <div className="bg-[#1e2124] border border-[#2f3336] rounded-xl p-3 flex gap-3 items-center">
          {payload.coverUrl ? (
            <img
              src={payload.coverUrl}
              alt={payload.title}
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-neutral-800"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-blue-600/30 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Share2 className="w-6 h-6 text-blue-400/80" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">
              {payload.title}
            </h4>
            <p className="text-xs text-[#71767b] truncate mt-0.5">
              {payload.authorName ? `@${payload.authorName} · ` : ''}
              {payload.summary || 'LongPost 沉浸式图文长文'}
            </p>
          </div>
        </div>

        {/* 主视图 1：全主流社交平台九宫格 */}
        {activeTab === 'platforms' && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-4 gap-3 text-center">
              {/* 微信 */}
              <button
                onClick={() => {
                  if (isWeChatBrowser()) {
                    copyTextToClipboard(fullShareUrl, '微信内长按或点击右上角「···」即可直接分享给好友或朋友圈');
                  } else if (isMobileDevice() && hasNativeShare) {
                    handleNativeShare();
                  } else {
                    setActiveTab('wechat');
                  }
                }}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="微信分享与扫码"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#07C160]/15 group-hover:bg-[#07C160]/25 text-[#07C160] flex items-center justify-center transition-colors shadow-sm">
                  <WeChatIcon className="w-7 h-7" />
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-[#07C160] transition-colors">
                  微信
                </span>
              </button>

              {/* QQ 好友 */}
              <button
                onClick={() => {
                  if (isMobileDevice() && hasNativeShare) {
                    handleNativeShare();
                  } else {
                    setActiveTab('qq');
                  }
                }}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="QQ 扫码直达与分享"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#12B7F5]/15 group-hover:bg-[#12B7F5]/25 text-[#12B7F5] flex items-center justify-center transition-colors shadow-sm">
                  <QQIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-[#12B7F5] transition-colors">
                  QQ 好友
                </span>
              </button>

              {/* QQ 空间 */}
              <button
                onClick={() => openPlatformShare('qzone', payload)}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="分享到 QQ 空间动态"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#FFCE00]/15 group-hover:bg-[#FFCE00]/25 text-[#FFCE00] flex items-center justify-center transition-colors shadow-sm">
                  <QzoneIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-[#FFCE00] transition-colors">
                  QQ 空间
                </span>
              </button>

              {/* 新浪微博 */}
              <button
                onClick={() => openPlatformShare('weibo', payload)}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="发布到新浪微博"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#E6162D]/15 group-hover:bg-[#E6162D]/25 text-[#E6162D] flex items-center justify-center transition-colors shadow-sm">
                  <WeiboIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-[#E6162D] transition-colors">
                  新浪微博
                </span>
              </button>

              {/* 钉钉 */}
              <button
                onClick={() => openPlatformShare('dingtalk', payload)}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="分享到钉钉工作圈或消息"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#0089FF]/15 group-hover:bg-[#0089FF]/25 text-[#0089FF] flex items-center justify-center transition-colors shadow-sm">
                  <DingTalkIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-[#0089FF] transition-colors">
                  钉钉
                </span>
              </button>

              {/* X (Twitter) */}
              <button
                onClick={() => openPlatformShare('twitter', payload)}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="分享到 X (Twitter)"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/10 group-hover:bg-white/20 text-white flex items-center justify-center transition-colors shadow-sm">
                  <XIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-white transition-colors">
                  X
                </span>
              </button>

              {/* 系统原生分享 (移动端 / 原生环境激活) */}
              {hasNativeShare ? (
                <button
                  onClick={handleNativeShare}
                  className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                  title="调用系统原生分享面板"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 group-hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center transition-colors shadow-sm">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-emerald-400 transition-colors">
                    系统分享
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleCopyShareText}
                  className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                  title="复制图文导读文案"
                >
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/15 group-hover:bg-purple-500/25 text-purple-400 flex items-center justify-center transition-colors shadow-sm">
                    {copiedText ? (
                      <Check className="w-6 h-6 text-green-400" />
                    ) : (
                      <Copy className="w-6 h-6" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-purple-400 transition-colors">
                    复制文案
                  </span>
                </button>
              )}

              {/* 复制链接 */}
              <button
                onClick={handleCopyLink}
                className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#1f2227] active:scale-95 transition-all"
                title="复制文章直接访问链接"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 group-hover:bg-blue-500/25 text-blue-400 flex items-center justify-center transition-colors shadow-sm">
                  {copiedLink ? (
                    <Check className="w-6 h-6 text-green-400" />
                  ) : (
                    <Link2 className="w-6 h-6" />
                  )}
                </div>
                <span className="text-xs font-medium text-gray-200 group-hover:text-blue-400 transition-colors">
                  复制链接
                </span>
              </button>
            </div>

            {/* 跨应用互联与知识库导出 */}
            <div className="pt-2 border-t border-[#2f3336]/60">
              <div className="text-[11px] font-semibold text-[#71767b] mb-2 px-1 flex items-center justify-between">
                <span>跨应用连结与知识库互通</span>
                <span className="text-[10px] text-blue-400/80">全生态套件</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* 微信公众号排版 */}
                <button
                  onClick={handleCopyWeChat}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[#1e2124] hover:bg-[#282c31] border border-[#2f3336] text-left transition-all active:scale-95 group"
                  title="复制带内联 CSS 样式的公众号富文本，在微信后台直接粘贴"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#07C160]/15 text-[#07C160] flex items-center justify-center flex-shrink-0 group-hover:bg-[#07C160]/25 transition-colors">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                      公众号排版
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      内联富文本
                    </div>
                  </div>
                </button>

                {/* Obsidian 导出 */}
                <button
                  onClick={handleExportObsidian}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[#1e2124] hover:bg-[#282c31] border border-[#2f3336] text-left transition-all active:scale-95 group"
                  title="导出带完整 YAML Frontmatter 的 Markdown 笔记"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition-colors">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                      Obsidian 笔记
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      Frontmatter
                    </div>
                  </div>
                </button>

                {/* RSS 订阅源 */}
                <button
                  onClick={handleCopyRss}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[#1e2124] hover:bg-[#282c31] border border-[#2f3336] text-left transition-all active:scale-95 group"
                  title="复制 RSS 2.0 订阅链接，导入 Follow / Reeder / NetNewsWire"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/25 transition-colors">
                    <Rss className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                      RSS 订阅源
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      Follow/Reeder
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* 底部链接展示条 */}
            <div className="pt-2">
              <div className="flex items-center gap-2 bg-[#0d0e11] border border-[#2f3336] rounded-xl px-3 py-2 text-xs">
                <Link2 className="w-4 h-4 text-[#71767b] flex-shrink-0" />
                <input
                  type="text"
                  readOnly
                  value={fullShareUrl}
                  className="bg-transparent text-gray-300 w-full outline-none font-mono select-all truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white rounded-lg font-medium transition-colors flex-shrink-0"
                >
                  {copiedLink ? '已复制' : '复制'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 主视图 2：微信专属扫码卡片 */}
        {activeTab === 'wechat' && (
          <div className="pt-2 flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-[#07C160]/30 inline-block">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="微信分享二维码"
                  className="w-48 h-48 block rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-gray-400 text-xs">
                  正在生成二维码...
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-white flex items-center justify-center gap-1.5">
                <WeChatIcon className="w-4 h-4 text-[#07C160]" />
                打开手机微信「扫一扫」
              </p>
              <p className="text-xs text-[#71767b] max-w-xs leading-relaxed">
                扫码即可直接阅读，或点击右上角「···」分享给好友、转发至微信群与朋友圈
              </p>
              {isLocal && (
                <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 mt-1">
                  💡 提示：当前为局域网/本地环境，手机扫码请确保与电脑连接同一 Wi-Fi
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 w-full pt-1">
              <button
                onClick={handleCopyShareText}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-[#1e2124] hover:bg-[#282c31] border border-[#2f3336] text-xs font-medium text-gray-200 rounded-xl transition-colors active:scale-95"
              >
                {copiedText ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-[#07C160]" />
                )}
                复制微信文案
              </button>
              <button
                onClick={handleDownloadQrCode}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-medium rounded-xl transition-colors shadow-sm active:scale-95"
              >
                <Download className="w-4 h-4" />
                保存二维码图片
              </button>
            </div>
          </div>
        )}

        {/* 主视图 3：QQ 专属直达扫码卡片（彻底解决第三方挂件扫码打不开的顽疾） */}
        {activeTab === 'qq' && (
          <div className="pt-2 flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-[#12B7F5]/30 inline-block relative">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QQ 分享直达二维码"
                  className="w-48 h-48 block rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-gray-400 text-xs">
                  正在生成二维码...
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-white flex items-center justify-center gap-1.5">
                <QQIcon className="w-4 h-4 text-[#12B7F5]" />
                打开手机 QQ「扫一扫」直达阅读
              </p>
              <p className="text-xs text-[#71767b] max-w-xs leading-relaxed">
                直通本篇长文落地页，扫码即开；也可一键复制专属卡片文案直接发送给 QQ 好友
              </p>
              {isLocal && (
                <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 mt-1">
                  💡 提示：当前为局域网/本地环境，手机扫码请确保与电脑连接同一 Wi-Fi
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
              <button
                onClick={handleCopyQQShareText}
                className="flex items-center justify-center gap-2 py-2 px-3 bg-[#1e2124] hover:bg-[#282c31] border border-[#2f3336] text-xs font-medium text-gray-200 rounded-xl transition-colors active:scale-95"
              >
                {copiedQQText ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-[#12B7F5]" />
                )}
                复制 QQ 推荐文案
              </button>
              <button
                onClick={() => openPlatformShare('qq', { ...payload, url: fullShareUrl })}
                className="flex items-center justify-center gap-2 py-2 px-3 bg-[#12B7F5] hover:bg-[#0ea5e9] text-white text-xs font-medium rounded-xl transition-colors shadow-sm active:scale-95"
              >
                <ExternalLink className="w-4 h-4" />
                QQ 网页分享窗口
              </button>
            </div>
            <div className="w-full">
              <button
                onClick={handleDownloadQrCode}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#1e2124] hover:bg-[#282c31] border border-[#2f3336] text-xs font-medium text-gray-300 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4 text-[#12B7F5]" />
                保存 QQ 扫码海报图片
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
