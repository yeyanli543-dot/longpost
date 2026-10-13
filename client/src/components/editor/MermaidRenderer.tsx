import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Download } from 'lucide-react';

interface MermaidRendererProps {
  chart: string;
  className?: string;
}

let mermaidInstance: any = null;

function sanitizeSvgHtml(rawSvg: string): string {
  return rawSvg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/on[a-z]+\s*=/gi, 'data-sanitized-attr=');
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function renderChart() {
      if (!chart.trim()) return;
      setError(null);

      try {
        if (!mermaidInstance) {
          const mod = await import('mermaid');
          mermaidInstance = mod.default || mod;
          mermaidInstance.initialize({
            startOnLoad: false,
            theme: document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('dark-mode') ? 'dark' : 'neutral',
            securityLevel: 'strict',
            fontFamily: 'inherit',
          });
        }

        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaidInstance.render(id, chart);
        if (isMounted) {
          setSvgHtml(sanitizeSvgHtml(svg));
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Mermaid 图表解析错误');
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPng = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      img.onload = () => {
        const rect = svgEl.getBoundingClientRect();
        const width = Math.max(rect.width, 300);
        const height = Math.max(rect.height, 150);
        canvas.width = width * 2; // 2x 超清 Retina
        canvas.height = height * 2;
        if (ctx) {
          ctx.scale(2, 2);
          const isDark =
            document.documentElement.classList.contains('dark') ||
            document.documentElement.classList.contains('dark-mode');
          ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
        const a = document.createElement('a');
        a.download = `flowchart-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
    } catch (e) {
      console.error('Failed to export mermaid svg as png', e);
    }
  };

  if (error) {
    return (
      <div className="my-4 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">
        <div className="flex items-center gap-2 font-medium mb-1">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>流程图语法提示</span>
        </div>
        <p className="text-xs text-red-400/80 mb-2">{error}</p>
        <pre className="p-2 bg-black/40 rounded text-xs font-mono overflow-x-auto text-gray-300">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  const safeSvgHtml = svgHtml
    ? sanitizeSvgHtml(svgHtml)
    : '<div class="text-xs text-muted-foreground animate-pulse">正在渲染流程图...</div>';

  return (
    <div className={`group relative my-6 p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-x-auto ${className}`}>
      <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={handleExportPng}
          className="p-1.5 rounded-lg bg-background/80 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          title="导出为高清 PNG 图片"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg bg-background/80 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          title="复制 Mermaid 源码"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex items-center justify-center min-h-[80px]"
        dangerouslySetInnerHTML={{ __html: safeSvgHtml }}
      />
    </div>
  );
};

