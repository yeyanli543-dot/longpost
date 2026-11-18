import { LogIn } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface LoginGateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  buttonText?: string;
}

const LoginGate = ({
  icon,
  title,
  description,
  buttonText = '登录 / 注册',
}: LoginGateProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = () => {
    navigate('/login', { state: { from: location.pathname + location.search } });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="mb-4">
        {icon ?? <LogIn className="w-12 h-12 text-muted-foreground" />}
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-sm">{description}</p>
      <button
        onClick={handleLogin}
        className="px-6 py-2 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-full transition-colors"
        data-ai-section-type="button"
      >
        {buttonText}
      </button>
    </div>
  );
};

export default LoginGate;
