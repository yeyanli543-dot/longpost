import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { installAuthInterceptor } from './api/interceptor';
import { AuthProvider } from './hooks/useAuth';
import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import HomePage from './pages/HomePage/HomePage';
import ArticlePage from './pages/ArticlePage/ArticlePage';
import ComposePage from './pages/ComposePage/ComposePage';
import SearchPage from './pages/SearchPage/SearchPage';
import LoginPage from './pages/LoginPage/LoginPage';
import RegisterPage from './pages/RegisterPage/RegisterPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage/OAuthCallbackPage';
import PrivacyPage from './pages/PrivacyPage/PrivacyPage';
import TermsPage from './pages/TermsPage/TermsPage';
import MyPage from './pages/MyPage/MyPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import UserProfilePage from './pages/UserProfilePage/UserProfilePage';
import NotificationsPage from './pages/NotificationsPage/NotificationsPage';
import HashtagPage from './pages/HashtagPage/HashtagPage';
import FollowListPage from './pages/FollowListPage/FollowListPage';
import AdminPage from './pages/AdminPage/AdminPage';
import AccessCodesPage from './pages/AccessCodesPage/AccessCodesPage';
import MessagesPage from './pages/messages/MessagesPage';
import { MeetingsPage, MeetingDetailPage, MeetingRoomPage } from './pages/meetings';

installAuthInterceptor();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', window.location.origin + window.location.pathname).href;
    navigator.serviceWorker.register(swUrl).catch(() => {});
  });
}

const RoutesComponent = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route
          element={<Layout />}
        >
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
        <Route
          path="meetings/:id/room"
          element={<MeetingRoomPage />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
};

export default RoutesComponent;
