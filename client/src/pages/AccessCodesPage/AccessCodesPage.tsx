import React from 'react';
import { useAuth } from '@client/src/hooks/useAuth';
import { Loader2, Shield } from 'lucide-react';
import AccessCodesManager from './AccessCodesManager';

const AccessCodesPage: React.FC = () => {
  const { isAdmin, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-[#e7e9ea] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 size={32} className="animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-[#e7e9ea] flex items-center justify-center">
        <div className="bg-[#16181c] border border-[#2f3336] rounded-lg p-8 text-center max-w-sm">
          <Shield className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#e7e9ea] mb-2">无权限访问</h2>
          <p className="text-sm text-[#71767b]">
            您没有管理员权限，无法访问此页面。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#e7e9ea]">
      <div className="border-b border-[#2f3336] px-4 py-4 sticky top-0 bg-black/90 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#e7e9ea]">团队通行码</h1>
              <p className="text-sm text-[#71767b] mt-1">
                管理团队成员的通行码登录凭证
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <AccessCodesManager />
      </div>
    </div>
  );
};

export default AccessCodesPage;
