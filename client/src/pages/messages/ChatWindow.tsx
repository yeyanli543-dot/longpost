import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Check, CheckCheck, Loader2, MessageSquare } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Image } from '@client/src/components/ui/image';
import { dmApi } from '@client/src/api';
import type { DMConversation, DMMessage } from '@shared/api.interface';

interface ChatWindowProps {
  conversation: DMConversation;
  currentUserId: string;
  isMobile: boolean;
  onBack: () => void;
}

const POLL_INTERVAL = 15000;
const LOAD_MORE_THRESHOLD = 100;

const ChatWindow = ({
  conversation,
  currentUserId,
  isMobile,
  onBack,
}: ChatWindowProps) => {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optimisticIdsRef = useRef<Set<string>>(new Set());
  const lastMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  }, []);

  const loadInitialMessages = useCallback(async () => {
    setInitialLoaded(false);
    try {
      const response = await dmApi.getMessages(conversation.id, undefined, 30);
      const sorted = [...response.items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages(sorted);
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
      if (sorted.length > 0) {
        lastMessageIdRef.current = sorted[sorted.length - 1].id;
      }
    } catch (error) {
      logger.error('加载消息失败', error);
    } finally {
      setInitialLoaded(true);
      setTimeout(() => scrollToBottom(false), 0);
    }
  }, [conversation.id, scrollToBottom]);

  useEffect(() => {
    lastMessageIdRef.current = null;
    optimisticIdsRef.current.clear();
    setMessages([]);
    setHasMore(false);
    setNextCursor(undefined);
    setInput('');
    void loadInitialMessages();
  }, [conversation.id, loadInitialMessages]);

  const pollNewMessages = useCallback(async () => {
    try {
      const response = await dmApi.getMessages(conversation.id, undefined, 30);
      const sorted = [...response.items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const lastId = sorted.length > 0 ? sorted[sorted.length - 1].id : null;
      if (lastId && lastId !== lastMessageIdRef.current) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = sorted.filter((m) => !existingIds.has(m.id) && !optimisticIdsRef.current.has(m.id));
          if (newMsgs.length > 0) {
            lastMessageIdRef.current = lastId;
            setTimeout(() => scrollToBottom(true), 0);
            return [...prev, ...newMsgs];
          }
          lastMessageIdRef.current = lastId;
          return prev;
        });
      }
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
    } catch (error) {
      logger.error('轮询新消息失败', error);
    }
  }, [conversation.id, scrollToBottom]);

  useEffect(() => {
    const timer = setInterval(() => {
      void pollNewMessages();
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [pollNewMessages]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop <= LOAD_MORE_THRESHOLD) {
      void loadMore();
    }
  }, [loadingMore, hasMore]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    const prevScrollHeight = scrollContainerRef.current?.scrollHeight ?? 0;
    const prevScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    try {
      const response = await dmApi.getMessages(conversation.id, nextCursor, 30);
      const olderSorted = [...response.items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages((prev) => [...olderSorted, ...prev]);
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) {
          const newScrollHeight = el.scrollHeight;
          const diff = newScrollHeight - prevScrollHeight;
          el.scrollTop = prevScrollTop + diff;
        }
      });
    } catch (error) {
      logger.error('加载更多消息失败', error);
    } finally {
      setLoadingMore(false);
    }
  }, [conversation.id, loadingMore, hasMore, nextCursor]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    const optimisticId = `optimistic_${Date.now()}`;
    const optimisticMsg: DMMessage = {
      id: optimisticId,
      conversationId: conversation.id,
      senderId: currentUserId,
      content,
      createdAt: new Date().toISOString(),
      isOwn: true,
    };
    optimisticIdsRef.current.add(optimisticId);

    setInput('');
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 0);

    setSending(true);
    try {
      const response = await dmApi.sendMessage(conversation.id, content);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? response.message : m)),
      );
      optimisticIdsRef.current.delete(optimisticId);
      optimisticIdsRef.current.add(response.message.id);
      lastMessageIdRef.current = response.message.id;
    } catch (error) {
      logger.error('发送消息失败', error);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      optimisticIdsRef.current.delete(optimisticId);
    } finally {
      setSending(false);
    }
  }, [input, sending, conversation.id, currentUserId, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const avatarInitial = conversation.otherUserName
    ? conversation.otherUserName.charAt(0).toUpperCase()
    : '?';

  return (
    <div className="flex flex-col h-full bg-black border-l border-[#2f3336]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2f3336] sticky top-0 bg-black/80 backdrop-blur z-10">
        {isMobile && (
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
            data-ai-section-type="button"
          >
            <ArrowLeft className="w-5 h-5 text-[#e7e9ea]" />
          </button>
        )}
        <Link
          to={`/user/${conversation.otherUserId}`}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {conversation.otherUserAvatarUrl ? (
              <Image
                src={conversation.otherUserAvatarUrl}
                alt={conversation.otherUserName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-base font-bold text-gray-300">
                {avatarInitial}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[#e7e9ea] font-bold truncate">
              {conversation.otherUserName}
            </p>
          </div>
        </Link>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-5 h-5 text-[#71767b] animate-spin" />
          </div>
        )}

        {!initialLoaded ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-8 h-8 text-[#1d9bf0] animate-spin" />
          </div>
         ) : messages.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
             <div className="w-16 h-16 rounded-full bg-[#16181c] border border-[#2f3336] flex items-center justify-center">
               <MessageSquare className="w-8 h-8 text-[#1d9bf0]" />
             </div>
             <p className="text-[#e7e9ea] text-xl font-bold">还没有消息</p>
             <p className="text-[#71767b] text-sm">发送第一条消息，开始和 {conversation.otherUserName} 的对话吧</p>
           </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.isOwn || msg.senderId === currentUserId;
            const isOptimistic = msg.id.startsWith('optimistic_');
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-3xl break-words ${
                    isOwn
                      ? 'bg-[#1d9bf0] text-white rounded-br-md'
                      : 'bg-[#16181c] text-[#e7e9ea] rounded-bl-md border border-[#2f3336]'
                  }`}
                >
                  <p className="text-base leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                  <div
                    className={`flex items-center gap-1 mt-1 text-[11px] ${
                      isOwn ? 'justify-end text-blue-200/80' : 'text-[#71767b]'
                    }`}
                  >
                    <span>{formatTime(msg.createdAt)}</span>
                    {isOwn && !isOptimistic && (
                      <CheckCheck className="w-3.5 h-3.5 text-blue-200/80" />
                    )}
                    {isOwn && isOptimistic && (
                      <Check className="w-3.5 h-3.5 text-blue-200/80" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[#2f3336] p-3 bg-black pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[#16181c] border border-[#2f3336] rounded-2xl px-4 py-2 focus-within:border-[#1d9bf0] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              rows={1}
              className="w-full bg-transparent text-[#e7e9ea] placeholder:text-[#71767b] outline-none resize-none text-base leading-relaxed max-h-[120px]"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button
            onClick={() => { void handleSend(); }}
            disabled={!input.trim() || sending}
            className="p-3 rounded-full bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:bg-[#1d9bf0]/50 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
            data-ai-section-type="button"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
