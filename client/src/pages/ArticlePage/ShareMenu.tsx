import { useState } from 'react';
import { Link2, Copy, Twitter, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { ArticleDetail } from '@shared/api.interface';

interface ShareMenuProps {
  article: ArticleDetail;
  trigger: React.ReactNode;
}

export default function ShareMenu({ article, trigger }: ShareMenuProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [open, setOpen] = useState(false);

  const shareUrl = article.slug
    ? resolveAppUrl(`/p/${article.slug}`)
    : resolveAppUrl(`/article/${article.id}`);

  const excerpt = article.excerpt ?? article.content.slice(0, 50);
  const shareText = `我读了《${article.title}》，${excerpt.slice(0, 50)}，完整内容：${shareUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      toast.success('链接已复制');
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch((err) => {
      logger.error('复制链接失败', err);
      toast.error('复制失败，请手动复制');
    });
    setOpen(false);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(shareText).then(() => {
      setCopiedText(true);
      toast.success('分享文案已复制');
      setTimeout(() => setCopiedText(false), 2000);
    }).catch((err) => {
      logger.error('复制分享文案失败', err);
      toast.error('复制失败，请手动复制');
    });
    setOpen(false);
  };

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-[#16181c] border border-[#2f3336] text-[#e7e9ea] rounded-xl p-1"
      >
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          {copiedLink ? (
            <Check className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <Link2 className="w-4 h-4 mr-2 text-[#1d9bf0]" />
          )}
          复制链接
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareTwitter} className="cursor-pointer">
          <Twitter className="w-4 h-4 mr-2 text-[#1d9bf0]" />
          分享到 X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyText} className="cursor-pointer">
          {copiedText ? (
            <Check className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 mr-2 text-[#1d9bf0]" />
          )}
          复制分享文案
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
