import { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Image } from '@client/src/components/ui/image';
import type { ArticleImage } from '@shared/api.interface';

interface ImageLightboxProps {
  images: ArticleImage[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  onClose: () => void;
}

export default function ImageLightbox({
  images,
  currentIndex,
  setCurrentIndex,
  onClose,
}: ImageLightboxProps) {
  const prev = useCallback(() => {
    setCurrentIndex((currentIndex - 1 + images.length) % images.length);
  }, [currentIndex, images.length, setCurrentIndex]);

  const next = useCallback(() => {
    setCurrentIndex((currentIndex + 1) % images.length);
  }, [currentIndex, images.length, setCurrentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  if (images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="关闭"
        data-ai-section-type="button"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Prev button */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="上一张"
          data-ai-section-type="button"
        >
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>
      )}

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={images[currentIndex].imageUrl}
          alt=""
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
          sizes="90vw"
        />
      </div>

      {/* Next button */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="下一张"
          data-ai-section-type="button"
        >
          <ChevronRight className="w-8 h-8 text-white" />
        </button>
      )}

      {/* Counter */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 rounded-full text-sm text-white">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}
