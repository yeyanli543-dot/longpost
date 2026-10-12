import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@client/src/utils/error-message';
import {
  Loader2,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  Upload,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { articlesApi } from '@client/src/api';
import { uploadFile as uploadToServer } from '@client/src/api/upload';
import { Image } from '@client/src/components/ui/image';
import PublishShareCard from './PublishShareCard';
import ChartInsertDialog from './ChartInsertDialog';
import { SmartEditor } from '@client/src/components/editor/SmartEditor';
import { LocalFirstStore } from '@/lib/local-store';
import { useWorkspaceMode } from '@client/src/hooks/useWorkspaceMode';
import { WorkspaceModeSwitcher } from '@client/src/components/WorkspaceMode/WorkspaceModeSwitcher';

const MAX_IMAGES = 9;
const MAX_ATTACHMENTS = 5;
const EXCERPT_MAX = 200;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadedImage {
  imageUrl: string;
  sortOrder: number;
  name: string;
}

interface UploadedAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  sortOrder: number;
}

interface ArticleComposerProps {
  editId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialExcerpt?: string;
  initialCoverUrl?: string;
  initialStatus?: 'published' | 'draft';
  initialImages?: Array<{ imageUrl: string; sortOrder: number; name?: string }>;
  initialAttachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    fileType?: string;
    sortOrder: number;
  }>;
}

const ArticleComposer = ({
  editId,
  initialTitle,
  initialContent,
  initialExcerpt,
  initialCoverUrl,
  initialStatus,
  initialImages,
  initialAttachments,
}: ArticleComposerProps) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initialTitle ?? '');
  const [content, setContent] = useState(initialContent ?? '');
  const [excerpt, setExcerpt] = useState(initialExcerpt ?? '');
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl ?? null);
  const [images, setImages] = useState<UploadedImage[]>(
    initialImages?.map((img) => ({
      imageUrl: img.imageUrl,
      sortOrder: img.sortOrder,
      name: img.name || `image-${img.sortOrder}`,
    })) ?? [],
  );
  const [attachments, setAttachments] = useState<UploadedAttachment[]>(
    initialAttachments?.map((att) => ({
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      fileSize: att.fileSize ?? 0,
      fileType: att.fileType ?? 'application/octet-stream',
      sortOrder: att.sortOrder,
    })) ?? [],
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const attInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState<{ title: string; content: string; savedAt: string } | null>(null);
  const { isLite, isPro } = useWorkspaceMode();
  const [showMetaSettings, setShowMetaSettings] = useState(false);

  // 初始化检查本地未发布暂存
  useEffect(() => {
    if (!editId && !initialTitle && !initialContent) {
      const saved = LocalFirstStore.getAutoSave();
      if (saved && (saved.title || saved.content) && saved.content.trim().length > 10) {
        setHasRecoverableDraft(saved);
      }
    }
  }, [editId, initialTitle, initialContent]);

  // 自动暂存到本地（防丢稿）
  useEffect(() => {
    if (title.trim() || content.trim()) {
      const timer = setTimeout(() => {
        LocalFirstStore.setAutoSave(title, content);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [title, content]);

  const handleRestoreDraft = () => {
    if (hasRecoverableDraft) {
      setTitle(hasRecoverableDraft.title);
      setContent(hasRecoverableDraft.content);
      setHasRecoverableDraft(null);
      toast.success('已恢复上次未保存的本地草稿');
    }
  };

  const handleDismissDraft = () => {
    LocalFirstStore.clearAutoSave();
    setHasRecoverableDraft(null);
  };

  const canPublish = title.trim().length > 0 && content.trim().length > 0 && !isPublishing;
  const canSaveDraft = title.trim().length > 0 && !isSavingDraft;
  const isEditMode = !!editId;
  const [currentStatus, setCurrentStatus] = useState<'published' | 'draft' | null>(
    initialStatus ?? null,
  );
  const showShareCard = !!publishedId && currentStatus === 'published';

  const uploadFile = async (file: File): Promise<string> => {
    const result = await uploadToServer(file);
    return result.url;
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingCover(true);
    try {
      const url = await uploadFile(files[0]);
      setCoverUrl(url);
      toast.success('封面图已添加');
    } catch (err) {
      logger.error('封面图上传失败', err);
      toast.error(getFriendlyErrorMessage(err, '封面图上传失败，请稍后重试'));
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`最多上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    const fileArr = Array.from(files).slice(0, remaining);
    setUploadingImage(true);
    try {
      const newImages: UploadedImage[] = [];
      for (let i = 0; i < fileArr.length; i++) {
        const url = await uploadFile(fileArr[i]);
        newImages.push({ imageUrl: url, sortOrder: images.length + i, name: fileArr[i].name });
      }
      setImages((prev) => [...prev, ...newImages]);
      toast.success(`已添加 ${newImages.length} 张图片`);
    } catch (err) {
      logger.error('图片上传失败', err);
      toast.error(getFriendlyErrorMessage(err, '图片上传失败，请稍后重试'));
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      toast.error(`最多上传 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    const fileArr = Array.from(files).slice(0, remaining);
    setUploadingAtt(true);
    try {
      const newAtts: UploadedAttachment[] = [];
      for (let i = 0; i < fileArr.length; i++) {
        const url = await uploadFile(fileArr[i]);
        newAtts.push({
          fileName: fileArr[i].name,
          fileUrl: url,
          fileSize: fileArr[i].size,
          fileType: fileArr[i].type || 'application/octet-stream',
          sortOrder: attachments.length + i,
        });
      }
      setAttachments((prev) => [...prev, ...newAtts]);
      toast.success(`已添加 ${newAtts.length} 个附件`);
    } catch (err) {
      logger.error('附件上传失败', err);
      toast.error(getFriendlyErrorMessage(err, '附件上传失败，请稍后重试'));
    } finally {
      setUploadingAtt(false);
      if (attInputRef.current) attInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index).map((img, i) => ({ ...img, sortOrder: i })));
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index).map((att, i) => ({ ...att, sortOrder: i })));
  };

  /**
   * 把图表围栏块写进正文。
   * 优先插在光标处——作者通常写到某一段想配图，插到文末再拖回去很难受。
   */
  const handleInsertChart = (fence: string) => {
    const textarea = contentRef.current;
    const leading = content.length > 0 && !content.endsWith('\n') ? '\n\n' : '';
    const insertion = `${leading}${fence}\n`;

    if (textarea) {
      const start = textarea.selectionStart ?? content.length;
      const end = textarea.selectionEnd ?? content.length;
      setContent(content.slice(0, start) + insertion + content.slice(end));
      const caret = start + insertion.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    } else {
      setContent(content + insertion);
    }

    setShowChartDialog(false);
    toast.success('图表已插入正文');
  };

  const buildPayload = (status: 'published' | 'draft') => ({
    title: title.trim(),
    content: content.trim(),
    excerpt: excerpt.trim() || undefined,
    coverUrl: coverUrl ?? undefined,
    status,
    images: images.length > 0 ? images.map((img) => ({ imageUrl: img.imageUrl, sortOrder: img.sortOrder })) : undefined,
    attachments: attachments.length > 0 ? attachments.map((att) => ({
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      fileSize: att.fileSize,
      fileType: att.fileType,
      sortOrder: att.sortOrder,
    })) : undefined,
  });

  const handlePublish = async () => {
    if (!canPublish) return;
    setIsPublishing(true);
    try {
      const payload = buildPayload('published');
      if (editId) {
        await articlesApi.updateArticle(editId, payload);
        toast.success('文章已更新');
        setTimeout(() => navigate(`/article/${editId}`), 1000);
      } else {
        const res = await articlesApi.createArticle(payload);
        setPublishedId(res.id);
        setPublishedSlug(res.slug ?? null);
        setCurrentStatus('published');
        LocalFirstStore.clearAutoSave();
        toast.success('发布成功！复制链接分享到 X 吧');
      }
    } catch {
      toast.error(editId ? '更新失败，请稍后重试' : '发布失败，请稍后重试');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return;
    setIsSavingDraft(true);
    try {
      const payload = buildPayload('draft');
      if (editId) {
        await articlesApi.updateArticle(editId, payload);
        setCurrentStatus('draft');
        toast.success('草稿已保存');
      } else {
        const res = await articlesApi.createArticle(payload);
        setPublishedId(res.id);
        setPublishedSlug(res.slug ?? null);
        setCurrentStatus('draft');
        toast.success('草稿已保存，可在"我的内容"中继续编辑');
      }
    } catch {
      toast.error('保存草稿失败，请稍后重试');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const shareUrl = publishedSlug
    ? resolveAppUrl(`/p/${publishedSlug}`)
    : publishedId
      ? resolveAppUrl(`/article/${publishedId}`)
      : '';

  const handleViewArticle = () => {
    if (publishedSlug) navigate(`/p/${publishedSlug}`);
    else if (publishedId) navigate(`/article/${publishedId}`);
  };

  const handleReset = () => {
    setTitle(''); setContent(''); setExcerpt(''); setCoverUrl(null);
    setImages([]); setAttachments([]);
    setPublishedId(null); setPublishedSlug(null);
  };

  const showPublishUI = !showShareCard;

  return (
    <div className={`flex flex-col gap-4 transition-all duration-300 ${isLite ? 'max-w-4xl mx-auto' : ''}`}>
      {/* 顶部一键切换模式条 */}
      <div className="flex items-center justify-between pb-1 pt-1">
        <div className="flex items-center gap-2.5">
          <WorkspaceModeSwitcher />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {isLite ? '🍏 Apple 极简禅意模式 · 专注核心写作' : '🔷 Google M3 专业工坊 · 全功能生产力'}
          </span>
        </div>
        {isLite && (
          <button
            type="button"
            onClick={() => setShowMetaSettings(!showMetaSettings)}
            className="text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors"
          >
            {showMetaSettings ? '收起封面与摘要' : '+ 封面与摘要设置'}
          </button>
        )}
      </div>

      {/* 恢复本地暂存条 */}
      {hasRecoverableDraft && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs animate-in fade-in-0">
          <div className="flex items-center gap-2 min-w-0">
            <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">检测到上次未保存的本地草稿「{hasRecoverableDraft.title || '无标题'}」</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRestoreDraft}
              className="px-2.5 py-1 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
            >
              一键恢复
            </button>
            <button
              onClick={handleDismissDraft}
              className="px-2 py-1 text-gray-400 hover:text-white transition-colors"
            >
              忽略
            </button>
          </div>
        </div>
      )}

      {/* 标题输入区 */}
      <div className={isLite ? 'py-2' : ''}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isLite ? '无标题文章' : '文章标题'}
          className={`w-full bg-transparent font-bold text-foreground placeholder:text-muted-foreground/40 outline-none transition-all ${
            isLite
              ? 'text-3xl sm:text-4xl tracking-tight border-none'
              : 'text-2xl border-b border-border/80 pb-3 focus:border-blue-500'
          }`}
          maxLength={100}
        />
        <div className="flex justify-end pt-1">
          <span className="text-xs text-muted-foreground/60">{title.length}/100</span>
        </div>
      </div>

      {/* Excerpt 与 Cover image（极简模式下折叠，专业模式下平铺） */}
      {(isPro || showMetaSettings) && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          {/* Excerpt */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              摘要（可选，留空由系统自动截取正文开头）
            </p>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="用于分享卡片预览..."
              rows={2}
              className="w-full bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none outline-none border border-border/80 focus:border-blue-500 rounded-2xl p-3 transition-colors"
              maxLength={EXCERPT_MAX}
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-muted-foreground/60">{excerpt.length}/{EXCERPT_MAX}</span>
            </div>
          </div>

          {/* Cover image */}
          {showPublishUI && (
            <div className="border-t border-border/60 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">封面图</p>
                {!coverUrl && (
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                  >
                    {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    上传封面
                  </button>
                )}
              </div>
              {coverUrl && (
                <div className="relative rounded-2xl overflow-hidden group">
                  <Image src={coverUrl} alt="封面图" className="w-full h-44 object-cover" />
                  <button
                    onClick={() => setCoverUrl(null)}
                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                    aria-label="删除封面图"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-800 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowChartDialog(true)}
            className="flex items-center gap-1.5 text-sm text-blue-500 transition-colors hover:text-blue-400"
            data-ai-section-type="button"
          >
            <BarChart3 className="h-4 w-4" />
            插入图表
          </button>
          <span className="text-xs text-gray-600">
            图表会渲染成卡片，站内阅读和分享出去的公开链接长得一样
          </span>
        </div>
      </div>

      <div className="pt-2">
        <SmartEditor
          value={content}
          onChange={setContent}
          title={title}
          placeholder="开始创作... 输入 '/' 可快速插入标题、代码块、LaTeX公式、Mermaid流程图、图表与提示卡片"
          onOpenChartDialog={() => setShowChartDialog(true)}
        />
      </div>

      {showChartDialog && (
        <ChartInsertDialog
          onInsert={handleInsertChart}
          onCancel={() => setShowChartDialog(false)}
        />
      )}

      {/* Images */}
      {(images.length > 0 || showPublishUI) && (
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              图片配图 <span className="text-gray-600">（{images.length}/{MAX_IMAGES}）</span>
            </p>
            {showPublishUI && images.length < MAX_IMAGES && (
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                data-ai-section-type="button"
              >
                {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                添加图片
              </button>
            )}
          </div>
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-900 group">
                  <Image src={img.imageUrl} alt={img.name} className="w-full h-full object-cover" />
                  {showPublishUI && (
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                      aria-label="删除图片"
                      data-ai-section-type="button"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
        </div>
      )}

      {/* Attachments */}
      {(attachments.length > 0 || showPublishUI) && (
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              文件附件 <span className="text-gray-600">（{attachments.length}/{MAX_ATTACHMENTS}）</span>
            </p>
            {showPublishUI && attachments.length < MAX_ATTACHMENTS && (
              <button
                onClick={() => attInputRef.current?.click()}
                disabled={uploadingAtt}
                className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                data-ai-section-type="button"
              >
                {uploadingAtt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                添加附件
              </button>
            )}
          </div>
          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-900/50 border border-gray-800 rounded-lg group">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{att.fileName}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(att.fileSize)}
                      {att.fileType ? ` · ${att.fileType.split('/')[1] || att.fileType}` : ''}
                    </p>
                  </div>
                  {showPublishUI && (
                    <button
                      onClick={() => removeAttachment(i)}
                      className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                      aria-label="删除附件"
                      data-ai-section-type="button"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <input ref={attInputRef} type="file" multiple onChange={handleAttachmentUpload} className="hidden" />
        </div>
      )}

      {/* Publish success share card */}
      {showShareCard && (
        <PublishShareCard
          title={title}
          excerpt={excerpt}
          coverUrl={coverUrl}
          firstImageUrl={images[0]?.imageUrl ?? null}
          shareUrl={shareUrl}
          onViewArticle={handleViewArticle}
          onReset={handleReset}
        />
      )}

      {/* Action buttons */}
      {showPublishUI && (
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <span className="text-xs text-muted-foreground font-mono">{content.length} 字</span>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSaveDraft}
              disabled={!canSaveDraft || isSavingDraft}
              className={`disabled:opacity-40 disabled:cursor-not-allowed font-medium py-2 px-5 rounded-full transition-all text-xs border ${
                isLite
                  ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 shadow-2xs'
                  : 'bg-white hover:bg-gray-100 dark:bg-[#202124] dark:hover:bg-[#2d2e30] text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'
              }`}
            >
              {isSavingDraft
                ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                : isEditMode ? '保存草稿' : '存为本地草稿'}
            </button>
            <button
              onClick={handlePublish}
              disabled={!canPublish || isPublishing}
              className={`disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-full transition-all text-xs shadow-md active:scale-95 ${
                isLite
                  ? 'bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 dark:text-black shadow-zinc-500/10'
                  : 'bg-[#1a73e8] hover:bg-[#1557b0] shadow-blue-500/20'
              }`}
            >
              {isPublishing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                : isEditMode ? '保存修改并发布' : '发布长文'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleComposer;
