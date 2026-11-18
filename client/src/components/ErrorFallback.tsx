import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorFallbackProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export default function ErrorFallback({
  message = '加载失败',
  onRetry,
  compact = false,
}: ErrorFallbackProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3 text-muted-foreground">
        <p className="text-sm">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors"
            data-ai-section-type="button"
          >
            <RefreshCw className="w-3 h-3" />
            点击重试
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4 text-muted-foreground">
      <AlertCircle className="w-10 h-10" />
      <p>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors"
          data-ai-section-type="button"
        >
          <RefreshCw className="w-4 h-4" />
          点击重试
        </button>
      )}
    </div>
  );
}
