import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { installAuthInterceptor } from './api/interceptor';
import { AuthProvider } from './hooks/useAuth';
import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';

/**
 * 路由级代码分割（Route-level Code Splitting）
 *
 * 原先 20 多个页面全部静态 import，首屏要一口气下载 2.7MB 的单一 bundle
 * （含编辑器、图表、会议、后台等只在特定页面用到的代码），
 * 移动端首次打开体验很差。改成 React.lazy 之后，每个页面各自成 chunk，
 * 首屏只需要 Layout + 当前页。
 */
const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const ArticlePage = lazy(() => import('./pages/ArticlePage/ArticlePage'));
const ComposePage = lazy(() => import('./pages/ComposePage/ComposePage'));
const SearchPage = lazy(() => import('./pages/SearchPage/SearchPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage/RegisterPage'));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage/OAuthCallbackPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage/TermsPage'));
const MyPage = lazy(() => import('./pages/MyPage/MyPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage/UserProfilePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage/NotificationsPage'));
const HashtagPage = lazy(() => import('./pages/HashtagPage/HashtagPage'));
const FollowListPage = lazy(() => import('./pages/FollowListPage/FollowListPage'));
const AdminPage = lazy(() => import('./pages/AdminPage/AdminPage'));
const AccessCodesPage = lazy(() => import('./pages/AccessCodesPage/AccessCodesPage'));
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'));
const MeetingsPage = lazy(() => import('./pages/meetings/MeetingsPage'));
const MeetingDetailPage = lazy(() => import('./pages/meetings/MeetingDetailPage'));
const MeetingRoomPage = lazy(() => import('./pages/meetings/MeetingRoomPage'));

installAuthInterceptor();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', window.location.origin + window.location.pathname).href;
    navigator.serviceWorker.register(swUrl).catch(() => {});
  });
}

/** 页面切换时的轻量占位，避免白屏闪烁 */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40" />
        <span className="text-xs opacity-50">加载中…</span>
      </div>
    </div>
  );
}

const RoutesComponent = () => {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="article/:id" element={<ArticlePage />} />
            <Route path="p/:slug" element={<ArticlePage />} />
            <Route path="compose" element={<ComposePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="me" element={<MyPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="user/:id" element={<UserProfilePage />} />
            <Route path="user/:id/followers" element={<FollowListPage />} />
            <Route path="user/:id/following" element={<FollowListPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="hashtag/:tag" element={<HashtagPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="meetings/:id" element={<MeetingDetailPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/access-codes" element={<AccessCodesPage />} />
          </Route>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="meetings/:id/room" element={<MeetingRoomPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
};

export default RoutesComponent;
