import { useState } from 'react';
import { Share2, Link2, Copy, Check, ArrowRight, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Image } from '@client/src/components/ui/image';

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

  const shareText = `我写了一篇关于${title.slice(0, 10)}的长文，含图表和资料，欢迎阅读：${shareUrl}`;
  const cardImage = coverUrl || firstImageUrl;

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('链接已复制，可粘贴到 X、微博等平台');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('复制链接失败', err);
      toast.error('复制失败');
    }
  };

  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedText(true);
      toast.success('分享文案已复制');
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      logger.error('复制分享文案失败', err);
      toast.error('复制失败');
    }
  };

  return (
    <div className="border border-blue-500/30 bg-blue-500/5 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Share2 className="w-4 h-4 text-blue-500" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-100">文章已发布</p>
          <p className="text-xs text-gray-500">复制链接分享到 X / 微博，点击即可阅读全文</p>
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
              复制分享文案
            </>
          )}
        </button>
        <div className="flex gap-2">
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
    </div>
  );
}
