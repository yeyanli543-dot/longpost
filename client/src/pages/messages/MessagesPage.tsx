import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquarePlus, Trash2, LogIn, Loader2 } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { useAuth } from '@client/src/hooks/useAuth';
import { Image } from '@client/src/components/ui/image';
import { dmApi } from '@client/src/api';
import ChatWindow from './ChatWindow';
import NewMessageModal from './NewMessageModal';
import type { DMConversation } from '@shared/api.interface';
import { showConfirm } from '@lark-apaas/client-toolkit';

const POLL_INTERVAL = 15000;

const MessagesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const response = await dmApi.getConversations();
      setConversations(response.items);
    } catch (error) {
      logger.error('加载会话列表失败', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void loadConversations();
    const timer = setInterval(() => {
      void loadConversations();
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [user, loadConversations]);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    if (isMobile) {
      setShowMobileChat(true);
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    id: string,
  ) => {
    e.stopPropagation();
    if (!await showConfirm('确定要删除这个会话吗？')) return;
    setDeletingId(id);
    try {
      await dmApi.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setShowMobileChat(false);
      }
    } catch (error) {
      logger.error('删除会话失败', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleNewMessageSelect = (_userId: string, conversationId: string) => {
    setSelectedId(conversationId);
    if (isMobile) {
      setShowMobileChat(true);
    }
    void loadConversations();
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay) {
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    }
    if (diff < 7 * oneDay) {
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      return `周${days[d.getDay()]}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <LogIn className="w-12 h-12 text-[#2f3336] mb-4" />
        <h2 className="text-2xl font-bold text-[#e7e9ea] mb-2">登录后查看私信</h2>
        <p className="text-[#71767b] mb-6">登录后即可与其他用户发送私信</p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold rounded-full transition-colors"
          data-ai-section-type="button"
        >
          登录
        </button>
      </div>
    );
  }

  const showChatDesktop = !isMobile && selectedConversation;
  const showChatMobile = isMobile && showMobileChat && selectedConversation;

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] md:flex-row">
      <div className={`flex flex-col ${showChatDesktop ? 'w-[340px] flex-shrink-0 border-r border-[#2f3336]' : 'w-full'} ${isMobile && showMobileChat ? 'hidden' : 'flex'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336] sticky top-0 bg-black/80 backdrop-blur z-10 md:static md:bg-transparent md:backdrop-blur-0">
            <h1 className="text-xl font-bold text-[#e7e9ea]">私信</h1>
            <button
              onClick={() => setShowNewMessage(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-[#1d9bf0]"
              data-ai-section-type="button"
              title="新私信"
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pb-[env(safe-area-inset-bottom)]">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 text-[#1d9bf0] animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <MessageSquarePlus className="w-12 h-12 text-[#2f3336] mb-4" />
                <h2 className="text-xl font-bold text-[#e7e9ea] mb-2">暂无对话</h2>
                <p className="text-[#71767b] text-sm mb-6">
                  点击右上角按钮，向其他用户发送第一条私信
                </p>
                <button
                  onClick={() => setShowNewMessage(true)}
                  className="px-6 py-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold rounded-full transition-colors"
                  data-ai-section-type="button"
                >
                  发起私信
                </button>
              </div>
            ) : (
              <div data-ai-section-type="card-list">
                {conversations.map((conv) => {
                  const isSelected = selectedId === conv.id;
                  const avatarInitial = conv.otherUserName
                    ? conv.otherUserName.charAt(0).toUpperCase()
                    : '?';
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[#2f3336] ${
                        isSelected
                          ? 'bg-[#16181c]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {conv.otherUserAvatarUrl ? (
                          <Image
                            src={conv.otherUserAvatarUrl}
                            alt={conv.otherUserName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-gray-300">
                            {avatarInitial}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`font-bold truncate ${
                              conv.unreadCount > 0
                                ? 'text-[#e7e9ea]'
                                : 'text-[#e7e9ea]'
                            }`}
                          >
                            {conv.otherUserName}
                          </p>
                          <span className="text-xs text-[#71767b] flex-shrink-0">
                            {formatTime(conv.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p
                            className={`text-sm truncate ${
                              conv.unreadCount > 0
                                ? 'text-[#e7e9ea] font-semibold'
                                : 'text-[#71767b]'
                            }`}
                          >
                            {conv.lastMessage || '暂无消息'}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {conv.unreadCount > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1.5 bg-[#1d9bf0] rounded-full text-[11px] font-bold text-white flex items-center justify-center">
                                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                void handleDeleteConversation(e, conv.id);
                              }}
                              className="p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-[#71767b] hover:text-red-400 transition-all"
                              data-ai-section-type="button"
                              title="删除会话"
                              disabled={deletingId === conv.id}
                            >
                              {deletingId === conv.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>

      {showChatDesktop && selectedConversation && (
        <div className="flex-1 min-w-0 min-h-0">
          <ChatWindow
            conversation={selectedConversation}
            currentUserId={user.id}
            isMobile={false}
            onBack={() => setShowMobileChat(false)}
          />
        </div>
      )}

      {showChatMobile && selectedConversation && (
        <div className="fixed inset-0 z-20 bg-black">
          <ChatWindow
            conversation={selectedConversation}
            currentUserId={user.id}
            isMobile={true}
            onBack={() => setShowMobileChat(false)}
          />
        </div>
      )}

      {!isMobile && !selectedConversation && (
        <div className="hidden md:flex flex-1 items-center justify-center text-center">
          <div className="px-8">
            <MessageSquarePlus className="w-12 h-12 text-[#2f3336] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[#e7e9ea] mb-2">选择一个对话</h2>
            <p className="text-[#71767b] text-sm">
              从左侧选择一个会话，或点击「新私信」开始新的对话
            </p>
          </div>
        </div>
      )}

      <NewMessageModal
        open={showNewMessage}
        onClose={() => setShowNewMessage(false)}
        onSelect={handleNewMessageSelect}
      />
    </div>
  );
};

export default MessagesPage;
