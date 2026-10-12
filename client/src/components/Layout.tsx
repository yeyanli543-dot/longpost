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
  Plus,
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
  const { isLite, isPro } = useWorkspaceMode();
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
    <nav className="mt-2 flex flex-col gap-1">
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
              `flex items-center gap-4 px-4 py-3 rounded-full transition-colors hover:bg-gray-900 w-fit relative ${
                isActive && user ? 'font-bold' : 'font-normal'
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
                     <Icon className="w-7 h-7" />
                   </motion.div>
                 ) : (
                   <Icon className="w-7 h-7" />
                 )}
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold leading-none animate-badge-pulse">
                    {badgeText}
                  </span>
                )}
              </div>
             <span className="text-xl">{item.label}</span>
           </NavLink>
          );
        })}
     </nav>
  );

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isLite
        ? 'bg-[#fbfbfd] text-[#1d1d1f] dark:bg-black dark:text-[#f5f5f7]'
        : 'bg-[#f8fafd] text-[#1f1f1f] dark:bg-[#131314] dark:text-[#e3e3e3]'
    }`}>
      <div className="max-w-[1290px] mx-auto flex">
        <aside className={`hidden md:flex w-[275px] h-screen sticky top-0 flex-col px-3 py-2 border-r transition-colors duration-300 ${
          isLite ? 'border-zinc-200/60 dark:border-zinc-900' : 'border-gray-200 dark:border-gray-800'
        }`}>
          <div className="flex items-center justify-between px-2 py-3">
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/')}
            >
              <Feather className="w-7 h-7 text-blue-500" />
              <span className="text-xl font-bold tracking-tight">LongPost</span>
            </div>
          </div>

          <div className="px-2 py-1 mb-2">
            <WorkspaceModeSwitcher compact />
          </div>

          {renderSidebarNav()}

          <button
            onClick={handleComposeClick}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-full w-full transition-all duration-150 hover:scale-[1.02] active:scale-95"
            data-ai-section-type="button"
          >发布</button>

          <div className="mt-auto pb-4 relative pb-[env(safe-area-inset-bottom)]" ref={menuRef}>
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-full hover:bg-gray-900 cursor-pointer transition-colors"
              onClick={handleUserClick}
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
            </div>

            {user && menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-gray-900 border border-gray-800 rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); navigate('/me'); }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-100 hover:bg-gray-800 transition-colors flex items-center gap-3"
                  data-ai-section-type="button"
                >
                  <FileText className="w-4 h-4" />我的内容
                </button>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-100 hover:bg-gray-800 transition-colors flex items-center gap-3"
                  data-ai-section-type="button"
                >
                  <FileText className="w-4 h-4" />设置
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                    className="w-full px-4 py-3 text-left text-sm text-blue-400 hover:bg-gray-800 transition-colors flex items-center gap-3 border-t border-gray-800"
                    data-ai-section-type="button"
                  >
                    <Shield className="w-4 h-4" />管理后台
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-gray-800 transition-colors flex items-center gap-3 border-t border-gray-800"
                  data-ai-section-type="button"
                >
                  <LogOut className="w-4 h-4" />退出登录
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 border-r border-gray-800 min-h-screen relative pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
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

        <div className="w-[350px] h-screen sticky top-0 p-4 hidden xl:block space-y-4">
          <TrendingSidebar />
          <div className="bg-[#16181c] rounded-2xl p-4 border border-[#2f3336]">
            <h3 className="text-xl font-bold mb-3 text-[#e7e9ea]">关于 LongPost</h3>
            <p className="text-sm text-[#71767b] leading-relaxed">长文发布平台。短帖引流，长文阅读。像 X 一样发帖，也可以写完整长文，通过链接跳转阅读。</p>
          </div>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur border-t border-[#2f3336] md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
                    `flex flex-col items-center justify-center flex-1 min-w-[44px] max-w-[56px] h-14 relative flex-shrink-0 ${
                      isActive ? 'text-[#1d9bf0]' : 'text-[#71767b]'
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

      {/* Mobile FAB button */}
      <button
        onClick={handleComposeClick}
        className="fixed right-4 z-40 w-14 h-14 rounded-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white shadow-lg flex items-center justify-center transition-all active:scale-95 md:hidden"
        style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
        aria-label="发布"
        data-ai-section-type="button"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Global Command Palette */}
      <CommandPalette />
    </div>
  );
};

export default Layout;
