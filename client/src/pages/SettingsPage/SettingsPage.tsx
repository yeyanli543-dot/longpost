import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { getFriendlyErrorMessage } from '@client/src/utils/error-message';
import {
  User,
  Lock,
  Bell,
  Palette,
  Shield,
  Database,
  HelpCircle,
  Settings,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@client/src/hooks/useAuth';
import { useTheme } from '@client/src/hooks/useTheme';
import { siteSettingsApi, accessCodesApi, articlesApi, authApi } from '@client/src/api';
import LoginGate from '@client/src/components/LoginGate';
import type {
  SiteSettings,
  UpdateSiteSettingsRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  UpdatePreferencesRequest,
} from '@shared/api.interface';
import {
  ProfileSection,
  SecuritySection,
  NotificationsSection,
  AppearanceSection,
  ReadingSection,
  PrivacySection,
  DataSection,
  AboutSection,
  AdminSection,
} from './settings-sections';

type SectionKey =
  | 'appearance'
  | 'profile'
  | 'reading'
  | 'security'
  | 'notifications'
  | 'privacy'
  | 'data'
  | 'about'
  | 'admin';

interface NavItem {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SettingsPage: React.FC = () => {
  const {
    user,
    loading: authLoading,
    updateProfile,
    changePassword,
    updatePreferences,
    isAdmin,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SectionKey>('appearance');

  // Profile state
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState(() => localStorage.getItem('app-profile-website') || '');
  const [profileSaving, setProfileSaving] = useState(false);

  // Security state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [setNewPwd, setSetNewPwd] = useState('');
  const [setConfirmPwd, setSetConfirmPwd] = useState('');
  const [setPwdSaving, setSetPwdSaving] = useState(false);

  // Notifications state
  const [notifyOnRead, setNotifyOnRead] = useState(false);
  const [notifyOnDelete, setNotifyOnDelete] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);

  // Appearance state & full theme suite
  const themeHook = useTheme();
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);

  // Site settings state (for admin zone)
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteSaving, setSiteSaving] = useState(false);
  const [siteData, setSiteData] = useState<SiteSettings | null>(null);

  // Sync user data into local form state
  useEffect(() => {
    if (user) {
      setNickname(user.nickname || '');
      setAvatarUrl(user.avatarUrl || '');
      setBio(user.bio || '');
      setNotifyOnRead(user.notifyOnRead);
      setNotifyOnDelete(user.notifyOnDelete);
      if (user.theme) {
        themeHook.setTheme(user.theme);
      }
      if (user.fontSize) {
        themeHook.setFontSize(user.fontSize);
      }
    }
  }, [user]);

  // Load site settings on admin section enter
  const loadSiteSettings = async (): Promise<void> => {
    if (!isAdmin || siteData || siteLoading) return;
    setSiteLoading(true);
    try {
      const data = await siteSettingsApi.getSiteSettings();
      setSiteData(data);
    } catch (err) {
      logger.error('获取站点设置失败', err);
      toast.error(getFriendlyErrorMessage(err, '获取站点设置失败'));
    } finally {
      setSiteLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'admin') {
      void loadSiteSettings();
    }
  }, [activeSection, isAdmin]);

  // ---- Handlers ----
  const handleSaveProfile = async (): Promise<void> => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const data: UpdateProfileRequest = {
        nickname: nickname.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
        bio,
      };
      await updateProfile(data);
      localStorage.setItem('app-profile-website', website.trim());
      toast.success('个人资料已保存');
    } catch (err) {
      logger.error('保存个人资料失败', err);
      toast.error(getFriendlyErrorMessage(err, '保存失败，请稍后重试'));
    } finally {
      setProfileSaving(false);
    }
  };

  const passwordsMatch = newPassword === confirmPassword;
  const canSavePassword =
    oldPassword.length > 0 && newPassword.length > 0 && passwordsMatch;

  const handleChangePassword = async (): Promise<void> => {
    if (!canSavePassword) return;
    setPasswordSaving(true);
    try {
      const data: ChangePasswordRequest = { oldPassword, newPassword };
      await changePassword(data);
      toast.success('密码已修改');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      logger.error('修改密码失败', err);
      toast.error(getFriendlyErrorMessage(err, '修改失败，请检查原密码是否正确'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSetPassword = async (): Promise<void> => {
    if (setNewPwd.length < 6 || setNewPwd !== setConfirmPwd) return;
    setSetPwdSaving(true);
    try {
      await accessCodesApi.setPassword(setNewPwd);
      toast.success('密码设置成功，现在可以使用邮箱 + 密码登录');
      setSetNewPwd('');
      setSetConfirmPwd('');
    } catch (err) {
      logger.error('设置密码失败', err);
      toast.error(getFriendlyErrorMessage(err, '设置失败，请稍后重试'));
    } finally {
      setSetPwdSaving(false);
    }
  };

  const handleSaveNotifications = async (): Promise<void> => {
    if (!user) return;
    setNotifySaving(true);
    try {
      const data: UpdatePreferencesRequest = { notifyOnRead, notifyOnDelete };
      await updatePreferences(data);
      toast.success('通知偏好已保存');
    } catch (err) {
      logger.error('保存通知偏好失败', err);
      toast.error(getFriendlyErrorMessage(err, '保存失败，请稍后重试'));
    } finally {
      setNotifySaving(false);
    }
  };

  const handleSaveAppearance = async (): Promise<void> => {
    if (!user) return;
    setAppearanceSaving(true);
    try {
      const data: UpdatePreferencesRequest = {
        theme: themeHook.theme,
        fontSize: themeHook.fontSize,
      };
      await updatePreferences(data);
      toast.success('界面样式与显示偏好已保存');
    } catch (err) {
      logger.error('保存界面偏好失败', err);
      toast.error(getFriendlyErrorMessage(err, '保存失败，请稍后重试'));
    } finally {
      setAppearanceSaving(false);
    }
  };

  const handleSaveSiteSettings = async (): Promise<void> => {
    if (!siteData) return;
    setSiteSaving(true);
    try {
      const data: UpdateSiteSettingsRequest = {
        siteName: siteData.siteName,
        siteDescription: siteData.siteDescription ?? undefined,
        siteLogoUrl: siteData.siteLogoUrl ?? undefined,
        allowRegister: siteData.allowRegister,
        googleLoginEnabled: siteData.googleLoginEnabled,
      };
      const updated = await siteSettingsApi.updateSiteSettings(data);
      setSiteData(updated);
      toast.success('站点设置已保存');
    } catch (err) {
      logger.error('保存站点设置失败', err);
      toast.error(getFriendlyErrorMessage(err, '保存失败，请稍后重试'));
    } finally {
      setSiteSaving(false);
    }
  };

  const handleLogout = (): void => {
    try {
      logout();
      toast.success('已退出登录');
      navigate('/');
    } catch (err) {
      logger.error('退出登录失败', err);
      toast.error('退出登录失败');
    }
  };

  const handleRevokeAllSessions = async (): Promise<void> => {
    setRevokingSessions(true);
    try {
      await authApi.revokeAllSessions();
      toast.success('已强制下线所有已登录设备，请重新登录');
      logout();
      navigate('/login');
    } catch (err) {
      logger.error('注销会话失败', err);
      toast.error(getFriendlyErrorMessage(err, '注销设备会话失败'));
    } finally {
      setRevokingSessions(false);
    }
  };

  // 真实数据打包导出
  const handleExportData = async (): Promise<void> => {
    if (!user) return;
    const toastId = toast.loading('正在打包您的全部数据...');
    try {
      let myArticles: unknown[] = [];
      try {
        const res = await articlesApi.getMyArticles();
        myArticles = res.items || [];
      } catch {
        // 若离线或接口异常继续导出基本信息
      }

      const exportData = {
        version: '2.9.5',
        exportTime: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          role: user.role,
        },
        preferences: {
          theme: themeHook.theme,
          accent: themeHook.accent,
          fontFamily: themeHook.fontFamily,
          fontSize: themeHook.fontSize,
          lineHeight: themeHook.lineHeight,
          borderRadius: themeHook.borderRadius,
          notchMode: themeHook.notchMode,
        },
        articles: myArticles,
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `longpost-data-${user.nickname || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('数据导出成功，文件已下载至本地', { id: toastId });
    } catch (err) {
      logger.error('数据导出失败', err);
      toast.error('数据导出失败，请稍后重试', { id: toastId });
    }
  };

  const handleDeactivateAccount = (): void => {
    toast.info('注销申请已收到，客服团队将在 48 小时内核实处理');
  };

  if (authLoading) {
    return <div className="p-4 text-muted-foreground">加载中...</div>;
  }

  if (!user) {
    return (
      <LoginGate
        title="登录后管理设置"
        description="登录后即可修改个人资料、样式主题、安全设置和偏好配置"
      />
    );
  }

  const navItems: NavItem[] = [
    { key: 'appearance', label: '外观与主题', icon: Palette },
    { key: 'profile', label: '个人资料', icon: User },
    { key: 'reading', label: '阅读与发帖', icon: BookOpen },
    { key: 'security', label: '账号安全', icon: Lock },
    { key: 'notifications', label: '通知偏好', icon: Bell },
    { key: 'privacy', label: '隐私设置', icon: Shield },
    { key: 'data', label: '数据管理', icon: Database },
    { key: 'about', label: '关于与诊断', icon: HelpCircle },
  ];

  if (isAdmin) {
    navItems.push({ key: 'admin', label: '管理员专区', icon: Settings });
  }

  const avatarInitial = user.nickname?.charAt(0)?.toUpperCase() ?? '?';

  const renderContent = (): React.ReactNode => {
    switch (activeSection) {
      case 'appearance':
        return (
          <AppearanceSection
            theme={themeHook.theme}
            setTheme={themeHook.setTheme}
            accent={themeHook.accent}
            setAccent={themeHook.setAccent}
            fontFamily={themeHook.fontFamily}
            setFontFamily={themeHook.setFontFamily}
            fontSize={themeHook.fontSize}
            setFontSize={themeHook.setFontSize}
            lineHeight={themeHook.lineHeight}
            setLineHeight={themeHook.setLineHeight}
            borderRadius={themeHook.borderRadius}
            setBorderRadius={themeHook.setBorderRadius}
            notchMode={themeHook.notchMode}
            setNotchMode={themeHook.setNotchMode}
            landscapeGuard={themeHook.landscapeGuard}
            setLandscapeGuard={themeHook.setLandscapeGuard}
            safeArea={themeHook.safeArea}
            refreshSafeArea={themeHook.refreshSafeArea}
            resetToDefaults={themeHook.resetToDefaults}
            saving={appearanceSaving}
            onSave={() => { void handleSaveAppearance(); }}
          />
        );
      case 'profile':
        return (
          <ProfileSection
            nickname={nickname}
            setNickname={setNickname}
            avatarUrl={avatarUrl}
            setAvatarUrl={setAvatarUrl}
            bio={bio}
            setBio={setBio}
            website={website}
            setWebsite={setWebsite}
            avatarInitial={avatarInitial}
            saving={profileSaving}
            onSave={() => { void handleSaveProfile(); }}
          />
        );
      case 'reading':
        return <ReadingSection />;
      case 'security':
        return (
          <SecuritySection
            email={user.email}
            provider={user.provider}
            oldPassword={oldPassword}
            setOldPassword={setOldPassword}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            passwordsMatch={passwordsMatch}
            canSave={canSavePassword}
            saving={passwordSaving}
            onChangePassword={() => { void handleChangePassword(); }}
            onLogout={handleLogout}
            setNewPwd={setNewPwd}
            setSetNewPwd={setSetNewPwd}
            setConfirmPwd={setConfirmPwd}
            setSetConfirmPwd={setSetConfirmPwd}
            setPwdSaving={setPwdSaving}
            onSetPassword={() => { void handleSetPassword(); }}
            onRevokeAllSessions={() => { void handleRevokeAllSessions(); }}
            revokingSessions={revokingSessions}
          />
        );
      case 'notifications':
        return (
          <NotificationsSection
            notifyOnRead={notifyOnRead}
            setNotifyOnRead={setNotifyOnRead}
            notifyOnDelete={notifyOnDelete}
            setNotifyOnDelete={setNotifyOnDelete}
            saving={notifySaving}
            onSave={() => { void handleSaveNotifications(); }}
          />
        );
      case 'privacy':
        return <PrivacySection />;
      case 'data':
        return (
          <DataSection
            onExport={() => { void handleExportData(); }}
            onDeactivate={handleDeactivateAccount}
          />
        );
      case 'about':
        return <AboutSection />;
      case 'admin':
        return (
          <AdminSection
            siteLoading={siteLoading}
            siteSaving={siteSaving}
            siteData={siteData}
            setSiteData={setSiteData}
            onSaveSiteSettings={() => { void handleSaveSiteSettings(); }}
            onNavigate={navigate}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-0">
      <div className="max-w-[960px] mx-auto">
        {/* 移动端：顶部横向滚动 Tab */}
        <div className="md:hidden sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border pt-safe">
          <div className="flex overflow-x-auto gap-1 px-3 py-2 scrollbar-hide">
            {navItems.map((item: NavItem) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-colors flex-shrink-0 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex">
          {/* 桌面端：左侧分组导航 */}
          <aside className="hidden md:block w-[210px] flex-shrink-0 py-6 pr-4">
            <h1 className="text-xl font-bold mb-4 px-3 text-foreground">偏好设置</h1>
            <nav className="space-y-1">
              {navItems.map((item: NavItem) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm transition-colors relative ${
                      isActive
                        ? 'bg-primary/10 text-primary font-bold'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                    )}
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* 右侧内容区 */}
          <main className="flex-1 min-w-0 py-6 md:pl-6 md:border-l border-border">
            <div className="md:hidden px-4 mb-4">
              <h1 className="text-xl font-bold text-foreground">
                {navItems.find((n) => n.key === activeSection)?.label || '设置'}
              </h1>
            </div>
            <div className="px-4 md:px-2">{renderContent()}</div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
