import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { FileText, Image as ImageIcon, Paperclip, MoreHorizontal, Pin, Sparkles } from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import ActionButtons from '@client/src/components/ActionButtons';
import RichTextContent from '@client/src/components/RichTextContent';
import AdminBadge from '@client/src/components/AdminBadge';
import ReportDialog from '@client/src/components/ReportDialog';
import { useAuth } from '@client/src/hooks/useAuth';
import { adminApi } from '@client/src/api';
import type { PostItem } from '@shared/api.interface';
import ShareDialog from '@/components/share/ShareDialog';

type PostCardAuthor = PostItem & { authorRole?: string };

dayjs.extend(relativeTime);

interface PostCardProps {
  post: PostItem;
}

const PostCard = ({ post }: PostCardProps) => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleCommentClick = () => {
    navigate(`/post/${post.id}#comments`);
  };

  const handlePostClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    navigate(`/post/${post.id}`);
  };

  const avatarInitial = post.authorName?.charAt(0)?.toUpperCase() ?? '?';

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
      await adminApi.postContentAction('post', post.id, post.isPinned ? 'unpin' : 'pin');
      toast.success(post.isPinned ? '已取消置顶' : '已置顶');
    } catch (err) {
      logger.error('置顶操作失败', err);
      toast.error('操作失败');
    }
  };

  const handleFeature = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await adminApi.postContentAction('post', post.id, post.isFeatured ? 'unfeature' : 'feature');
      toast.success(post.isFeatured ? '已取消加精' : '已加精');
    } catch (err) {
      logger.error('加精操作失败', err);
      toast.error('操作失败');
    }
  };

  return (
    <motion.article
      onClick={handlePostClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: 'easeOut', backgroundColor: { duration: 0.15 } }}
      whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
      whileTap={{ scale: 0.99 }}
      className="feed-post-card flex gap-3 px-4 py-3 border-b border-border cursor-pointer transition-colors duration-150"
      data-ai-section-type="card-list"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
         <Link
          to={`/user/${post.authorId}`}
          onClick={(e) => e.stopPropagation()}
          className="block w-12 h-12 rounded-full bg-secondary overflow-hidden hover:opacity-80 transition-opacity"
        >
          {post.authorAvatarUrl ? (
            <Image
              src={post.authorAvatarUrl}
              alt={post.authorName}
              className="w-full h-full object-cover img-fade-in"
              onLoad={(e) => {
                e.currentTarget.classList.add('loaded');
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-foreground">
              {avatarInitial}
            </div>
          )}
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Pinned/Featured badges */}
        {(post.isPinned || post.isFeatured) && (
          <div className="flex items-center gap-2 mb-2">
             {post.isPinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-black text-xs font-medium animate-pin-breathe">
                <Pin className="w-3 h-3" />置顶
              </span>
            )}
            {post.isFeatured && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                <Sparkles className="w-3 h-3" />精选
              </span>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-1 text-sm">
          <Link
            to={`/user/${post.authorId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-foreground truncate hover:underline"
          >
            {post.authorName}
          </Link>
          {post.authorRole === 'admin' && <AdminBadge size="sm" />}
          <span className="text-muted-foreground truncate">
            @{post.authorId.slice(0, 8)}
          </span>
          <span className="text-muted-foreground">·</span>
          <Link to={`/post/${post.id}`} onClick={(event) => event.stopPropagation()} className="text-muted-foreground flex-shrink-0 hover:underline" aria-label="查看动态详情">
            {dayjs(post.createdAt).fromNow()}
          </Link>
          <div className="ml-auto relative">
             <motion.button
              onClick={handleMenuToggle}
              aria-label="动态更多操作"
              aria-expanded={menuOpen}
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.2 }}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </motion.button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-10">
                {isAdmin && (
                  <>
                    <button
                      onClick={handlePin}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      {post.isPinned ? '取消置顶' : '置顶帖子'}
                    </button>
                    <button
                      onClick={handleFeature}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      {post.isFeatured ? '取消加精' : '加精帖子'}
                    </button>
                  </>
                )}
                {user && user.id !== post.authorId && (
                  <button
                    onClick={handleReportClick}
                    className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    举报内容
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Post body */}
        <div className="mt-1 text-base leading-relaxed text-foreground">
          <RichTextContent content={post.content} />
        </div>

        {/* Linked article card */}
        {post.article && (
          <Link
            to={`/article/${post.article.id}`}
            onClick={(event) => event.stopPropagation()}
            className="block mt-3 border border-border rounded-xl p-3 hover:bg-muted/60 transition-colors"
          >
            <h4 className="font-bold text-foreground truncate">
              {post.article.title}
            </h4>
            {post.article.excerpt && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {post.article.excerpt}
              </p>
            )}
            {(post.article.imageCount > 0 || post.article.attachmentCount > 0) && (
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {post.article.imageCount > 0 && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {post.article.imageCount}张图
                  </span>
                )}
                {post.article.attachmentCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" />
                    {post.article.attachmentCount}个附件
                  </span>
                )}
              </div>
            )}
          </Link>
        )}

        {/* Action buttons */}
        <ActionButtons
          contentType="post"
          contentId={post.id}
          commentCount={post.commentCount}
          likeCount={post.likeCount}
          repostCount={post.repostCount}
          isLiked={post.isLiked}
          isReposted={post.isReposted}
          onCommentClick={handleCommentClick}
          onShareClick={handleShare}
        />
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        contentType="post"
        contentId={post.id}
      />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={{
          title: post.article ? post.article.title : `${post.authorName} 的动态`,
          url: resolveAppUrl(post.article ? (post.article.slug ? `/p/${post.article.slug}` : `/article/${post.article.id}`) : `/post/${post.id}`),
          summary: post.article ? (post.article.excerpt || post.content) : post.content,
          authorName: post.authorName,
          coverUrl: post.article?.coverUrl || null,
        }}
      />
    </motion.article>
  );
};

export default PostCard;
