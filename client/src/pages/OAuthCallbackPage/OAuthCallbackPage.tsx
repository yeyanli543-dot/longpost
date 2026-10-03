import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '@client/src/hooks/useAuth';

const OAuthCallbackContent: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthFromOAuth } = useAuth();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const provider = searchParams.get('provider') || 'google';
    const stateParam = searchParams.get('state') || undefined;

    if (error) {
      let message = '授权失败，请重试';
      if (error === 'access_denied') {
        message = '您拒绝了 Google 授权，请重新登录并同意授权';
      } else if (error === 'redirect_uri_mismatch') {
        message = 'Google 重定向 URI 配置有误，请联系管理员';
      } else if (error === 'invalid_client') {
        message = 'Google 客户端配置无效，请联系管理员';
      }
      toast.error(message);
      navigate('/login', { replace: true });
      return;
    }

    if (!code) {
      toast.error('缺少授权码');
      navigate('/login', { replace: true });
      return;
    }

    if (handled) return;
    setHandled(true);

    const handleCallback = async () => {
      try {
        const result = await setAuthFromOAuth(provider, code, stateParam);
        toast.success('登录成功');
        const redirectTo = (result as { redirectTo?: string }).redirectTo || '/';
        navigate(redirectTo, { replace: true });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '登录失败，请重试';
        toast.error(message);
        navigate('/login', { replace: true });
      }
    };

    handleCallback();
  }, [searchParams, navigate, setAuthFromOAuth, handled, location]);

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-300">正在登录...</p>
      </div>
    </div>
  );
};

const OAuthCallbackPage: React.FC = () => (
  <OAuthCallbackContent />
);

export default OAuthCallbackPage;
