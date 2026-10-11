import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';

interface MermaidRendererProps {
  chart: string;
  className?: string;
}

let mermaidInstance: any = null;

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
            securityLevel: 'loose',
            fontFamily: 'inherit',
          });
        }

        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaidInstance.render(id, chart);
        if (isMounted) {
          setSvgHtml(svg);
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

  return (
    <div className={`group relative my-6 p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-x-auto ${className}`}>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-background/80 border border-border/40 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
        title="复制 Mermaid 源码"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <div
        ref={containerRef}
        className="flex items-center justify-center min-h-[80px]"
        dangerouslySetInnerHTML={{ __html: svgHtml || '<div class="text-xs text-muted-foreground animate-pulse">正在渲染流程图...</div>' }}
      />
    </div>
  );
};
