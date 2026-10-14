import { useState } from 'react';
import {
  Link2,
  Copy,
  Check,
  Share2,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import {
  WeChatIcon,
  QQIcon,
  WeiboIcon,
  QzoneIcon,
  DingTalkIcon,
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
import { resolveAppUrl } from '@/lib/utils';
import type { ArticleDetail } from '@shared/api.interface';

interface ShareMenuProps {
  article: ArticleDetail;
  trigger: React.ReactNode;
}

export default function ShareMenu({ article, trigger }: ShareMenuProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const shareUrl = article.slug
    ? resolveAppUrl(`/p/${article.slug}`)
    : resolveAppUrl(`/article/${article.id}`);

  const excerpt = article.excerpt ?? article.content.slice(0, 80);

  const payload: SharePayload = {
    title: article.title,
    url: shareUrl,
    summary: excerpt,
    authorName: article.authorName,
    coverUrl: article.coverUrl || null,
  };

  const handleCopyLink = async () => {
    const success = await copyTextToClipboard(shareUrl, '链接已复制');
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
    setDropdownOpen(false);
  };

  const handleCopyText = async () => {
    const shareText = formatShareText(payload);
    const success = await copyTextToClipboard(shareText, '分享文案已复制');
    if (success) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
    setDropdownOpen(false);
  };

  const handleWeChat = () => {
    setDropdownOpen(false);
    setDialogOpen(true);
  };

  const handleNativeShare = async () => {
    setDropdownOpen(false);
    await invokeNativeShare(payload);
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen} modal={false}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 bg-[#16181c] border border-[#2f3336] text-[#e7e9ea] rounded-xl p-1.5 shadow-xl"
        >
          {/* 微信扫码 */}
          <DropdownMenuItem
            onClick={handleWeChat}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-100"
          >
            <WeChatIcon className="w-4 h-4 text-[#07C160]" />
            <span>微信 (扫码分享)</span>
          </DropdownMenuItem>

          {/* QQ 好友 */}
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              openPlatformShare('qq', payload);
            }}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-100"
          >
            <QQIcon className="w-4 h-4 text-[#12B7F5]" />
            <span>QQ 好友</span>
          </DropdownMenuItem>

          {/* 新浪微博 */}
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              openPlatformShare('weibo', payload);
            }}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-100"
          >
            <WeiboIcon className="w-4 h-4 text-[#E6162D]" />
            <span>新浪微博</span>
          </DropdownMenuItem>

          {/* QQ 空间 */}
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              openPlatformShare('qzone', payload);
            }}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-100"
          >
            <QzoneIcon className="w-4 h-4 text-[#FFCE00]" />
            <span>QQ 空间</span>
          </DropdownMenuItem>

          {/* 钉钉 */}
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              openPlatformShare('dingtalk', payload);
            }}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-100"
          >
            <DingTalkIcon className="w-4 h-4 text-[#0089FF]" />
            <span>钉钉</span>
          </DropdownMenuItem>

          {/* X (Twitter) */}
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              openPlatformShare('twitter', payload);
            }}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-100"
          >
            <XIcon className="w-4 h-4 text-white" />
            <span>分享到 X</span>
          </DropdownMenuItem>

          {canNativeShare() && (
            <DropdownMenuItem
              onClick={handleNativeShare}
              className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-emerald-400"
            >
              <Smartphone className="w-4 h-4" />
              <span>系统原生分享</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="bg-[#2f3336] my-1" />

          {/* 复制链接 */}
          <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227]">
            {copiedLink ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Link2 className="w-4 h-4 text-[#1d9bf0]" />
            )}
            <span>复制链接</span>
          </DropdownMenuItem>

          {/* 复制分享文案 */}
          <DropdownMenuItem onClick={handleCopyText} className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227]">
            {copiedText ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-[#1d9bf0]" />
            )}
            <span>复制分享文案</span>
          </DropdownMenuItem>

          {/* 更多分享选项（弹窗） */}
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              setDialogOpen(true);
            }}
            className="cursor-pointer flex items-center gap-2 hover:bg-[#1f2227] text-gray-400 text-xs"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>更多分享方式...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 完整分享弹窗（包含微信高清二维码卡片） */}
      <ShareDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payload={payload}
      />
    </>
  );
}
