import { useState, useRef } from 'react';
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
} from 'lucide-react';
import { resolveAppUrl } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { articlesApi } from '@client/src/api';
import { uploadFile as uploadToServer } from '@client/src/api/upload';
import { Image } from '@client/src/components/ui/image';
import PublishShareCard from './PublishShareCard';
import ChartInsertDialog from './ChartInsertDialog';

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
    <div className="flex flex-col gap-4">
      <div>
        <input
          type="text" value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="文章标题"
          className="w-full bg-transparent text-2xl font-bold text-gray-100 placeholder:text-gray-600 outline-none border-b border-gray-800 pb-3 focus:border-blue-500 transition-colors"
          maxLength={100}
        />
        <div className="flex justify-end pt-1">
          <span className="text-xs text-gray-600">{title.length}/100</span>
        </div>
      </div>

      {/* Excerpt */}
      <div>
        <p className="text-sm text-gray-500 mb-2">摘要（可选，留空由系统自动截取正文开头）</p>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="用于分享卡片预览..."
          rows={2}
          className="w-full bg-transparent text-sm text-gray-300 placeholder:text-gray-600 resize-none outline-none border border-gray-700 focus:border-blue-500 rounded-lg p-3 transition-colors"
          maxLength={EXCERPT_MAX}
        />
        <div className="flex justify-end mt-1">
          <span className="text-xs text-gray-600">{excerpt.length}/{EXCERPT_MAX}</span>
        </div>
      </div>

      {/* Cover image */}
      {showPublishUI && (
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">封面图</p>
            {!coverUrl && (
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                data-ai-section-type="button"
              >
                {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                上传封面
              </button>
            )}
          </div>
          <p className="text-xs text-gray-600 mb-3">封面图将用于分享卡片和文章顶部展示，推荐尺寸 1200x630</p>
          {coverUrl && (
            <div className="relative rounded-lg overflow-hidden group">
              <Image src={coverUrl} alt="封面图" className="w-full h-48 object-cover" />
              <button
                onClick={() => setCoverUrl(null)}
                className="absolute top-2 right-2 p-2 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                aria-label="删除封面图"
                data-ai-section-type="button"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
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

      <textarea
        ref={contentRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写点什么..."
        rows={16}
        className="w-full bg-transparent text-base text-gray-100 placeholder:text-gray-500 resize-none outline-none border-none leading-relaxed"
      />

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
        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
          <span className="text-sm text-gray-500">{content.length} 字</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={!canSaveDraft || isSavingDraft}
              className="bg-[#16181c] hover:bg-[#1c1f23] disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 font-medium py-2.5 px-5 rounded-full transition-colors border border-gray-700 text-sm"
              data-ai-section-type="button"
            >
              {isSavingDraft
                ? <Loader2 className="w-4 h-4 animate-spin inline" />
                : isEditMode ? '保存草稿' : '存为草稿'}
            </button>
            <button
              onClick={handlePublish}
              disabled={!canPublish || isPublishing}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-6 rounded-full transition-colors"
              data-ai-section-type="button"
            >
              {isPublishing
                ? <Loader2 className="w-4 h-4 animate-spin inline" />
                : isEditMode ? '保存修改并发布' : '发布长文'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleComposer;
