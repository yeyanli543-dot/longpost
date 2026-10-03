import { Link } from 'react-router-dom';

interface RichTextContentProps {
  content: string;
  mentions?: Array<{ id: string; name: string }>;
  className?: string;
}

/**
 * 将正文中的 #话题 和 @用户名 解析为可点击链接
 * - #话题 → 蓝色链接，点击跳转到 /hashtag/:tag
 * - @用户名 → 蓝色链接，点击跳转到搜索用户（简化：先做视觉高亮，跳转到搜索页）
 * - 普通文本保持原样
 * - 支持换行符
 */
export default function RichTextContent({
  content,
  mentions,
  className = '',
}: RichTextContentProps) {
  if (!content) return null;

  // Build a map of @name -> userId from mentions array if provided
  const mentionMap = new Map<string, string>();
  if (mentions && mentions.length > 0) {
    for (const m of mentions) {
      if (m && m.name) {
        mentionMap.set(m.name, m.id);
      }
    }
  }

  // Split by lines to preserve newlines
  const lines = content.split('\n');

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {lines.map((line: string, lineIdx: number) => (
        <div key={lineIdx} className="inline">
          {parseLine(line, mentionMap)}
          {lineIdx < lines.length - 1 && '\n'}
        </div>
      ))}
    </div>
  );
}

function parseLine(
  line: string,
  mentionMap: Map<string, string>,
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  // Match #hashtag or @username (Chinese chars included)
  const regex = /([#＃][\p{L}\p{N}_]+|[@＠][\p{L}\p{N}_]+)/gu;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      result.push(
        <span key={`text-${keyIndex++}`}>
          {line.slice(lastIndex, match.index)}
        </span>,
      );
    }

    const token = match[0];
    const prefix = token.charAt(0);
    const value = token.slice(1);

    if (prefix === '#' || prefix === '＃') {
      // Hashtag link
      result.push(
        <Link
          key={`ht-${keyIndex++}`}
          to={`/hashtag/${encodeURIComponent(value)}`}
          className="text-blue-500 hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {prefix}
          {value}
        </Link>,
      );
    } else {
      // Mention - link to user profile if we have the ID, otherwise highlight only
      const userId = mentionMap.get(value);
      if (userId) {
        result.push(
          <Link
            key={`at-${keyIndex++}`}
            to={`/user/${userId}`}
            className="text-blue-500 hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {prefix}
            {value}
          </Link>,
        );
      } else {
        // Visual highlight only, click goes to search
        result.push(
          <Link
            key={`at-${keyIndex++}`}
            to={`/search?q=${encodeURIComponent(value)}&type=users`}
            className="text-blue-500 hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {prefix}
            {value}
          </Link>,
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  // Push remaining text
  if (lastIndex < line.length) {
    result.push(
      <span key={`text-${keyIndex++}`}>{line.slice(lastIndex)}</span>,
    );
  }

  return result;
}
