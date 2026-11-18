import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Search,
  Edit3,
  FileText,
  Feather,
  LogOut,
  Bell,
  Shield,
  Mail,
  Video,
  User,
} from 'lucide-react';
import { useAuth } from '@client/src/hooks/useAuth';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import { notificationsApi, dmApi } from '@client/src/api';
import TrendingSidebar from '@client/src/components/TrendingSidebar';
import { CommandPalette } from '@client/src/components/CommandPalette/CommandPalette';
import { useWorkspaceMode } from '@client/src/hooks/useWorkspaceMode';
import { WorkspaceModeSwitcher } from '@client/src/components/WorkspaceMode/WorkspaceModeSwitcher';

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/search', label: '搜索', icon: Search },
  { to: '/notifications', label: '通知', icon: Bell, showBadge: 'notifications' as const, requireAuth: true },
  { to: '/messages', label: '私信', icon: Mail, showBadge: 'dm' as const, requireAuth: true },
  { to: '/meetings', label: '会议', icon: Video, requireAuth: true },
  { to: '/compose', label: '发布', icon: Edit3 },
  { to: '/admin', label: '管理后台', icon: Shield, requireAdmin: true },
];

const bottomNavItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/meetings', label: '会议', icon: Video, requireAuth: true },
  { to: '/search', label: '搜索', icon: Search },
  { to: '/notifications', label: '通知', icon: Bell, showBadge: 'notifications' as const, requireAuth: true },
  { to: '/messages', label: '私信', icon: Mail, showBadge: 'dm' as const, requireAuth: true },
  { to: '/compose', label: '发布', icon: Edit3 },
  { to: '/me', label: '我的', icon: User, requireAuth: true },
];

const Layout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useAuth();
  const { isLite } = useWorkspaceMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [bellAnimKey, setBellAnimKey] = useState(0);
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);

  useEffect(() => {
    if (prevUnreadRef.current === 0 && unreadCount > 0) {
      setBellAnimKey((k) => k + 1);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnread = async (): Promise<void> => {
      try {
        const response = await notificationsApi.getUnreadCount();
        setUnreadCount(response.unreadCount);
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 401) {
          logger.error('获取未读通知数失败', err);
        }
      }
    };

    void fetchUnread();
    const timer = setInterval(() => {
      void fetchUnread();
    }, 30000);

    return () => clearInterval(timer);
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || !user) {
      setDmUnreadCount(0);
      return;
    }

    const fetchDmUnread = async (): Promise<void> => {
      try {
        const response = await dmApi.getUnreadCount();
        setDmUnreadCount(response.totalUnread);
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 401) {
          logger.error('获取未读私信数失败', err);
        }
      }
    };

    void fetchDmUnread();
    const timer = setInterval(() => {
      void fetchDmUnread();
    }, 30000);

    return () => clearInterval(timer);
  }, [user, authLoading]);

  const handleComposeClick = () => navigate(user ? '/compose' : '/login');

  const handleUserClick = () => {
    if (!user) navigate('/login');
    else setMenuOpen((prev) => !prev);
  };

  const handleLogout = () => {
    try { logout(); setMenuOpen(false); navigate('/'); }
    catch (err) { logger.error('退出登录失败', err); }
  };

  const emailPrefix = user?.email ? user.email.split('@')[0] : '';
  const avatarInitial = user?.nickname?.charAt(0)?.toUpperCase() ?? '?';

  const getBadgeCount = (item: { showBadge?: 'notifications' | 'dm' }) => {
    if (item.showBadge === 'dm') return dmUnreadCount;
    if (item.showBadge === 'notifications') return unreadCount;
    return 0;
  };

  const renderSidebarNav = () => (
    <nav className="mt-2 flex flex-col gap-1" aria-label="主导航">
      {navItems
        .filter((item) => {
          if (item.requireAdmin && user?.role !== 'admin') return false;
          return true;
        })
        .map((item) => {
        const Icon = item.icon;
        const badgeCount = getBadgeCount(item);
        const showBadge = Boolean(item.showBadge) && user && badgeCount > 0;
        const badgeText = badgeCount > 99 ? '99+' : String(badgeCount);
        const isBell = item.showBadge === 'notifications';
        const to = item.requireAuth && !user ? '/login' : item.to;
        return (
          <NavLink
            key={item.to}
            to={to}
            end={item.to === '/'}
            className={({ isActive }) =>
              isLite
                ? `flex items-center gap-4 px-4 py-2.5 rounded-2xl transition-all duration-200 relative ${
                    isActive && (user || !item.requireAuth)
                      ? 'bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/85 font-normal'
                  }`
                : `flex items-center gap-4 px-5 py-3 rounded-full transition-colors relative ${
                    isActive && (user || !item.requireAuth)
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'hover:bg-muted/70 text-foreground font-normal'
                  }`
            }
          >
             <div className="relative">
                 {isBell && showBadge ? (
                   <motion.div
                     key={bellAnimKey}
                     initial={{ rotate: 0 }}
                     animate={{
                       rotate: [0, -12, 10, -8, 6, 0],
                     }}
                     transition={{
                       duration: 1.2,
                       ease: 'easeInOut',
                       times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                     }}
                     style={{ transformOrigin: 'top center' }}
                   >
                     <Icon className="w-6 h-6" />
                   </motion.div>
                 ) : (
                   <Icon className="w-6 h-6" />
                 )}
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold leading-none animate-badge-pulse">
                    {badgeText}
                  </span>
                )}
              </div>
             <span className="text-base tracking-normal">{item.label}</span>
           </NavLink>
          );
        })}
     </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <div className={`mx-auto flex transition-all duration-300 ${
        isLite ? 'max-w-[880px] justify-center px-4 md:px-8' : 'max-w-[1290px]'
      }`}>
        {/* Apple 极简模式 (isLite)：隐藏桌面侧边栏与信息流侧栏，正文大留白居中，由底部的 Apple Dock 掌管全局导航；Google 专业模式 (isPro)：显示标准的 M3 侧抽屉栏 */}
        {!isLite && (
          <aside className="hidden md:flex w-[275px] h-screen sticky top-0 flex-col px-3 py-2 border-r border-gray-200 dark:border-gray-800 transition-colors duration-300">
            <div className="flex items-center justify-between px-2 py-3">
              <NavLink to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" aria-label="LongPost 首页">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Feather className="w-5 h-5" /></span>
                <span className="text-xl font-bold tracking-tight">LongPost</span>
              </NavLink>
            </div>

            <div className="px-2 py-1 mb-2">
              <WorkspaceModeSwitcher compact />
            </div>

            {renderSidebarNav()}

            <button
              onClick={handleComposeClick}
              className="mt-4 bg-primary text-primary-foreground font-semibold py-3 px-8 transition-opacity hover:opacity-90 rounded-xl w-full"
              data-ai-section-type="button"
            >发布</button>

            <div className="mt-auto pb-4 relative pb-[env(safe-area-inset-bottom)]" ref={menuRef}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted text-left transition-colors"
                onClick={handleUserClick}
                aria-expanded={user ? menuOpen : undefined}
              >
                {user ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {user.avatarUrl ? (
                        <Image src={user.avatarUrl} alt={user.nickname} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base font-bold text-gray-300">{avatarInitial}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{user.nickname}</p>
                      <p className="text-sm text-gray-500 truncate">@{emailPrefix}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">登录 / 注册</p>
                      <p className="text-sm text-gray-500 truncate">点击登录你的账号</p>
                    </div>
                  </>
                )}
              </button>

              {user && menuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/me'); }}
                    className="w-full px-4 py-3 text-left text-sm text-popover-foreground hover:bg-muted transition-colors flex items-center gap-3"
                    data-ai-section-type="button"
                  >
                    <FileText className="w-4 h-4" />我的内容
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                    className="w-full px-4 py-3 text-left text-sm text-popover-foreground hover:bg-muted transition-colors flex items-center gap-3"
                    data-ai-section-type="button"
                  >
                    <FileText className="w-4 h-4" />设置
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                      className="w-full px-4 py-3 text-left text-sm text-primary hover:bg-muted transition-colors flex items-center gap-3 border-t border-border"
                      data-ai-section-type="button"
                    >
                      <Shield className="w-4 h-4" />管理后台
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-3 text-left text-sm text-destructive hover:bg-muted transition-colors flex items-center gap-3 border-t border-border"
                    data-ai-section-type="button"
                  >
                    <LogOut className="w-4 h-4" />退出登录
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}

        <main className={`flex-1 min-w-0 min-h-screen relative pb-[calc(56px+var(--safe-area-inset-bottom))] px-safe md:px-0 ${
          isLite ? 'md:pb-28' : 'md:pb-0 border-r border-border'
        }`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {!isLite && (
          <div className="w-[350px] h-screen sticky top-0 p-4 hidden xl:block space-y-4">
            <TrendingSidebar />
            <div className="bg-card rounded-2xl p-4 border border-border">
              <h3 className="text-base font-semibold mb-3 text-card-foreground">关于 LongPost</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">记录想法，发布长文，与更多人分享值得读的内容。</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="主导航"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl md:hidden px-safe transition-colors"
        style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-14 relative overflow-x-auto scrollbar-hide">
          {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const badgeCount = user ? getBadgeCount(item) : 0;
              const showBadge = Boolean(item.showBadge) && user && badgeCount > 0;
              const badgeText = badgeCount > 99 ? '99+' : String(badgeCount);
              const to = item.requireAuth && !user ? '/login' : item.to;
              return (
                <NavLink
                  key={item.to}
                  to={to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center flex-1 min-w-[44px] max-w-[56px] h-14 relative flex-shrink-0 touch-manipulation select-none active:scale-95 transition-all ${
                      isActive
                        ? 'text-primary font-semibold'
                        : 'text-muted-foreground'
                    }`
                  }
                >
                  <div className="relative">
                    <Icon className="w-6 h-6" />
                    {showBadge && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold leading-none">
                        {badgeText}
                      </span>
                    )}
                  </div>
                <span className="text-[10px] mt-0.5 truncate max-w-full">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* 🍏 Apple 模式专享：macOS / iPadOS 悬浮灵动胶囊 Dock (桌面端) */}
      {isLite && (
        <motion.nav
          aria-label="主导航"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 apple-dock px-5 py-2.5 hidden md:flex items-center gap-5"
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `p-2 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 ${
                isActive ? 'text-blue-500 bg-blue-500/10' : 'text-foreground/75 hover:text-foreground'
              }`
            }
            title="首页"
          >
            <Home className="w-5 h-5" />
          </NavLink>
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `p-2 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 ${
                isActive ? 'text-blue-500 bg-blue-500/10' : 'text-foreground/75 hover:text-foreground'
              }`
            }
            title="搜索"
          >
            <Search className="w-5 h-5" />
          </NavLink>
          <button
            onClick={handleComposeClick}
            className="p-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all duration-150 hover:scale-110 active:scale-95"
            title="撰写新内容"
          >
            <Edit3 className="w-5 h-5" />
          </button>
          <NavLink
            to={user ? '/notifications' : '/login'}
            className={({ isActive }) =>
              `p-2 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 relative ${
                isActive ? 'text-blue-500 bg-blue-500/10' : 'text-foreground/75 hover:text-foreground'
              }`
            }
            title="通知"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </NavLink>
          <NavLink
            to={user ? '/messages' : '/login'}
            className={({ isActive }) =>
              `p-2 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 relative ${
                isActive ? 'text-blue-500 bg-blue-500/10' : 'text-foreground/75 hover:text-foreground'
              }`
            }
            title="私信"
          >
            <Mail className="w-5 h-5" />
            {dmUnreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </NavLink>
          <div className="w-[1px] h-5 bg-border/60 mx-1" />
          {user ? (
            <NavLink
              to="/me"
              className={({ isActive }) =>
                `p-1 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 flex items-center justify-center ${
                  isActive ? 'ring-2 ring-blue-500' : ''
                }`
              }
              title={`我的账号 (@${user.nickname})`}
            >
              <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                {user.avatarUrl ? (
                  <Image src={user.avatarUrl} alt={user.nickname} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-gray-300">{avatarInitial}</span>
                )}
              </div>
            </NavLink>
          ) : (
            <NavLink
              to="/login"
              className="text-xs px-2.5 py-1 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-600/20 transition-colors"
            >
              登录
            </NavLink>
          )}
          <WorkspaceModeSwitcher compact />
        </motion.nav>
      )}

      {/* Global Command Palette */}
      <CommandPalette />
    </div>
  );
};

export default Layout;
