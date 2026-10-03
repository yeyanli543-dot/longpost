import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  User,
  Trash2,
  Send,
  Loader2,
  Heart,
  MessageSquare,
  ChevronDown,
  MoreHorizontal,
  Flag,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { commentsApi } from '@client/src/api';
import { useAuth } from '@client/src/hooks/useAuth';
import type {
  CommentItem,
  CommentContentType,
  CommentSortMode,
} from '@shared/api.interface';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { Image } from '@client/src/components/ui/image';
import RichTextContent from '@client/src/components/RichTextContent';
import ReportDialog from '@client/src/components/ReportDialog';

dayjs.extend(relativeTime);

interface CommentsSectionProps {
  contentType: CommentContentType;
  contentId: string;
}

const MAX_BODY_LENGTH = 500;

export default function CommentsSection({
  contentType,
  contentId,
}: CommentsSectionProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sort, setSort] = useState<CommentSortMode>('time');

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await commentsApi.getComments(
        contentType,
        contentId,
        { sort },
      );
      setComments(response.items);
    } catch (err) {
      logger.error('加载评论失败', err);
      setError('加载评论失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [contentType, contentId, sort]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !body.trim() || submitting) return;

    const trimmedBody = body.trim();
    if (trimmedBody.length > MAX_BODY_LENGTH) return;

    try {
      setSubmitting(true);
      const newComment = await commentsApi.createComment({
        contentType,
        contentId,
        body: trimmedBody,
      });
      setBody('');
      // Optimistic: add to top
      setComments((prev: CommentItem[]) => [newComment, ...prev]);
      toast.success('评论发布成功');
    } catch (err) {
      logger.error('发布评论失败', err);
      toast.error('发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!await showConfirm('确定要删除这条评论吗？')) return;

    try {
      setDeletingId(commentId);
      await commentsApi.deleteComment(commentId);
      setComments((prev: CommentItem[]) =>
        prev.map((c: CommentItem) =>
          c.id === commentId ? { ...c, isDeleted: true } : c,
        ),
      );
      toast.success('评论已删除');
    } catch (err: unknown) {
      logger.error('删除评论失败', err);
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403) {
        toast.error('无权删除此评论');
      } else {
        toast.error('删除失败，请稍后重试');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_BODY_LENGTH) {
      setBody(value);
    }
  };

  const handleSortChange = (newSort: CommentSortMode) => {
    setSort(newSort);
  };

  const handleReplyAdded = useCallback((parentId: string, reply: CommentItem) => {
    setComments((prev: CommentItem[]) =>
      prev.map((c: CommentItem) =>
        c.id === parentId
          ? {
              ...c,
              replyCount: (c.replyCount || 0) + 1,
            }
          : c,
      ),
    );
  }, []);

  const handleLikeChange = useCallback(
    (commentId: string, liked: boolean, likeCount: number, isReply: boolean, parentId?: string) => {
      if (isReply && parentId) {
        // For replies, let the ReplyThread handle it via its own state
        return;
      }
      setComments((prev: CommentItem[]) =>
        prev.map((c: CommentItem) =>
          c.id === commentId ? { ...c, isLiked: liked, likeCount } : c,
        ),
      );
    },
    [],
  );

  return (
    <div className="w-full">
      {/* Comment Input */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.nickname}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <textarea
                value={body}
                onChange={handleTextareaChange}
                placeholder="说点什么吧..."
                className="w-full border border-gray-700 rounded-lg bg-transparent text-gray-100 p-3 resize-none focus:outline-none focus:border-blue-500 placeholder:text-gray-500 min-h-[80px]"
                maxLength={MAX_BODY_LENGTH}
              />
              <div className="flex items-center justify-between mt-2">
                <span
                  className={`text-sm ${
                    body.length >= MAX_BODY_LENGTH
                      ? 'text-red-500'
                      : 'text-gray-500'
                  }`}
                >
                  {body.length}/{MAX_BODY_LENGTH}
                </span>
                <button
                  type="submit"
                  disabled={!body.trim() || submitting}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors"
                  data-ai-section-type="button"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  发布
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-4 py-4 text-center border border-gray-700 rounded-lg">
          <p className="text-gray-400 text-sm">
            <Link to="/login" className="text-blue-500 hover:underline">
              登录
            </Link>
            后发表评论
          </p>
        </div>
      )}

      {/* Sort & Header */}
      {!loading && !error && comments.length > 0 && (
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-800">
          <span className="text-sm text-gray-500">
            共 {comments.length} 条评论
          </span>
          <div className="flex items-center gap-1">
            <SortDropdown sort={sort} onChange={handleSortChange} />
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
          <p className="text-gray-500 text-sm mt-2">加载中...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="py-8 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={loadComments}
            className="text-blue-500 text-sm mt-2 hover:underline"
          >
            重新加载
          </button>
        </div>
      )}

      {/* Comments List */}
      {!loading && !error && (
        <div data-ai-section-type="card-list">
          {comments.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500">暂无评论，来说点什么吧</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {comments.map((comment: CommentItem) => (
                <CommentItemComponent
                  key={comment.id}
                  comment={comment}
                  contentType={contentType}
                  contentId={contentId}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  currentUserId={user?.id || null}
                  onReplyAdded={handleReplyAdded}
                  onLikeChange={handleLikeChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Sort Dropdown ----------

interface SortDropdownProps {
  sort: CommentSortMode;
  onChange: (sort: CommentSortMode) => void;
}

function SortDropdown({ sort, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);

  const options: { value: CommentSortMode; label: string }[] = [
    { value: 'time', label: '最新' },
    { value: 'hot', label: '最热' },
  ];

  const currentLabel = options.find((o) => o.value === sort)?.label || '最新';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded"
        data-ai-section-type="button"
      >
        {currentLabel}
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg py-1 min-w-[80px] z-20 shadow-lg">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  sort === opt.value
                    ? 'text-blue-500 bg-blue-500/10'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
                data-ai-section-type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Comment Item ----------

interface CommentItemComponentProps {
  comment: CommentItem;
  contentType: CommentContentType;
  contentId: string;
  onDelete: (id: string) => void;
  deletingId: string | null;
  currentUserId: string | null;
  onReplyAdded: (parentId: string, reply: CommentItem) => void;
  onLikeChange: (
    commentId: string,
    liked: boolean,
    likeCount: number,
    isReply: boolean,
    parentId?: string,
  ) => void;
}

function CommentItemComponent({
  comment,
  contentType,
  contentId,
  onDelete,
  deletingId,
  currentUserId,
  onReplyAdded,
  onLikeChange,
}: CommentItemComponentProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(comment.likeCount);
  const [localIsLiked, setLocalIsLiked] = useState(comment.isLiked || false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const isOwn = currentUserId === comment.userId;

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleReportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setReportOpen(true);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId || likeLoading) return;

    const prevLiked = localIsLiked;
    const prevCount = localLikeCount;

    setLocalIsLiked(!prevLiked);
    setLocalLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
    setLikeLoading(true);

    try {
      const result = await commentsApi.toggleCommentLike(comment.id);
      setLocalIsLiked(result.liked);
      setLocalLikeCount(result.likeCount);
      onLikeChange(comment.id, result.liked, result.likeCount, false);
    } catch (err) {
      logger.error('评论点赞失败', err);
      setLocalIsLiked(prevLiked);
      setLocalLikeCount(prevCount);
      toast.error('操作失败，请稍后重试');
    } finally {
      setLikeLoading(false);
    }
  };

  const handleReply = () => {
    if (!currentUserId) {
      toast.info('请先登录后再回复');
      return;
    }
    setShowReplyInput((prev) => !prev);
  };

  const handleViewReplies = () => {
    setShowReplies(true);
  };

  return (
    <div className="py-3">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {!comment.isDeleted && comment.userAvatarUrl ? (
            <Image
              src={comment.userAvatarUrl}
              alt={comment.userName}
              className="w-10 h-10 object-cover"
            />
          ) : (
            <User className="w-5 h-5 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {comment.isDeleted ? (
            <p className="text-gray-500 italic">[已删除]</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to={`/user/${comment.userId}`}
                  className="font-bold text-gray-100 truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {comment.userName}
                </Link>
                <span className="text-gray-500 text-sm">
                  {dayjs(comment.createdAt).fromNow()}
                </span>
                {isOwn ? (
                  <button
                    onClick={() => onDelete(comment.id)}
                    disabled={deletingId === comment.id}
                    className="ml-auto text-gray-500 hover:text-red-500 transition-colors p-1"
                    title="删除"
                    aria-label="删除评论"
                  >
                    {deletingId === comment.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                ) : (
                  currentUserId && (
                    <div className="ml-auto relative">
                      <button
                        onClick={handleMenuToggle}
                        className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-full transition-colors"
                        aria-label="更多操作"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpen(false)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-36 bg-[#16181c] border border-[#2f3336] rounded-lg shadow-lg overflow-hidden z-20">
                            <button
                              onClick={handleReportClick}
                              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-800 transition-colors flex items-center gap-2"
                            >
                              <Flag className="w-4 h-4" />举报评论
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                )}
              </div>
              <div className="text-gray-200 mt-1">
                <RichTextContent content={comment.body} />
              </div>

              {/* Action bar: reply + like */}
              <div className="flex items-center gap-4 mt-2 text-gray-500">
                <button
                  onClick={handleReply}
                  className="flex items-center gap-1 text-xs hover:text-blue-500 transition-colors group"
                  data-ai-section-type="button"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>回复</span>
                </button>
                <button
                  onClick={handleLike}
                  disabled={likeLoading}
                  className={`flex items-center gap-1 text-xs transition-colors group ${
                    localIsLiked ? 'text-pink-500' : 'hover:text-pink-500'
                  }`}
                  data-ai-section-type="button"
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${
                      localIsLiked ? 'fill-current' : ''
                    }`}
                  />
                  <span>{localLikeCount || ''}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        contentType="comment"
        contentId={comment.id}
      />

      {/* Reply Input */}
      <AnimatePresence initial={false}>
        {showReplyInput && !comment.isDeleted && (
          <motion.div
            key="reply-input"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <ReplyInput
              contentType={contentType}
              contentId={contentId}
              parentId={comment.id}
              onCancel={() => setShowReplyInput(false)}
              onSubmitted={(reply) => {
                onReplyAdded(comment.id, reply);
                setShowReplyInput(false);
                setShowReplies(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* View more replies */}
      {!showReplies && (comment.replyCount || 0) > 0 && (
        <motion.button
          onClick={handleViewReplies}
          whileTap={{ scale: 0.95 }}
          className="ml-12 mt-2 text-blue-500 text-sm hover:underline flex items-center gap-1"
          data-ai-section-type="button"
        >
          查看 {comment.replyCount} 条回复
          <ChevronDown className="w-4 h-4" />
        </motion.button>
      )}

      {/* Replies Thread */}
      <AnimatePresence initial={false}>
        {showReplies && (comment.replyCount || 0) > 0 && (
          <motion.div
            key="reply-thread"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <ReplyThread
              commentId={comment.id}
              contentType={contentType}
              contentId={contentId}
              currentUserId={currentUserId}
              onLikeChange={(rid, liked, count) =>
                onLikeChange(rid, liked, count, true, comment.id)
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Reply Input ----------

interface ReplyInputProps {
  contentType: CommentContentType;
  contentId: string;
  parentId: string;
  onCancel: () => void;
  onSubmitted: (reply: CommentItem) => void;
}

function ReplyInput({
  contentType,
  contentId,
  parentId,
  onCancel,
  onSubmitted,
}: ReplyInputProps) {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const REPLY_MAX = 500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !body.trim() || submitting) return;

    const trimmed = body.trim();
    try {
      setSubmitting(true);
      const reply = await commentsApi.createComment({
        contentType,
        contentId,
        body: trimmed,
        parentId,
      });
      setBody('');
      onSubmitted(reply);
      toast.success('回复成功');
    } catch (err) {
      logger.error('发布回复失败', err);
      toast.error('发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ml-12 mt-3 flex gap-2">
      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
        {user?.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.nickname}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <User className="w-4 h-4 text-gray-400" />
        )}
      </div>
      <div className="flex-1">
        <textarea
          value={body}
          onChange={(e) => {
            if (e.target.value.length <= REPLY_MAX) setBody(e.target.value);
          }}
          placeholder="回复评论..."
          className="w-full border border-gray-700 rounded-lg bg-transparent text-gray-100 p-2 resize-none focus:outline-none focus:border-blue-500 placeholder:text-gray-500 text-sm min-h-[60px]"
          maxLength={REPLY_MAX}
          autoFocus
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500">
            {body.length}/{REPLY_MAX}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-300 px-3 py-1"
              data-ai-section-type="button"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!body.trim() || submitting}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-colors"
              data-ai-section-type="button"
            >
              {submitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              回复
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ---------- Reply Thread ----------

interface ReplyThreadProps {
  commentId: string;
  contentType: CommentContentType;
  contentId: string;
  currentUserId: string | null;
  onLikeChange: (
    replyId: string,
    liked: boolean,
    likeCount: number,
  ) => void;
}

function ReplyThread({
  commentId,
  currentUserId,
  onLikeChange,
}: ReplyThreadProps) {
  const [replies, setReplies] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const response = await commentsApi.getReplies(commentId);
        if (!cancelled) {
          setReplies(response.items);
          setHasMore(response.hasMore);
          setNextCursor(response.nextCursor);
        }
      } catch (err) {
        logger.error('加载回复失败', err);
        toast.error('加载回复失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [commentId]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const response = await commentsApi.getReplies(
        commentId,
        nextCursor || undefined,
      );
      setReplies((prev) => [...prev, ...response.items]);
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
    } catch (err) {
      logger.error('加载更多回复失败', err);
      toast.error('加载失败');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="ml-12 py-3 text-center">
        <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
      </div>
    );
  }

  if (replies.length === 0) {
    return null;
  }

  return (
    <div className="ml-12 mt-2 border-l-2 border-gray-800 pl-3">
      {replies.map((reply: CommentItem) => (
        <ReplyItem
          key={reply.id}
          reply={reply}
          currentUserId={currentUserId}
          onLikeChange={onLikeChange}
        />
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="text-blue-500 text-sm hover:underline py-2 flex items-center gap-1"
          data-ai-section-type="button"
        >
          {loadingMore ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          加载更多回复
        </button>
      )}
    </div>
  );
}

// ---------- Reply Item ----------

interface ReplyItemProps {
  reply: CommentItem;
  currentUserId: string | null;
  onLikeChange: (
    replyId: string,
    liked: boolean,
    likeCount: number,
  ) => void;
}

function ReplyItem({ reply, currentUserId, onLikeChange }: ReplyItemProps) {
  const [localLikeCount, setLocalLikeCount] = useState(reply.likeCount);
  const [localIsLiked, setLocalIsLiked] = useState(reply.isLiked || false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const isOwn = currentUserId === reply.userId;

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleReportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setReportOpen(true);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId || likeLoading) return;

    const prevLiked = localIsLiked;
    const prevCount = localLikeCount;

    setLocalIsLiked(!prevLiked);
    setLocalLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
    setLikeLoading(true);

    try {
      const result = await commentsApi.toggleCommentLike(reply.id);
      setLocalIsLiked(result.liked);
      setLocalLikeCount(result.likeCount);
      onLikeChange(reply.id, result.liked, result.likeCount);
    } catch (err) {
      logger.error('回复点赞失败', err);
      setLocalIsLiked(prevLiked);
      setLocalLikeCount(prevCount);
      toast.error('操作失败，请稍后重试');
    } finally {
      setLikeLoading(false);
    }
  };

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {!reply.isDeleted && reply.userAvatarUrl ? (
            <Image
              src={reply.userAvatarUrl}
              alt={reply.userName}
              className="w-7 h-7 object-cover"
            />
          ) : (
            <User className="w-3.5 h-3.5 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {reply.isDeleted ? (
            <p className="text-gray-500 italic text-sm">[已删除]</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to={`/user/${reply.userId}`}
                  className="font-bold text-gray-100 text-sm truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {reply.userName}
                </Link>
                <span className="text-gray-500 text-xs">
                  {dayjs(reply.createdAt).fromNow()}
                </span>
                {!isOwn && currentUserId && (
                  <div className="ml-auto relative">
                    <button
                      onClick={handleMenuToggle}
                      className="p-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-full transition-colors"
                      aria-label="更多操作"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpen(false)}
                        />
                        <div className="absolute right-0 top-full mt-1 w-32 bg-[#16181c] border border-[#2f3336] rounded-lg shadow-lg overflow-hidden z-20">
                          <button
                            onClick={handleReportClick}
                            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                          >
                            <Flag className="w-3 h-3" />举报
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="text-gray-200 text-sm mt-0.5">
                <RichTextContent content={reply.body} />
              </div>
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`mt-1 flex items-center gap-1 text-xs transition-colors group ${
                  localIsLiked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'
                }`}
                data-ai-section-type="button"
              >
                <Heart
                  className={`w-3.5 h-3.5 transition-colors ${
                    localIsLiked ? 'fill-current' : ''
                  }`}
                />
                <span>{localLikeCount || ''}</span>
              </button>
              <ReportDialog
                open={reportOpen}
                onClose={() => setReportOpen(false)}
                contentType="comment"
                contentId={reply.id}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
