import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { hashtagsApi } from '@client/src/api';
import type { HashtagItem } from '@shared/api.interface';

const TrendingSidebar = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<HashtagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await hashtagsApi.getTrendingHashtags(10);
        setItems(response.items);
      } catch (err) {
        logger.error('加载热门话题失败', err);
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    };

    void fetchTrending();
  }, []);

  const handleClick = (tag: string) => {
    navigate(`/hashtag/${tag}`);
  };

  return (
    <div className="bg-[#16181c] rounded-2xl p-4">
      <h3 className="text-xl font-bold text-[#e7e9ea] mb-3">热门话题</h3>

      {loading && (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#1d9bf0]" />
        </div>
      )}

      {error && !loading && (
        <div className="py-4 text-center text-sm text-[#71767b]">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-4 text-center text-sm text-[#71767b]">
          暂无热门话题
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="-mx-2">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleClick(item.tag)}
              className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-[#1d1f23] transition-colors cursor-pointer"
            >
              <Hash className="w-4 h-4 text-[#1d9bf0] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[#e7e9ea] truncate block">
                  #{item.tag}
                </span>
                <p className="text-xs text-[#71767b] mt-0.5">
                  {item.postCount + item.articleCount} 条内容
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrendingSidebar;
