import { useMemo } from 'react';
import { Markdown } from '@client/src/components/ui/markdown';
import { splitChartCards } from '@shared/chart-card';
import ChartBlock from './ChartBlock';
import { MermaidRenderer } from '@client/src/components/editor/MermaidRenderer';

interface ArticleBodyProps {
  content: string;
  /** 传给 Markdown 的排版类，由调用方按字号等场景传入 */
  markdownClassName?: string;
  theme?: 'light' | 'dark';
}

/**
 * 文章正文渲染：普通段落走 markdown，```chart 围栏块走图表。
 *
 * 用分段渲染而不是给 markdown 加自定义代码块组件，是因为
 * 图表块里是纯 JSON 文本，交给 markdown 解析容易被当成代码块或吃掉换行。
 */
export default function ArticleBody({ content, markdownClassName, theme = 'dark' }: ArticleBodyProps) {
  const segments = useMemo(() => splitChartCards(content ?? ''), [content]);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === 'chart') {
          return <ChartBlock key={`chart-${index}`} card={segment.card} theme={theme} />;
        }

        if (segment.kind === 'invalid-chart') {
          return (
            <pre
              key={`invalid-chart-${index}`}
              className="my-6 overflow-x-auto rounded-md border border-[#2f3336] bg-[#16181c] p-3 text-xs text-[#71767b]"
            >
              <code>{segment.raw.trim()}</code>
            </pre>
          );
        }

        if (!segment.content.trim()) return null;

        const parts = segment.content.split(/(```mermaid[\s\S]*?```)/g);
        return (
          <div key={`md-seg-${index}`}>
            {parts.map((part, pIdx) => {
              if (part.startsWith('```mermaid') && part.endsWith('```')) {
                const code = part.replace(/^```mermaid\s*/, '').replace(/```$/, '').trim();
                return <MermaidRenderer key={`mermaid-${index}-${pIdx}`} chart={code} />;
              }
              if (!part.trim()) return null;
              return (
                <Markdown key={`md-${index}-${pIdx}`} className={markdownClassName}>
                  {part}
                </Markdown>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
