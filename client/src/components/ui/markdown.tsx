'use client';

import * as React from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

export interface MarkdownProps extends Options {
  className?: string;
}

const CALLOUT_LABELS: Record<string, { label: string; border: string }> = {
  NOTE: { label: '💡 提示 (NOTE)', border: 'border-sky-500/60 bg-sky-500/5' },
  TIP: { label: '✨ 技巧 (TIP)', border: 'border-emerald-500/60 bg-emerald-500/5' },
  IMPORTANT: { label: '📌 重要 (IMPORTANT)', border: 'border-violet-500/60 bg-violet-500/5' },
  WARNING: { label: '⚠️ 警告 (WARNING)', border: 'border-amber-500/60 bg-amber-500/5' },
  CAUTION: { label: '🚨 注意 (CAUTION)', border: 'border-rose-500/60 bg-rose-500/5' },
};

function preprocessExtendedMarkdown(raw: string): string {
  if (!raw) return raw;
  const codeBlocks: string[] = [];
  let text = raw.replace(/```[\s\S]*?```/g, (m) => {
    const idx = codeBlocks.length;
    codeBlocks.push(m);
    return `\u0000MD_CODE_${idx}\u0000`;
  });

  // Display math blocks $$...$$ -> fenced math code block
  text = text.replace(/\$\$\s*\n([\s\S]*?)\n\s*\$\$/g, (_, expr: string) => {
    return `\n\`\`\`math\n${expr.trim()}\n\`\`\`\n`;
  });

  // GitHub Callouts: > [!NOTE] -> > **💡 提示 (NOTE)**
  text = text.replace(
    /^(\s*>\s*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gim,
    (_, prefix: string, kind: string) => {
      const meta = CALLOUT_LABELS[kind.toUpperCase()];
      return `${prefix}**${meta ? meta.label : kind.toUpperCase()}**\n${prefix}`;
    },
  );

  // Restore fenced code blocks
  text = text.replace(/\u0000MD_CODE_(\d+)\u0000/g, (_, idx) => codeBlocks[Number(idx)] ?? '');
  return text;
}

function renderInlineEnhancements(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child !== 'string') return child;
    if (!child.includes('==') && !child.includes('$')) return child;

    const parts = child.split(/(==[^=\n]+==|\$[^$\n]+\$)/g);
    if (parts.length === 1) return child;

    return parts.map((part, idx) => {
      if (part.startsWith('==') && part.endsWith('==') && part.length > 4) {
        return (
          <mark
            key={`hl-${idx}`}
            className="bg-amber-300/30 dark:bg-amber-400/25 text-inherit px-1 py-0.5 rounded"
          >
            {part.slice(2, -2)}
          </mark>
        );
      }
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        return (
          <code
            key={`math-${idx}`}
            className="font-serif italic px-1.5 py-0.5 rounded bg-muted/70 text-foreground"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  });
}

function defaultUrlTransform(url: string): string {
  const trimmed = (url || '').trim();
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:')
  ) {
    return trimmed;
  }
  return '';
}

const defaultComponents: NonNullable<Options['components']> = {
  a: ({ className, href, ...props }) => (
    <a
      className={cn(className)}
      href={href}
      rel={props.rel ?? 'noreferrer'}
      target={props.target ?? '_blank'}
      {...props}
    />
  ),
  img: ({ className, alt, ...props }) => (
    <img className={cn('max-w-full h-auto', className)} alt={alt ?? ''} loading="lazy" decoding="async" {...props} />
  ),
  p: ({ children, ...props }) => <p {...props}>{renderInlineEnhancements(children)}</p>,
  li: ({ children, ...props }) => <li {...props}>{renderInlineEnhancements(children)}</li>,
  blockquote: ({ className, children, ...props }) => (
    <blockquote
      className={cn('border-l-4 border-primary/50 bg-muted/30 rounded-r-xl px-4 py-2 my-3', className)}
      {...props}
    >
      {children}
    </blockquote>
  ),
};

export function Markdown({
  className,
  remarkPlugins,
  components,
  children,
  urlTransform,
  ...props
}: MarkdownProps) {
  const processedChildren =
    typeof children === 'string' ? preprocessExtendedMarkdown(children) : children;

  return (
    <div className={cn('prose max-w-none dark:prose-invert', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...(remarkPlugins ?? [])]}
        components={{ ...defaultComponents, ...components }}
        urlTransform={urlTransform ?? defaultUrlTransform}
        {...props}
      >
        {processedChildren}
      </ReactMarkdown>
    </div>
  );
}
