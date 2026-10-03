import { Link } from 'react-router-dom';
import { User, Award, Clock, Eye } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { ArticleDetail } from '@shared/api.interface';
import { Image } from '@client/src/components/ui/image';

dayjs.extend(relativeTime);

interface ArticleHeaderProps {
  article: ArticleDetail;
}

function estimateReadTime(content: string): number {
  const chars = content.replace(/\s/g, '').length;
  return Math.max(1, Math.ceil(chars / 300));
}

export default function ArticleHeader({ article }: ArticleHeaderProps) {
  const readMinutes = estimateReadTime(article.content);

  return (
    <header className="mb-6">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 text-[#e7e9ea] leading-tight">
        {article.title}
      </h1>

      {/* Author row */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#2f3336]">
        <Link
          to={`/user/${article.authorId}`}
          className="w-9 h-9 rounded-full bg-[#2f3336] flex-shrink-0 flex items-center justify-center hover:opacity-80 transition-opacity overflow-hidden"
        >
          {article.authorAvatarUrl ? (
            <Image
              src={article.authorAvatarUrl}
              alt={article.authorName}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-4 h-4 text-gray-400" />
          )}
        </Link>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <Link
              to={`/user/${article.authorId}`}
              className="text-sm font-semibold text-[#e7e9ea] hover:underline truncate"
            >
              {article.authorName}
            </Link>
            {article.authorRole === 'admin' && (
              <Award className="w-4 h-4 text-[#1d9bf0] flex-shrink-0" aria-label="认证作者" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#71767b]">
            <span>{dayjs(article.createdAt).format('YYYY-MM-DD')}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {readMinutes} 分钟阅读
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {article.readCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
