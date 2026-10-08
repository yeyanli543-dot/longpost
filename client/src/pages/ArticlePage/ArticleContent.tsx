import { useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Download } from 'lucide-react';
import { Image } from '@client/src/components/ui/image';
import ArticleBody from '@client/src/components/ArticleBody';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import type { ArticleDetail, ArticleImage, ArticleAttachment } from '@shared/api.interface';
import ImageLightbox from './ImageLightbox';

type FontSize = 'small' | 'medium' | 'large';

interface ArticleContentProps {
  article: ArticleDetail;
  fontSize: FontSize;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  if (imageExts.includes(ext)) return ImageIcon;
  return FileText;
}

const fontSizeMap: Record<FontSize, string> = {
  small: 'text-sm md:text-base',
  medium: 'text-base md:text-lg',
  large: 'text-lg md:text-xl',
};

export default function ArticleContent({ article, fontSize }: ArticleContentProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  const textClass = fontSizeMap[fontSize];

  const handleImageClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const coverUrl = article.coverUrl || article.images?.[0]?.imageUrl || null;

  return (
    <div className="article-content">
      {/* Cover image */}
      {coverUrl && (
        <div className="mb-6 rounded-md overflow-hidden">
          <Image
            src={coverUrl}
            alt={article.title}
            className="w-full max-h-[420px] object-cover"
            sizes="(max-width: 700px) 100vw, 700px"
          />
        </div>
      )}

      {/* Article body */}
      <div className={`${textClass} leading-[1.75] md:leading-relaxed text-[#e7e9ea] mb-8`}>
        <ArticleBody
          content={article.content}
          markdownClassName="prose-headings:text-[#e7e9ea] prose-p:text-[#e7e9ea] prose-a:text-[#1d9bf0] prose-strong:text-[#e7e9ea] prose-code:bg-[#16181c] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-[#16181c] prose-pre:text-[#e7e9ea] prose-blockquote:border-[#1d9bf0] prose-blockquote:text-[#71767b] prose-ul:text-[#e7e9ea] prose-ol:text-[#e7e9ea] prose-li:text-[#e7e9ea] prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3"
        />
      </div>

      {/* Image gallery */}
      {article.images && article.images.length > 0 && (
        <section className="pt-6 pb-2 border-t border-[#2f3336]">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-[#1d9bf0]" />
            <h2 className="text-lg font-bold text-[#e7e9ea]">
              配图{' '}
              <span className="text-sm font-normal text-[#71767b]">
                （{article.images.length}张）
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {article.images.map((img: ArticleImage, index: number) => (
              <button
                 key={img.id}
                 onClick={() => handleImageClick(index)}
                 className="aspect-square min-h-[44px] min-w-[44px] rounded-md overflow-hidden bg-[#16181c] hover:opacity-90 transition-opacity text-left"
                 aria-label={`查看第 ${index + 1} 张图片`}
               >
                <Image
                  src={img.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Attachments */}
      {article.attachments && article.attachments.length > 0 && (
        <section className="pt-6 pb-2 border-t border-[#2f3336]">
          <div className="flex items-center gap-2 mb-4">
            <Paperclip className="w-5 h-5 text-[#1d9bf0]" />
            <h2 className="text-lg font-bold text-[#e7e9ea]">
              附件下载{' '}
              <span className="text-sm font-normal text-[#71767b]">
                （{article.attachments.length}个）
              </span>
            </h2>
          </div>
          <div className="space-y-2">
            {article.attachments.map((att: ArticleAttachment) => {
              const IconComp = getFileIcon(att.fileName);
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-3 p-3 bg-[#16181c] border border-[#2f3336] rounded-md"
                >
                  <div className="w-10 h-10 rounded-md bg-[#2f3336] flex items-center justify-center flex-shrink-0">
                    <IconComp className="w-5 h-5 text-[#1d9bf0]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#e7e9ea] truncate">
                      {att.fileName}
                    </p>
                    <p className="text-xs text-[#71767b]">
                      {formatFileSize(att.fileSize)}
                      {att.fileType ? ` · ${att.fileType.split('/').pop()}` : ''}
                    </p>
                  </div>
                  <UniversalLink
                    to={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#1d9bf0]/10 text-[#1d9bf0] text-sm font-medium rounded-full hover:bg-[#1d9bf0]/20 transition-colors flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下载
                  </UniversalLink>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxOpen && article.images && (
        <ImageLightbox
          images={article.images}
          currentIndex={lightboxIndex}
          setCurrentIndex={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
