import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  PenTool,
  MessageSquarePlus,
  Moon,
  Sun,
  Home,
  Bookmark,
  Shield,
  Video,
  Settings,
  Download,
  ArrowRight,
  Sparkles,
  Command,
} from 'lucide-react';
import { useAuth } from '@client/src/hooks/useAuth';
import { useTheme } from '@client/src/hooks/useTheme';

interface ActionItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: '快捷操作' | '页面导航' | '系统设置';
  perform: () => void;
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();

  // 监听 Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 打开时自动聚焦
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const actions: ActionItem[] = [
    {
      id: 'compose-article',
      title: '撰写长文专栏',
      subtitle: '进入多维富文本与图表创作编辑器',
      icon: <PenTool className="w-4 h-4 text-primary" />,
      category: '快捷操作',
      perform: () => navigate('/compose?tab=article'),
    },
    {
      id: 'compose-post',
      title: '发布简短想法',
      subtitle: '发表短动态与图文观点',
      icon: <MessageSquarePlus className="w-4 h-4 text-emerald-400" />,
      category: '快捷操作',
      perform: () => navigate('/compose?tab=post'),
    },
    {
      id: 'nav-home',
      title: '返回首页时间线',
      subtitle: '浏览全站最新长文与动态',
      icon: <Home className="w-4 h-4 text-blue-400" />,
      category: '页面导航',
      perform: () => navigate('/'),
    },
    {
      id: 'nav-bookmarks',
      title: '我的收藏与知识库',
      subtitle: '查看个人标记和收藏文章',
      icon: <Bookmark className="w-4 h-4 text-amber-400" />,
      category: '页面导航',
      perform: () => navigate('/my'),
    },
    {
      id: 'nav-meetings',
      title: '视频会议与协作空间',
      subtitle: '进入 WebRTC 实时音视频会议',
      icon: <Video className="w-4 h-4 text-indigo-400" />,
      category: '页面导航',
      perform: () => navigate('/meetings'),
    },
    {
      id: 'theme-toggle',
      title: `切换主题 (当前: ${resolvedTheme === 'dark' ? '深色模式' : '浅色模式'})`,
      subtitle: '一键切换高质感暗黑与明亮配色',
      icon: resolvedTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />,
      category: '系统设置',
      perform: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'nav-settings',
      title: '个人偏好与设置',
      subtitle: '配置站点个性化外观与账户信息',
      icon: <Settings className="w-4 h-4 text-muted-foreground" />,
      category: '系统设置',
      perform: () => navigate('/settings'),
    },
    ...(user?.role === 'admin'
      ? [
          {
            id: 'nav-admin',
            title: '进入系统管理控制台',
            subtitle: '站点内容审核、用户封禁与全局配置',
            icon: <Shield className="w-4 h-4 text-red-400" />,
            category: '系统设置' as const,
            perform: () => navigate('/admin'),
          },
        ]
      : []),
  ];

  const filtered = actions.filter((act) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return act.title.toLowerCase().includes(q) || (act.subtitle && act.subtitle.toLowerCase().includes(q));
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filtered[selectedIndex];
      if (current) {
        setIsOpen(false);
        current.perform();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* 右下角极简呼出按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 hidden md:flex items-center gap-2 px-3 py-2 rounded-full border border-border/80 bg-background/80 shadow-lg backdrop-blur-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all hover:scale-105"
        title="全局命令面板 (Ctrl+K)"
      >
        <Command className="w-3.5 h-3.5 text-primary" />
        <span>指令面板</span>
        <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground border border-border/40 font-mono">
          Ctrl K
        </kbd>
      </button>

      {/* 遮罩与弹窗 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-md animate-in fade-in-0"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-2xl overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* 搜索框 */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/80">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索全局命令、快速导航或快捷操作..."
                className="w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
              <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-muted text-xs text-muted-foreground border border-border/40 font-mono">
                ESC
              </kbd>
            </div>

            {/* 命令列表 */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  未匹配到相关指令，按 ESC 返回
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setIsOpen(false);
                        item.perform();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted/80 text-foreground'
                        }`}
                      >
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate leading-snug">{item.title}</div>
                        {item.subtitle && (
                          <div
                            className={`text-xs truncate leading-tight ${
                              isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      <ArrowRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isSelected ? 'translate-x-1 opacity-100' : 'opacity-0'
                        }`}
                      />
                    </button>
                  );
                })
              )}
            </div>

            {/* 底部按键提示 */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>↑↓ 导航</span>
                <span>Enter 执行</span>
              </div>
              <div className="flex items-center gap-1 font-medium text-primary">
                <Sparkles className="w-3 h-3" />
                <span>LongPost 智能指令中心</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
