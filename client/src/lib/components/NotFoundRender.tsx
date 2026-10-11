import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';

export const NotFoundRender: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="p-4 mb-4 rounded-full bg-primary/10 text-primary">
        <FileQuestion className="w-12 h-12" />
      </div>
      <h1 className="text-3xl font-bold text-gray-100 mb-2">404</h1>
      <p className="text-base text-gray-400 max-w-sm mb-6">
        抱歉，您访问的页面不存在或已被移除。
      </p>
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
      >
        <Home className="w-4 h-4" />
        返回首页
      </button>
    </div>
  );
};
