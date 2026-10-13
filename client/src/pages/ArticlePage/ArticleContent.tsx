import { useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Download } from 'lucide-react';
import { Image } from '@client/src/components/ui/image';
import ArticleBody from '@client/src/components/ArticleBody';
import { UniversalLink } from '@/lib/components/UniversalLink';
import type { ArticleDetail, ArticleImage, ArticleAttachment, FontSize } from '@shared/api.interface';
import ImageLightbox from './ImageLightbox';

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
  xlarge: 'text-xl md:text-2xl',
};

interface ArticleContentProps {
  article: ArticleDetail;
  fontSize: FontSize;
}

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
      <div className={`${textClass} leading-[1.75] md:leading-relaxed text-foreground article-editorial-text article-drop-cap mb-8`}>
        <ArticleBody
          content={article.content}
          markdownClassName="prose-headings:text-foreground prose-p:text-foreground prose-a:text-primary prose-strong:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-muted prose-pre:text-foreground prose-blockquote:border-primary prose-blockquote:text-muted-foreground prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3"
        />
      </div>

      {/* Image gallery */}
      {article.images && article.images.length > 0 && (
        <section className="pt-6 pb-2 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">
              配图{' '}
              <span className="text-sm font-normal text-muted-foreground">
                （{article.images.length}张）
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {article.images.map((img: ArticleImage, index: number) => (
              <button
                 key={img.id}
                 onClick={() => handleImageClick(index)}
                 className="aspect-square min-h-[44px] min-w-[44px] rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity text-left"
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
        <section className="pt-6 pb-2 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <Paperclip className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">
              附件下载{' '}
              <span className="text-sm font-normal text-muted-foreground">
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
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <IconComp className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {att.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(att.fileSize)}
                      {att.fileType ? ` · ${att.fileType.split('/').pop()}` : ''}
                    </p>
                  </div>
                  <UniversalLink
                    to={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full hover:bg-primary/20 transition-colors flex-shrink-0"
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
