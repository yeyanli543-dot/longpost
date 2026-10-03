export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineFormat(text: string): string {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/(^|\W)\*(.+?)\*/g, '$1<em>$2</em>');
  escaped = escaped.replace(/`(.+?)`/g, '<code>$1</code>');
  escaped = escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  return escaped;
}

function wrapListItems(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const isLi = line.startsWith('<li>');
    if (isLi) {
      const content = line.replace(/^<li>|<\/li>$/g, '');
      const isOrdered = /^\d+\./.test(content);
      if (isOrdered) {
        if (!inOl) {
          if (inUl) {
            result.push('</ul>');
            inUl = false;
          }
          result.push('<ol>');
          inOl = true;
        }
      } else {
        if (!inUl) {
          if (inOl) {
            result.push('</ol>');
            inOl = false;
          }
          result.push('<ul>');
          inUl = true;
        }
      }
      result.push(line);
    } else {
      if (inUl) {
        result.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        result.push('</ol>');
        inOl = false;
      }
      result.push(line);
    }
  }

  if (inUl) result.push('</ul>');
  if (inOl) result.push('</ol>');

  return result.join('\n');
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const html: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim();
      if (text) {
        html.push(`<p>${inlineFormat(text)}</p>`);
      }
      paragraphBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      html.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph();
      html.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      html.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      html.push(
        `<blockquote>${inlineFormat(trimmed.slice(2))}</blockquote>`,
      );
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph();
      html.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      flushParagraph();
      const content = trimmed.replace(/^\d+\.\s/, '');
      html.push(`<li>${inlineFormat(content)}</li>`);
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();

  return wrapListItems(html.join('\n'));
}

export function formatSize(sizeBytes: number | null): string {
  if (!sizeBytes || sizeBytes <= 0) return '未知大小';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024)
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExt(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1
    ? parts[parts.length - 1].toUpperCase().slice(0, 4)
    : 'FILE';
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}
