import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { postsApi } from '@/api';
import ActionButtons from '@/components/ActionButtons';
import CommentsSection from '@/components/CommentsSection';
import RichTextContent from '@/components/RichTextContent';
import ShareDialog from '@/components/share/ShareDialog';
import { Image } from '@/components/ui/image';
import { resolveAppUrl } from '@/lib/utils';
import type { PostItem } from '@shared/api.interface';

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [post, setPost] = useState<PostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!id) return;
    setLoading(true);
    setError(null);
    setPost(null);
    void postsApi.getPost(id).then((result) => {
      if (active) setPost(result);
    }).catch((err: unknown) => {
      if (!active) return;
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 404 ? '这条动态不存在或已不可用。' : '动态加载失败，请稍后重试。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id, retry]);

  useEffect(() => {
    if (post && location.hash === '#comments') {
      document.getElementById('post-comments')?.scrollIntoView({ block: 'start' });
    }
  }, [post, location.hash]);

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };
  const scrollToComments = () => document.getElementById('post-comments')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-border bg-background/95 px-4 pt-safe backdrop-blur">
        <button type="button" onClick={goBack} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted" aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">动态</h1>
      </header>
      {loading ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground" role="status">正在加载动态…</div>
      ) : error || !post ? (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center text-muted-foreground" role="alert">
          <p>{error || '动态加载失败。'}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <RefreshCw className="h-4 w-4" />重试
          </button>
        </div>
      ) : (
        <article className="mx-auto max-w-[700px] px-5 py-8 sm:px-7">
          <div className="flex items-center gap-3">
            <Link to={`/user/${post.authorId}`} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary" aria-label={`查看 ${post.authorName} 的主页`}>
              {post.authorAvatarUrl ? <Image src={post.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
            </Link>
            <div className="min-w-0">
              <Link to={`/user/${post.authorId}`} className="block truncate font-semibold hover:underline">{post.authorName}</Link>
              <time className="text-sm text-muted-foreground" dateTime={post.createdAt}>{dayjs(post.createdAt).format('YYYY-MM-DD HH:mm')}</time>
            </div>
          </div>
          <div className="mt-6 whitespace-pre-wrap break-words text-lg leading-relaxed"><RichTextContent content={post.content} /></div>
          {post.article && post.article.status === 'published' && (
            <Link to={post.article.slug ? `/p/${post.article.slug}` : `/article/${post.article.id}`} className="mt-6 block rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted">
              <span className="text-xs font-semibold text-primary">关联长文</span>
              <h2 className="mt-2 text-lg font-semibold">{post.article.title}</h2>
              {post.article.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.article.excerpt}</p>}
            </Link>
          )}
          <div className="my-6 border-y border-border py-3">
            <ActionButtons contentType="post" contentId={post.id} commentCount={post.commentCount} likeCount={post.likeCount} repostCount={post.repostCount} isLiked={post.isLiked} isReposted={post.isReposted} onCommentClick={scrollToComments} onShareClick={() => setShareOpen(true)} />
          </div>
          <section id="post-comments" className="scroll-mt-20 pb-8"><CommentsSection contentType="post" contentId={post.id} /></section>
          <ShareDialog open={shareOpen} onOpenChange={setShareOpen} payload={{ title: `${post.authorName} 的动态`, url: resolveAppUrl(`/post/${post.id}`), summary: post.content, authorName: post.authorName, coverUrl: null }} />
        </article>
      )}
    </div>
  );
}
