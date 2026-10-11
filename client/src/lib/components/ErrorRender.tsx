import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorRenderProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

export const ErrorRender: React.FC<ErrorRenderProps> = ({ error, resetErrorBoundary }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="p-4 mb-4 rounded-full bg-red-500/10 text-red-500">
        <AlertTriangle className="w-10 h-10" />
      </div>
      <h2 className="text-xl font-bold text-gray-100 mb-2">页面渲染出错</h2>
      <p className="text-sm text-gray-400 max-w-md mb-6 break-words">
        {error?.message || '遇到未知异常，请尝试刷新重试。'}
      </p>
      {resetErrorBoundary && (
        <button
          onClick={resetErrorBoundary}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </button>
      )}
    </div>
  );
};
