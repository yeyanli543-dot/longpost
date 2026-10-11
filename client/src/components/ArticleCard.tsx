import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Image as ImageIcon, Paperclip, MoreHorizontal, Pin, Sparkles } from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import ActionButtons from '@client/src/components/ActionButtons';
import ReportDialog from '@client/src/components/ReportDialog';
import AdminBadge from '@client/src/components/AdminBadge';
import { useAuth } from '@client/src/hooks/useAuth';
import { adminApi } from '@client/src/api';
import type { ArticleSummary } from '@shared/api.interface';

dayjs.extend(relativeTime);

interface ArticleCardProps {
  article: ArticleSummary;
}

const ArticleCard = ({ article }: ArticleCardProps) => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const handleClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleShare = async () => {
    try {
      const shareUrl = resolveAppUrl(`/article/${article.id}`);
      await navigator.clipboard.writeText(shareUrl);
      toast.success('文章链接已复制');
    } catch (err) {
      logger.error('复制链接失败', err);
      toast.error('复制失败');
    }
  };

  const handleCommentClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleReportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setReportOpen(true);
  };

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await adminApi.postContentAction('article', article.id, article.isPinned ? 'unpin' : 'pin');
      toast.success(article.isPinned ? '已取消置顶' : '已置顶');
    } catch (err) {
      logger.error('置顶操作失败', err);
      toast.error('操作失败');
    }
  };

  const handleFeature = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await adminApi.postContentAction('article', article.id, article.isFeatured ? 'unfeature' : 'feature');
      toast.success(article.isFeatured ? '已取消加精' : '已加精');
    } catch (err) {
      logger.error('加精操作失败', err);
      toast.error('操作失败');
    }
  };

  const avatarInitial = article.authorName?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <motion.article
      onClick={handleClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: 'easeOut', backgroundColor: { duration: 0.15 } }}
      whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
      whileTap={{ scale: 0.99 }}
      className="flex gap-3 px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors duration-150"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
         <Link
          to={`/user/${article.authorId}`}
          onClick={(e) => e.stopPropagation()}
          className="block w-12 h-12 rounded-full bg-gray-700 overflow-hidden hover:opacity-80 transition-opacity"
        >
          {article.authorAvatarUrl ? (
            <Image
              src={article.authorAvatarUrl}
              alt={article.authorName}
              className="w-full h-full object-cover img-fade-in"
              onLoad={(e) => {
                e.currentTarget.classList.add('loaded');
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-300">
              {avatarInitial}
            </div>
          )}
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Pinned/Featured badges */}
        {(article.isPinned || article.isFeatured) && (
          <div className="flex items-center gap-2 mb-2">
             {article.isPinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-medium animate-pin-breathe">
                <Pin className="w-3 h-3" />置顶
              </span>
            )}
            {article.isFeatured && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                <Sparkles className="w-3 h-3" />精选
              </span>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-1 text-sm">
          <Link
            to={`/user/${article.authorId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-gray-100 truncate hover:underline"
          >
            {article.authorName}
          </Link>
          {/* authorRole 字段暂不显示管理员徽章，预留 */}
          {article.authorRole === 'admin' && <AdminBadge size="sm" />}
          <span className="text-gray-500">发布了文章</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-500 flex-shrink-0">
            {dayjs(article.createdAt).fromNow()}
          </span>
          <div className="ml-auto relative">
             <motion.button
              onClick={handleMenuToggle}
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.2 }}
              className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-full transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </motion.button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#16181c] border border-[#2f3336] rounded-lg shadow-lg overflow-hidden z-10">
                {isAdmin && (
                  <>
                    <button
                      onClick={handlePin}
                      className="w-full px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800 transition-colors"
                    >
                      {article.isPinned ? '取消置顶' : '置顶文章'}
                    </button>
                    <button
                      onClick={handleFeature}
                      className="w-full px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800 transition-colors"
                    >
                      {article.isFeatured ? '取消加精' : '加精文章'}
                    </button>
                  </>
                )}
                {user && user.id !== article.authorId && (
                  <button
                    onClick={handleReportClick}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-800 transition-colors"
                  >
                    举报内容
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="mt-2 text-xl font-bold text-gray-100 leading-snug">
          {article.title}
        </h3>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="mt-2 text-base text-gray-400 leading-relaxed line-clamp-3">
            {article.excerpt}
          </p>
        )}

        {/* Media indicators */}
        {(article.imageCount > 0 || article.attachmentCount > 0) && (
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
            {article.imageCount > 0 && (
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" />
                {article.imageCount}张配图
              </span>
            )}
            {article.attachmentCount > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" />
                {article.attachmentCount}个附件
              </span>
            )}
          </div>
        )}

        {/* Read count */}
        <div className="mt-3 text-xs text-gray-500">
          阅读 · {article.readCount} 次
        </div>

        {/* Action buttons */}
        <ActionButtons
          contentType="article"
          contentId={article.id}
          commentCount={article.commentCount}
          likeCount={article.likeCount}
          repostCount={article.repostCount}
          isLiked={article.isLiked}
          isReposted={article.isReposted}
          bookmarkCount={article.bookmarkCount}
          isBookmarked={article.isBookmarked}
          showBookmark
          onCommentClick={handleCommentClick}
          onShareClick={handleShare}
        />
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        contentType="article"
        contentId={article.id}
      />
    </motion.article>
  );
};

export default ArticleCard;
