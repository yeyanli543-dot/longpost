import React, { useState } from 'react';
import { WebDavConfig } from '../types/models';
import { WebDavClientService } from '../services/webdavClient';
import { useDocumentStore } from '../store/useDocumentStore';

interface WebDavModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WebDavModal: React.FC<WebDavModalProps> = ({ isOpen, onClose }) => {
  const [endpoint, setEndpoint] = useState('https://dav.jianguoyun.com/dav/');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadDocuments = useDocumentStore((state) => state.loadDocuments);

  if (!isOpen) return null;

  const getConfig = (): WebDavConfig => ({
    endpoint: endpoint.trim(),
    username: username.trim(),
    password,
  });

  const handleTest = async () => {
    setIsLoading(true);
    setStatusMessage('正在测试连接...');
    try {
      const res = await WebDavClientService.testWebDavConnection(getConfig());
      if (res.ok) {
        setStatusMessage('✅ WebDAV 服务器连接成功！');
      } else {
        setStatusMessage(`❌ 连接异常: HTTP ${res.status}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ 连接失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackup = async () => {
    setIsLoading(true);
    setStatusMessage('正在备份全库文档...');
    try {
      const res = await WebDavClientService.uploadBackupToWebDav(getConfig());
      setStatusMessage(`✅ 成功备份 ${res.count} 篇文档至 WebDAV`);
    } catch (err: any) {
      setStatusMessage(`❌ 备份失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('从 WebDAV 恢复备份将合并本地文档，是否继续？')) {
      return;
    }
    setIsLoading(true);
    setStatusMessage('正在拉取备份文件并恢复...');
    try {
      const res = await WebDavClientService.restoreBackupFromWebDav(getConfig());
      await loadDocuments();
      setStatusMessage(`🎉 成功恢复 ${res.restoredCount} 篇文档！列表已刷新。`);
    } catch (err: any) {
      setStatusMessage(`❌ 恢复失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
          ☁️ WebDAV 多端备份与同步中枢
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              WebDAV 服务器地址
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://dav.jianguoyun.com/dav/"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              账号 / 邮箱
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              应用专用密码 / 授权令牌
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
            />
          </div>

          {statusMessage && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {statusMessage}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={isLoading || !endpoint || !username}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50 min-h-[44px]"
            >
              测试连接
            </button>
            <button
              onClick={handleRestore}
              disabled={isLoading || !endpoint || !username}
              className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300 disabled:opacity-50 min-h-[44px]"
            >
              从 WebDAV 恢复
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 min-h-[44px]"
            >
              关闭
            </button>
            <button
              onClick={handleBackup}
              disabled={isLoading || !endpoint || !username}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
            >
              立即备份
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
