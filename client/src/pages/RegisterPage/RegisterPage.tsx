import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Feather } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@client/src/hooks/useAuth';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';
import { Label } from '@client/src/components/ui/label';
import { getGoogleAuthUrl } from '@client/src/api/auth';
import { siteSettingsApi } from '@client/src/api';
import type { SiteSettings } from '@shared/api.interface';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RegisterPageContent: React.FC = () => {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    nickname?: string;
    email?: string;
    password?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

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

  const googleEnabled = siteSettings?.googleLoginEnabled ?? true;
  const registrationMode = siteSettings?.registrationMode ?? 'email_and_google';

  const validate = (): boolean => {
    const nextErrors: {
      nickname?: string;
      email?: string;
      password?: string;
    } = {};

    if (!nickname.trim()) {
      nextErrors.nickname = '请输入昵称';
    } else if (nickname.length > 50) {
      nextErrors.nickname = '昵称最多 50 个字符';
    }

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    try {
      await register({
        nickname: nickname.trim(),
        email: email.trim(),
        password,
      });
      toast.success('注册成功');
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '注册失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-start md:items-center justify-center px-4 pt-8 md:pt-0 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6 md:mb-8">
          <Feather className="w-7 h-7 md:w-8 md:h-8 text-blue-500" strokeWidth={1.5} />
          <span className="text-xl md:text-2xl font-bold text-gray-100">LongPost</span>
        </div>

        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 md:p-6">
          <h1 className="text-xl font-bold text-gray-100 mb-2">创建账号</h1>

          {settingsLoading ? (
            <div className="py-8 text-center text-gray-500">加载中...</div>
          ) : registrationMode === 'google_only' ? (
            <>
              <p className="text-sm text-gray-500 mb-6">本站仅支持 Google 账号注册登录</p>

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
                  使用 Google 注册
                </button>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">注册功能暂未启用</p>
              )}

              <div className="mt-6 pt-4 border-t border-gray-800 text-center">
                <p className="text-sm text-gray-500">
                  已有账号？{' '}
                  <Link
                    to="/login"
                    className="text-blue-500 hover:text-blue-400 font-medium"
                  >
                    去登录
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">填写信息创建账号</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nickname" className="text-gray-300">
                    昵称
                  </Label>
                  <Input
                    id="nickname"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="你的昵称"
                    disabled={submitting}
                    className="h-11 md:h-9 bg-transparent border-gray-700 text-gray-100 placeholder:text-gray-600 focus-visible:border-blue-500"
                    maxLength={50}
                  />
                  <div className="flex justify-between items-start">
                    <div>
                      {errors.nickname && (
                        <p className="text-sm text-red-500">{errors.nickname}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-600">{nickname.length}/50</span>
                  </div>
                </div>

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
                  {submitting ? '注册中...' : '注册'}
                </Button>
              </form>

              {googleEnabled && (
                <div className="mt-6">
                  <div className="relative flex items-center">
                    <div className="flex-grow border-t border-gray-800"></div>
                    <span className="flex-shrink mx-4 text-xs text-gray-600">或使用 Google 注册</span>
                    <div className="flex-grow border-t border-gray-800"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full mt-4 min-h-11 md:min-h-0 md:py-2.5 px-4 bg-white text-gray-900 rounded-md font-medium flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    使用 Google 注册
                  </button>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-gray-800 text-center">
                <p className="text-sm text-gray-500">
                  已有账号？{' '}
                  <Link
                    to="/login"
                    className="text-blue-500 hover:text-blue-400 font-medium"
                  >
                    去登录
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const RegisterPage: React.FC = () => (
  <RegisterPageContent />
);

export default RegisterPage;
