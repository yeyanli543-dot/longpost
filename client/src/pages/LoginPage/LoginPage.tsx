import { useState, type FormEvent, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Feather, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@client/src/hooks/useAuth';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';
import { Label } from '@client/src/components/ui/label';
import { getGoogleAuthUrl } from '@client/src/api/auth';
import { siteSettingsApi } from '@client/src/api';
import type { SiteSettings } from '@shared/api.interface';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPageContent: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<'code' | 'email' | 'google'>('code');
  const [accessCode, setAccessCode] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [codeSubmitting, setCodeSubmitting] = useState(false);

  const { login, loginWithCode, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, from]);

  useEffect(() => {
    let cancelled = false;
    siteSettingsApi.getSiteSettings()
      .then((settings) => {
        if (!cancelled) setSiteSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setSiteSettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const validate = (): boolean => {
    const nextErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      nextErrors.email = '请输入邮箱';
    } else if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = '邮箱格式不正确';
    }

    if (!password) {
      nextErrors.password = '请输入密码';
    } else if (password.length < 6) {
      nextErrors.password = '密码至少 6 位';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      toast.success('登录成功');
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '登录失败，请检查邮箱和密码';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { url } = await getGoogleAuthUrl(from);
      // eslint-disable-next-line no-restricted-syntax
      window.location.href = url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google 登录暂不可用';
      toast.error(message);
    }
  };

  const handleCodeLogin = async () => {
    if (!accessCode.trim() || codeSubmitting) return;
    setCodeSubmitting(true);
    try {
      const user = await loginWithCode(accessCode.trim());
      toast.success('登录成功');
      // 首次访问码登录提示
      if (user.provider === 'access_code') {
        const key = 'access_code_first_login_hint_shown';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          toast.info('登录成功！你可以在设置中修改昵称和头像，也可以设置登录密码。');
        }
      }
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '通行码无效或已过期';
      toast.error(message);
    } finally {
      setCodeSubmitting(false);
    }
  };

  const googleEnabled = siteSettings?.googleLoginEnabled ?? true;
  const registrationMode = siteSettings?.registrationMode ?? 'email_and_google';
  const showEmailForm = showEmailLogin || registrationMode === 'email_and_google';

  return (
    <div className="min-h-screen w-full bg-black flex items-start md:items-center justify-center px-4 pt-8 md:pt-0 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6 md:mb-8">
          <Feather className="w-7 h-7 md:w-8 md:h-8 text-blue-500" strokeWidth={1.5} />
          <span className="text-xl md:text-2xl font-bold text-gray-100">LongPost</span>
        </div>

        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 md:p-6">
          <h1 className="text-xl font-bold text-gray-100 mb-2">登录到 LongPost</h1>

          {settingsLoading ? null : (
            <p className="text-sm text-gray-500 mb-6">选择登录方式</p>
          )}

          {settingsLoading ? (
            <div className="py-8 text-center text-gray-500">加载中...</div>
          ) : (
            <>
              {/* Tab 切换 */}
              <div className="flex border-b border-gray-800 mb-4 md:mb-6">
                <button
                  type="button"
                  onClick={() => setLoginMode('code')}
                  className={`flex-1 min-h-11 md:min-h-0 py-2.5 md:py-3 text-sm font-medium transition-colors relative ${
                    loginMode === 'code'
                      ? 'text-blue-500'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  通行码
                  {loginMode === 'code' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('email')}
                  className={`flex-1 min-h-11 md:min-h-0 py-2.5 md:py-3 text-sm font-medium transition-colors relative ${
                    loginMode === 'email'
                      ? 'text-blue-500'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  邮箱
                  {loginMode === 'email' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                  )}
                </button>
                {googleEnabled && (
                  <button
                    type="button"
                    onClick={() => setLoginMode('google')}
                    className={`flex-1 min-h-11 md:min-h-0 py-2.5 md:py-3 text-sm font-medium transition-colors relative ${
                      loginMode === 'google'
                        ? 'text-blue-500'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Google
                    {loginMode === 'google' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                    )}
                  </button>
                )}
              </div>

              {/* 邮箱登录 */}
              {loginMode === 'email' && (
                <>
                  {!showEmailForm && registrationMode === 'google_only' ? (
                    <div className="text-center py-4">
                      <button
                        type="button"
                        onClick={() => setShowEmailLogin(true)}
                        className="text-sm text-gray-500 hover:text-gray-400"
                      >
                        已有账号？使用邮箱登录
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-gray-300">
                          邮箱
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          disabled={submitting}
                          className="h-11 md:h-9 bg-transparent border-gray-700 text-gray-100 placeholder:text-gray-600 focus-visible:border-blue-500"
                        />
                        {errors.email && (
                          <p className="text-sm text-red-500">{errors.email}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-gray-300">
                          密码
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="至少 6 位"
                          disabled={submitting}
                          className="h-11 md:h-9 bg-transparent border-gray-700 text-gray-100 placeholder:text-gray-600 focus-visible:border-blue-500"
                        />
                        {errors.password && (
                          <p className="text-sm text-red-500">{errors.password}</p>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={submitting}
                        className="w-full min-h-11 md:min-h-9 bg-blue-500 hover:bg-blue-600 text-white border-transparent mt-2"
                      >
                        {submitting ? '登录中...' : '登录'}
                      </Button>
                    </form>
                  )}
                </>
              )}

              {/* Google 登录 */}
              {loginMode === 'google' && (
                <div className="py-4">
                  {googleEnabled ? (
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      className="w-full min-h-11 md:min-h-0 md:py-2.5 px-4 bg-white text-gray-900 rounded-md font-medium flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      使用 Google 登录
                    </button>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">Google 登录暂未启用</p>
                    </div>
                  )}
                </div>
              )}

              {/* 通行码登录 */}
              {loginMode === 'code' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="accessCode" className="text-gray-300">
                      专属通行码
                    </Label>
                    <div className="relative">
                      <Input
                        id="accessCode"
                        type={showAccessCode ? 'text' : 'password'}
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        placeholder="请输入通行码"
                        disabled={codeSubmitting}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleCodeLogin();
                          }
                        }}
                        className="h-11 md:h-9 bg-transparent border-gray-700 text-gray-100 placeholder:text-gray-600 focus-visible:border-blue-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessCode((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showAccessCode ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      输入通行码即可直接登录，无需注册账号
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={handleCodeLogin}
                    disabled={codeSubmitting || !accessCode.trim()}
                    className="w-full min-h-11 md:min-h-9 bg-blue-500 hover:bg-blue-600 text-white border-transparent"
                  >
                    {codeSubmitting ? '登录中...' : '使用通行码登录'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const LoginPage: React.FC = () => (
  <LoginPageContent />
);

export default LoginPage;
