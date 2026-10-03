import { Link } from 'react-router-dom';

interface HashtagTextProps {
  text: string;
  className?: string;
}

interface ParsedSegment {
  type: 'text' | 'hashtag' | 'mention';
  value: string;
}

function parseText(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const regex = /([#＃][\p{L}\p{N}_]+|@[\p{L}\p{N}_]+)/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index),
      });
    }

    const token = match[0];
    if (token.startsWith('#') || token.startsWith('＃')) {
      const tag = token.slice(1);
      segments.push({ type: 'hashtag', value: tag });
    } else if (token.startsWith('@')) {
      const name = token.slice(1);
      segments.push({ type: 'mention', value: name });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

const HashtagText = ({ text, className }: HashtagTextProps) => {
  const segments = parseText(text);

  return (
    <span className={className}>
      {segments.map((seg, index) => {
        if (seg.type === 'hashtag') {
          return (
            <Link
              key={`ht-${index}`}
              to={`/hashtag/${seg.value}`}
              className="text-blue-500 hover:underline cursor-pointer"
            >
              #{seg.value}
            </Link>
          );
        }
        if (seg.type === 'mention') {
          return (
            <Link
              key={`at-${index}`}
              to={`/user/${seg.value}`}
              className="text-blue-500 hover:underline cursor-pointer"
            >
              @{seg.value}
            </Link>
          );
        }
        return (
          <span key={`txt-${index}`} className="whitespace-pre-wrap break-words">
            {seg.value}
          </span>
        );
      })}
    </span>
  );
};

export default HashtagText;
