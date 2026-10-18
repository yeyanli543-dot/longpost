import React, { useEffect, useRef, useState } from 'react';
import { CanvasRenderer, TextLine } from '../utils/canvasRenderer';

declare global {
  interface Window {
    electronAPI?: {
      saveExportImage?: (dataUrl: string, defaultName: string) => Promise<{ success: boolean; path?: string }>;
    };
  }
}

interface CanvasPreviewProps {
  content: string;
  title?: string;
  themeColor?: string;
}

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({ content, title = 'longpost-export', themeColor = '#2563eb' }) => {
  const [pages, setPages] = useState<TextLine[][]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 120ms 防抖与 cancelled 标志保护
  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);

    const timer = setTimeout(() => {
      if (cancelled) return;

      const renderer = new CanvasRenderer({
        width: 800,
        pageHeight: 1200,
        padding: 40,
        themeColor,
      });

      const { linesByPage } = renderer.layout(content);

      if (!cancelled) {
        setPages(linesByPage);
        setIsRendering(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content, themeColor]);

  // 导出全部页面
  const exportAllPages = async () => {
    const canvases = containerRef.current?.querySelectorAll('canvas');
    if (!canvases || canvases.length === 0) return;

    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const filename = `${title}-page-${i + 1}.png`;

      if (window.electronAPI && typeof window.electronAPI.saveExportImage === 'function') {
        // Electron 桌面端原生保存
        await window.electronAPI.saveExportImage(dataUrl, filename);
      } else {
        // 浏览器端循环下载，间隔 180ms 防止浏览器并发拦截
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <div className="flex w-full max-w-[800px] items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          {isRendering ? '正在生成高保真排版...' : `共 ${pages.length} 页长图卡片`}
        </span>
        <button
          onClick={exportAllPages}
          disabled={isRendering || pages.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
        >
          一键导出高清长图
        </button>
      </div>

      <div ref={containerRef} className="flex flex-col gap-6">
        {pages.map((pageLines, index) => (
          <PageCanvas key={index} pageLines={pageLines} index={index} themeColor={themeColor} />
        ))}
      </div>
    </div>
  );
};

const PageCanvas: React.FC<{ pageLines: TextLine[]; index: number; themeColor: string }> = ({
  pageLines,
  index,
  themeColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const renderer = new CanvasRenderer({
        width: 800,
        pageHeight: 1200,
        padding: 40,
        themeColor,
      });
      renderer.renderPageToCanvas(pageLines, canvasRef.current);
    }
  }, [pageLines, themeColor]);

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden dark:border-slate-800">
      <canvas ref={canvasRef} className="max-w-full h-auto" />
      <div className="absolute bottom-2 right-4 text-xs text-slate-400">
        Page {index + 1}
      </div>
    </div>
  );
};
