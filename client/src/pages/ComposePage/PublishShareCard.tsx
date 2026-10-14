import { useState } from 'react';
import {
  Share2,
  Link2,
  Copy,
  Check,
  ArrowRight,
  FileText,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import {
  WeChatIcon,
  QQIcon,
  WeiboIcon,
  XIcon,
} from '@/components/share/ShareIcons';
import ShareDialog from '@/components/share/ShareDialog';
import {
  SharePayload,
  copyTextToClipboard,
  formatShareText,
  canNativeShare,
  invokeNativeShare,
  openPlatformShare,
} from '@/components/share/share-utils';

interface PublishShareCardProps {
  title: string;
  excerpt: string;
  coverUrl: string | null;
  firstImageUrl: string | null;
  shareUrl: string;
  onViewArticle: () => void;
  onReset: () => void;
}

export default function PublishShareCard({
  title,
  excerpt,
  coverUrl,
  firstImageUrl,
  shareUrl,
  onViewArticle,
  onReset,
}: PublishShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const cardImage = coverUrl || firstImageUrl;

  const payload: SharePayload = {
    title,
    url: shareUrl,
    summary: excerpt,
    coverUrl: cardImage,
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl, '链接已复制，可粘贴到微信、QQ、微博等平台');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyShareText = async () => {
    const text = formatShareText(payload);
    const ok = await copyTextToClipboard(text, '分享文案已复制');
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    await invokeNativeShare(payload);
  };

  return (
    <div className="border border-blue-500/30 bg-blue-500/5 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Share2 className="w-4 h-4 text-blue-500" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-100">文章已发布</p>
          <p className="text-xs text-gray-400">一键分享至微信、QQ、微博、X 等主流社交平台</p>
        </div>
      </div>

      {/* Share card preview */}
      <div className="bg-black/50 border border-gray-800 rounded-xl overflow-hidden mb-4">
        {cardImage ? (
          <div className="w-full aspect-[2/1] overflow-hidden">
            <Image
              src={cardImage}
              alt={title}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-full aspect-[2/1] bg-gradient-to-br from-blue-900/50 to-gray-900 flex items-center justify-center">
            <FileText className="w-12 h-12 text-blue-500/50" />
          </div>
        )}
        <div className="p-4">
          <h3 className="text-lg font-bold text-gray-100 line-clamp-2 mb-2">
            {title}
          </h3>
          {excerpt && (
            <p className="text-sm text-gray-400 line-clamp-2 mb-3">
              {excerpt}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono truncate">
            <Link2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{shareUrl}</span>
          </div>
        </div>
      </div>

      {/* 快捷国内主流分享按钮矩阵 */}
      <div className="bg-[#111317] border border-gray-800/80 rounded-xl p-3 mb-4">
        <p className="text-xs font-semibold text-gray-400 mb-2.5">快捷分享到：</p>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {/* 微信 */}
          <button
            onClick={() => setDialogOpen(true)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[#07C160]/10 hover:bg-[#07C160]/20 text-[#07C160] transition-colors"
            title="微信扫码分享"
          >
            <WeChatIcon className="w-5 h-5" />
            <span className="text-[11px] font-medium text-gray-300">微信</span>
          </button>

          {/* QQ 好友 */}
          <button
            onClick={() => openPlatformShare('qq', payload)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[#12B7F5]/10 hover:bg-[#12B7F5]/20 text-[#12B7F5] transition-colors"
            title="QQ 好友分享"
          >
            <QQIcon className="w-5 h-5" />
            <span className="text-[11px] font-medium text-gray-300">QQ</span>
          </button>

          {/* 新浪微博 */}
          <button
            onClick={() => openPlatformShare('weibo', payload)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[#E6162D]/10 hover:bg-[#E6162D]/20 text-[#E6162D] transition-colors"
            title="新浪微博分享"
          >
            <WeiboIcon className="w-5 h-5" />
            <span className="text-[11px] font-medium text-gray-300">微博</span>
          </button>

          {/* X (Twitter) */}
          <button
            onClick={() => openPlatformShare('twitter', payload)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
            title="X (Twitter) 分享"
          >
            <XIcon className="w-4 h-4 my-0.5" />
            <span className="text-[11px] font-medium text-gray-300">X</span>
          </button>

          {/* 系统分享 (若可用) */}
          {canNativeShare() && (
            <button
              onClick={handleNativeShare}
              className="flex flex-col items-center gap-1 p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
              title="系统原生分享"
            >
              <Smartphone className="w-5 h-5" />
              <span className="text-[11px] font-medium text-gray-300">系统</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleCopyLink}
          className="flex items-center justify-center gap-2 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors"
          data-ai-section-type="button"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              链接已复制
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4" />
              复制链接
            </>
          )}
        </button>
        <button
          onClick={handleCopyShareText}
          className="flex items-center justify-center gap-2 py-2.5 border border-gray-700 text-gray-300 text-sm font-medium rounded-full hover:bg-gray-900 transition-colors"
          data-ai-section-type="button"
        >
          {copiedText ? (
            <>
              <Check className="w-4 h-4" />
              分享文案已复制
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              复制图文导读文案
            </>
          )}
        </button>
        <div className="flex gap-2 mt-1">
          <button
            onClick={onViewArticle}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-700 text-gray-300 text-sm font-medium rounded-full hover:bg-gray-900 transition-colors"
            data-ai-section-type="button"
          >
            去看看
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onReset}
            className="px-5 py-2.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            data-ai-section-type="button"
          >
            再写一篇
          </button>
        </div>
      </div>

      {/* 完整分享弹窗 */}
      <ShareDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payload={payload}
      />
    </div>
  );
}
