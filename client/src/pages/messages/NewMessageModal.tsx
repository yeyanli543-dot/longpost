import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import { dmApi } from '@client/src/api';
import type { AuthUser } from '@shared/api.interface';

interface NewMessageModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (userId: string, conversationId: string) => void;
}

const NewMessageModal = ({ open, onClose, onSelect }: NewMessageModalProps) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (!open) {
      setQuery('');
      setUsers([]);
    }
  }, [open]);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const response = await dmApi.searchUsers(q, 10);
      setUsers(response.items);
    } catch (error) {
      logger.error('搜索用户失败', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void searchUsers(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchUsers]);

  const handleSelect = async (user: AuthUser) => {
    try {
      const response = await dmApi.createConversation(user.id);
      onSelect(user.id, response.conversationId);
      onClose();
    } catch (error) {
      logger.error('创建会话失败', error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[500px] mx-4 bg-[#16181c] border border-[#2f3336] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2f3336]">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            data-ai-section-type="button"
          >
            <X className="w-5 h-5 text-[#e7e9ea]" />
          </button>
          <h2 className="text-xl font-bold text-[#e7e9ea]">新私信</h2>
        </div>

        <div className="px-4 py-3 border-b border-[#2f3336]">
          <div className="flex items-center gap-3 bg-black rounded-full px-4 py-2">
            <Search className="w-4 h-4 text-[#71767b] flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户"
              className="flex-1 bg-transparent text-[#e7e9ea] placeholder:text-[#71767b] outline-none text-base"
            />
            {loading && (
              <Loader2 className="w-4 h-4 text-[#1d9bf0] animate-spin flex-shrink-0" />
            )}
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {users.length === 0 && query.trim() && !loading && (
            <div className="px-4 py-8 text-center text-[#71767b] text-sm">
              未找到相关用户
            </div>
          )}
          {users.length === 0 && !query.trim() && (
            <div className="px-4 py-8 text-center text-[#71767b] text-sm">
              输入用户名开始搜索
            </div>
          )}
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => { void handleSelect(user); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
              data-ai-section-type="button"
            >
              <div className="w-10 h-10 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.nickname}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-bold text-gray-300">
                    {user.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#e7e9ea] font-bold truncate">
                  {user.nickname}
                </p>
                <p className="text-[#71767b] text-sm truncate">{user.email}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[#2f3336]">
          <Link
            to="/search"
            className="text-[#1d9bf0] text-sm hover:underline"
            onClick={onClose}
          >
            高级搜索
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NewMessageModal;
