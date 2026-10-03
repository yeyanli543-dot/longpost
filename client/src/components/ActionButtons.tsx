import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  Repeat2,
  Heart,
  Bookmark,
  Share2,
  Quote,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import {
  toggleLike,
  toggleRepost,
  toggleBookmark,
} from '@client/src/api/interactions';
import type { CommentContentType } from '@shared/api.interface';

interface ActionButtonsProps {
  contentType: CommentContentType;
  contentId: string;
  commentCount: number;
  likeCount: number;
  repostCount: number;
  isLiked?: boolean;
  isReposted?: boolean;
  bookmarkCount?: number;
  isBookmarked?: boolean;
  showBookmark?: boolean;
  commentInputId?: string;
  onCommentClick: () => void;
  onShareClick: () => void;
}

function formatCount(count: number): string {
  if (count >= 10000) {
    return (count / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return String(count);
}

const QUOTE_MAX_LENGTH = 280;

const ActionButtons = ({
  contentType,
  contentId,
  commentCount,
  likeCount,
  repostCount,
  isLiked = false,
  isReposted = false,
  bookmarkCount = 0,
  isBookmarked = false,
  showBookmark = false,
  commentInputId,
  onCommentClick,
  onShareClick,
}: ActionButtonsProps) => {
  const { user } = useAuth();

  const [localLikeCount, setLocalLikeCount] = useState(likeCount);
  const [localIsLiked, setLocalIsLiked] = useState(isLiked);
  const [likeLoading, setLikeLoading] = useState(false);

  const [localRepostCount, setLocalRepostCount] = useState(repostCount);
  const [localIsReposted, setLocalIsReposted] = useState(isReposted);
  const [repostLoading, setRepostLoading] = useState(false);

  const [localBookmarkCount, setLocalBookmarkCount] = useState(bookmarkCount);
  const [localIsBookmarked, setLocalIsBookmarked] = useState(isBookmarked);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  const [likeBump, setLikeBump] = useState(0);
  const [repostBump, setRepostBump] = useState(0);
  const [bookmarkBump, setBookmarkBump] = useState(0);

  // Repost dialog state
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [quoteContent, setQuoteContent] = useState('');
  const [quoteMode, setQuoteMode] = useState(false);

  const requireLogin = useCallback((): boolean => {
    if (!user) {
      toast.info('请先登录后再操作');
      return true;
    }
    return false;
  }, [user]);

  const handleLike = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (requireLogin() || likeLoading) return;

      const prevLiked = localIsLiked;
      const prevCount = localLikeCount;

      // Optimistic update
      setLocalIsLiked(!prevLiked);
      setLocalLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
      setLikeLoading(true);
      if (!prevLiked) setLikeBump((k) => k + 1);

      try {
        const result = await toggleLike({ contentType, contentId });
        setLocalIsLiked(result.liked);
        setLocalLikeCount(result.likeCount);
      } catch (err) {
        logger.error('点赞失败', err);
        // Rollback
        setLocalIsLiked(prevLiked);
        setLocalLikeCount(prevCount);
        toast.error('操作失败，请稍后重试');
      } finally {
        setLikeLoading(false);
      }
    },
    [
      requireLogin,
      likeLoading,
      localIsLiked,
      localLikeCount,
      contentType,
      contentId,
    ],
  );

  const openRepostDialog = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (requireLogin() || repostLoading) return;

      // If already reposted, toggle off directly
      if (localIsReposted) {
        void handleDirectRepost();
        return;
      }

      setQuoteContent('');
      setQuoteMode(false);
      setRepostDialogOpen(true);
    },
    [requireLogin, repostLoading, localIsReposted],
  );

  const handleDirectRepost = useCallback(async () => {
    if (localIsReposted) {
      // Cancel repost
      const prevReposted = localIsReposted;
      const prevCount = localRepostCount;

      setLocalIsReposted(false);
      setLocalRepostCount(prevCount - 1);
      setRepostLoading(true);

      try {
        const result = await toggleRepost({ contentType, contentId });
        setLocalIsReposted(result.reposted);
        setLocalRepostCount(result.repostCount);
        toast.success(result.reposted ? '转发成功' : '已取消转发');
      } catch (err) {
        logger.error('转发失败', err);
        setLocalIsReposted(prevReposted);
        setLocalRepostCount(prevCount);
        toast.error('操作失败，请稍后重试');
      } finally {
        setRepostLoading(false);
      }
      return;
    }

    const prevReposted = localIsReposted;
    const prevCount = localRepostCount;

    setLocalIsReposted(true);
    setLocalRepostCount(prevCount + 1);
    setRepostLoading(true);
      setRepostBump((k) => k + 1);

    try {
      const result = await toggleRepost({ contentType, contentId });
      setLocalIsReposted(result.reposted);
      setLocalRepostCount(result.repostCount);
      toast.success(result.reposted ? '转发成功' : '已取消转发');
      setRepostDialogOpen(false);
    } catch (err) {
      logger.error('转发失败', err);
      setLocalIsReposted(prevReposted);
      setLocalRepostCount(prevCount);
      toast.error('操作失败，请稍后重试');
    } finally {
      setRepostLoading(false);
    }
  }, [localIsReposted, localRepostCount, contentType, contentId]);

  const handleQuoteRepost = useCallback(async () => {
    if (!quoteContent.trim()) {
      toast.error('请输入转发内容');
      return;
    }

    const prevReposted = localIsReposted;
    const prevCount = localRepostCount;

    setLocalIsReposted(true);
    setLocalRepostCount(prevCount + 1);
    setRepostLoading(true);
      setRepostBump((k) => k + 1);

    try {
      const result = await toggleRepost({
        contentType,
        contentId,
        quoteContent: quoteContent.trim(),
      });
      setLocalIsReposted(result.reposted);
      setLocalRepostCount(result.repostCount);
      toast.success('引用转发成功');
      setRepostDialogOpen(false);
      setQuoteContent('');
    } catch (err) {
      logger.error('引用转发失败', err);
      setLocalIsReposted(prevReposted);
      setLocalRepostCount(prevCount);
      toast.error('操作失败，请稍后重试');
    } finally {
      setRepostLoading(false);
    }
  }, [quoteContent, localIsReposted, localRepostCount, contentType, contentId]);

  const handleBookmark = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (requireLogin() || bookmarkLoading) return;

      const prevBookmarked = localIsBookmarked;
      const prevCount = localBookmarkCount;

      // Optimistic update
      setLocalIsBookmarked(!prevBookmarked);
      setLocalBookmarkCount(prevBookmarked ? prevCount - 1 : prevCount + 1);
      setBookmarkLoading(true);
      if (!prevBookmarked) setBookmarkBump((k) => k + 1);

      try {
        const result = await toggleBookmark({ articleId: contentId });
        setLocalIsBookmarked(result.bookmarked);
        setLocalBookmarkCount(result.bookmarkCount);
        toast.success(result.bookmarked ? '已收藏' : '已取消收藏');
      } catch (err) {
        logger.error('收藏失败', err);
        // Rollback
        setLocalIsBookmarked(prevBookmarked);
        setLocalBookmarkCount(prevCount);
        toast.error('操作失败，请稍后重试');
      } finally {
        setBookmarkLoading(false);
      }
    },
    [
      requireLogin,
      bookmarkLoading,
      localIsBookmarked,
      localBookmarkCount,
      contentId,
    ],
  );

  const handleComment = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCommentClick();
      if (commentInputId) {
        const el = document.getElementById(commentInputId);
        if (el && 'focus' in el) {
          (el as HTMLElement).focus();
        }
      }
    },
    [onCommentClick, commentInputId],
  );

  const handleShare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onShareClick();
    },
    [onShareClick],
  );

  return (
    <>
      <div className="mt-3 flex items-center justify-between text-gray-500 max-w-md">
        {/* Comment */}
        <motion.button
          onClick={handleComment}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
          className="flex items-center gap-1 group"
          title="评论"
          data-ai-section-type="button"
        >
          <span className="p-3.5 md:p-1.5 rounded-full group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors duration-200">
            <motion.span
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.2 }}
              className="block"
            >
              <MessageCircle className="w-4 h-4" />
            </motion.span>
          </span>
          <span className="text-xs group-hover:text-blue-500 transition-colors duration-200">
            {formatCount(commentCount)}
          </span>
        </motion.button>

        {/* Repost */}
        <motion.button
          onClick={openRepostDialog}
          disabled={repostLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
          className={`flex items-center gap-1 group ${
            localIsReposted ? 'text-green-500' : ''
          }`}
          title="转发"
          data-ai-section-type="button"
        >
          <span
           className={`p-3.5 md:p-1.5 rounded-full transition-colors duration-200 ${
             localIsReposted
               ? 'bg-green-500/10 text-green-500'
               : 'group-hover:bg-green-500/10 group-hover:text-green-500'
           }`}
         >
           <motion.div
             key={repostBump}
             initial={{ rotate: 0 }}
             animate={localIsReposted && repostBump > 0 ? { rotate: 360, scale: [1, 1.2, 1] } : {}}
             transition={{ duration: 0.4, ease: 'easeOut' }}
           >
             <Repeat2 className="w-4 h-4" />
            </motion.div>
          </span>
          <span
            className={`text-xs transition-colors duration-200 ${
              localIsReposted
                ? 'text-green-500'
                : 'group-hover:text-green-500'
            }`}
          >
            {formatCount(localRepostCount)}
          </span>
        </motion.button>

        {/* Like */}
        <motion.button
          onClick={handleLike}
          disabled={likeLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
          className={`flex items-center gap-1 group ${
            localIsLiked ? 'text-pink-500' : ''
          }`}
          title="点赞"
          data-ai-section-type="button"
        >
          <span
             className={`p-3.5 md:p-1.5 rounded-full transition-colors duration-200 ${
               localIsLiked
                 ? 'bg-pink-500/10 text-pink-500'
                 : 'group-hover:bg-pink-500/10 group-hover:text-pink-500'
             }`}
           >
             <motion.div
               key={likeBump}
               initial={{ scale: 1 }}
               animate={
                 localIsLiked && likeBump > 0
                   ? { scale: [1, 1.3, 0.9, 1.15, 1] }
                   : { scale: 1 }
               }
               transition={{ duration: 0.45, ease: 'easeOut', times: [0, 0.3, 0.55, 0.75, 1] }}
             >
               <Heart
                 className={`w-4 h-4  transition-all duration-300 ${
                   localIsLiked ? 'fill-current' : ''
                 }`}
               />
             </motion.div>
           </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={`${localIsLiked}-${localLikeCount}`}
              initial={{ opacity: 0, y: localIsLiked ? -6 : 6, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: localIsLiked ? 6 : -6, scale: 0.8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`text-xs ${
                localIsLiked
                  ? 'text-pink-500'
                  : 'group-hover:text-pink-500 transition-colors duration-200'
              }`}
            >
              {formatCount(localLikeCount)}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        {/* Bookmark (article only) */}
        {showBookmark && (
          <motion.button
            onClick={handleBookmark}
            disabled={bookmarkLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className={`flex items-center gap-1 group ${
              localIsBookmarked ? 'text-yellow-500' : ''
            }`}
            title="收藏"
            data-ai-section-type="button"
          >
             <span
               className={`p-3.5 md:p-1.5 rounded-full transition-colors duration-200 ${
                 localIsBookmarked
                   ? 'bg-yellow-500/10 text-yellow-500'
                   : 'group-hover:bg-yellow-500/10 group-hover:text-yellow-500'
               }`}
             >
               <motion.div
                 key={bookmarkBump}
                 initial={{ scale: 1 }}
                 animate={
                   localIsBookmarked && bookmarkBump > 0
                     ? { scale: [1, 1.3, 0.95, 1.1, 1] }
                     : { scale: 1 }
                 }
                 transition={{ duration: 0.35, ease: 'easeOut', times: [0, 0.35, 0.6, 0.8, 1] }}
               >
                 <Bookmark
                   className={`w-4 h-4  transition-all duration-200 ${
                     localIsBookmarked ? 'fill-current' : ''
                   }`}
                 />
               </motion.div>
             </span>
            <span
              className={`text-xs transition-colors duration-200 ${
                localIsBookmarked
                  ? 'text-yellow-500'
                  : 'group-hover:text-yellow-500'
              }`}
            >
              {formatCount(localBookmarkCount)}
            </span>
          </motion.button>
        )}

        {/* Share */}
        <motion.button
          onClick={handleShare}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
          className="flex items-center gap-1 group"
          title="分享"
          data-ai-section-type="button"
        >
           <span className="p-3.5 md:p-1.5 rounded-full group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors duration-200">
             <motion.span
               whileHover={{ scale: 1.1 }}
               transition={{ duration: 0.2 }}
               className="block"
             >
               <Share2 className="w-4 h-4" />
            </motion.span>
          </span>
        </motion.button>
      </div>

      {/* Repost Dialog */}
      <AnimatePresence>
        {repostDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setRepostDialogOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-bold text-gray-100">转发</h3>
              <button
                onClick={() => setRepostDialogOpen(false)}
                className="text-gray-500 hover:text-gray-300 p-1"
                data-ai-section-type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!quoteMode ? (
              /* Options: Repost / Quote Repost */
              <div className="py-2">
                <button
                  onClick={handleDirectRepost}
                  disabled={repostLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
                  data-ai-section-type="button"
                >
                  <span className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Repeat2 className="w-5 h-5 text-green-500" />
                  </span>
                  <div>
                    <div className="font-medium text-gray-100">转发</div>
                    <div className="text-sm text-gray-500">直接转发到你的时间线</div>
                  </div>
                </button>
                <button
                  onClick={() => setQuoteMode(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
                  data-ai-section-type="button"
                >
                  <span className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Quote className="w-5 h-5 text-blue-500" />
                  </span>
                  <div>
                    <div className="font-medium text-gray-100">引用转发</div>
                    <div className="text-sm text-gray-500">添加评论后转发</div>
                  </div>
                </button>
              </div>
            ) : (
              /* Quote mode */
              <div className="p-4">
                <textarea
                  value={quoteContent}
                  onChange={(e) => {
                    if (e.target.value.length <= QUOTE_MAX_LENGTH) {
                      setQuoteContent(e.target.value);
                    }
                  }}
                  placeholder="说点什么..."
                  className="w-full bg-transparent border border-gray-700 rounded-lg p-3 text-gray-100 resize-none focus:outline-none focus:border-blue-500 placeholder:text-gray-500 min-h-[100px]"
                  maxLength={QUOTE_MAX_LENGTH}
                  autoFocus
                />
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => setQuoteMode(false)}
                    className="text-sm text-gray-500 hover:text-gray-300"
                    data-ai-section-type="button"
                  >
                    ← 返回
                  </button>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm ${
                        quoteContent.length >= QUOTE_MAX_LENGTH
                          ? 'text-red-500'
                          : 'text-gray-500'
                      }`}
                    >
                      {quoteContent.length}/{QUOTE_MAX_LENGTH}
                    </span>
                    <button
                      onClick={handleQuoteRepost}
                      disabled={!quoteContent.trim() || repostLoading}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-full text-sm font-bold transition-colors"
                      data-ai-section-type="button"
                    >
                      {repostLoading ? '发布中...' : '转发'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ActionButtons;
