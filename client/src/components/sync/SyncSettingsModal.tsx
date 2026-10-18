import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  RefreshCw,
  Check,
  AlertCircle,
  ShieldCheck,
  Server,
  Lock,
  User,
  FolderSync,
  Eye,
  EyeOff,
  Clock,
  FileCheck2,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSavedWebdavConfig,
  saveWebdavConfig,
  clearWebdavConfig,
  WebdavClient,
  type WebdavConfig,
} from '@/lib/sync/webdav-client';
import {
  syncCoordinator,
  type SyncStatusChangeEvent,
  type SyncState,
} from '@/lib/sync/sync-coordinator';
import type { SyncResult } from '@shared/sync/sync-protocol';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: (result: SyncResult) => void;
  activeDraft?: { id?: string; title?: string; content?: string };
}

export const SyncSettingsModal: React.FC<SyncSettingsModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete,
  activeDraft,
}) => {
  const [config, setConfig] = useState<WebdavConfig>({
    endpoint: '',
    username: '',
    password: '',
    basePath: '/LongPost',
    autoSync: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [syncEvent, setSyncEvent] = useState<SyncStatusChangeEvent>({
    state: syncCoordinator.getState(),
    lastResult: syncCoordinator.getLastResult(),
  });

  // 挂载与打开时载入配置与订阅状态
  useEffect(() => {
    if (isOpen) {
      const saved = getSavedWebdavConfig();
      if (saved) {
        setConfig(saved);
      }
      setTestResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = syncCoordinator.subscribe((ev) => {
      setSyncEvent(ev);
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  // 快捷预设填充
  const handleApplyPreset = (preset: 'jianguo' | 'nextcloud') => {
    if (preset === 'jianguo') {
      setConfig((prev) => ({
        ...prev,
        endpoint: 'https://dav.jianguoyun.com/dav/',
        basePath: '/LongPost',
      }));
      toast.info('已填入坚果云 WebDAV 地址，请输入您的坚果云账号和“应用密码”');
    } else if (preset === 'nextcloud') {
      setConfig((prev) => ({
        ...prev,
        endpoint: prev.endpoint || 'https://cloud.example.com/remote.php/dav/files/user/',
        basePath: '/LongPost',
      }));
      toast.info('已填入 Nextcloud 示例地址，请将域名与用户名替换为您的实际配置');
    }
  };

  // 测试远端连通性
  const handleTestConnection = async () => {
    if (!config.endpoint || !config.username) {
      toast.error('请先填写服务器地址和账号');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const client = new WebdavClient(config);
      const res = await client.testConnection();
      setTestResult(res);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: msg });
      toast.error(`测试失败: ${msg}`);
    } finally {
      setIsTesting(false);
    }
  };

  // 保存配置
  const handleSaveConfig = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!config.endpoint || !config.username) {
      toast.error('请填写完整的 WebDAV 地址与账号');
      return;
    }
    saveWebdavConfig(config);
    toast.success('WebDAV 配置已安全保存在本地');
  };

  // 立即触发跨端同步
  const handleTriggerSync = async () => {
    handleSaveConfig();
    try {
      const result = await syncCoordinator.triggerSync(config, activeDraft);
      if (onSyncComplete) {
        onSyncComplete(result);
      }
    } catch {
      // toast 已经在 coordinator 中处理
    }
  };

  // 清空配置
  const handleClear = () => {
    clearWebdavConfig();
    setConfig({
      endpoint: '',
      username: '',
      password: '',
      basePath: '/LongPost',
      autoSync: false,
    });
    setTestResult(null);
    toast.info('已清除本地 WebDAV 同步配置');
  };

  // 一键全量备份快照到 WebDAV
  const handleFullBackup = async () => {
    if (!config.endpoint || !config.username) {
      toast.error('请先填写服务器地址和账号');
      return;
    }
    saveWebdavConfig(config);
    setIsTesting(true);
    try {
      const client = new WebdavClient(config);
      const res = await client.uploadFullBackup();
      setTestResult({ ok: res.ok, message: res.message });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: `备份异常: ${msg}` });
      toast.error(`备份异常: ${msg}`);
    } finally {
      setIsTesting(false);
    }
  };

  // 从 WebDAV 全量备份恢复（合并式，不覆盖本地已有文章）
  const handleFullRestore = async () => {
    if (!config.endpoint || !config.username) {
      toast.error('请先填写服务器地址和账号');
      return;
    }
    saveWebdavConfig(config);
    setIsTesting(true);
    try {
      const client = new WebdavClient(config);
      const res = await client.restoreFullBackup();
      setTestResult({ ok: res.ok, message: res.message });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: `恢复异常: ${msg}` });
      toast.error(`恢复异常: ${msg}`);
    } finally {
      setIsTesting(false);
    }
  };

  const isSyncing = syncEvent.state === 'syncing' || syncEvent.state === 'checking';
  const lastResult = syncEvent.lastResult;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/60 dark:bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  跨设备数据同步中枢
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  三向对比 · 冲突保护
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                支持坚果云 / Nextcloud / 自建 WebDAV，私有数据永不上报第三方服务器
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体滚动区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {/* 快捷预设按钮组 */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              快速载入预设
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset('jianguo')}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-xs text-zinc-700 dark:text-zinc-300 font-medium transition-all"
              >
                🌰 坚果云 (Jianguoyun)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('nextcloud')}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs text-zinc-700 dark:text-zinc-300 font-medium transition-all"
              >
                ☁️ Nextcloud / OwnCloud
              </button>
            </div>
          </div>

          {/* 表单输入区 */}
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                WebDAV 服务器入口 (Endpoint)
              </label>
              <div className="relative">
                <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={config.endpoint}
                  onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                  placeholder="https://dav.jianguoyun.com/dav/"
                  className="w-full pl-10 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-foreground outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  账号 / 邮箱 (Username)
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                    placeholder="user@domain.com"
                    className="w-full pl-10 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-foreground outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  应用授权密码 (Password)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder="请输入应用密码"
                    className="w-full pl-10 pr-10 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-foreground outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                同步根目录 (Base Path)
              </label>
              <div className="relative">
                <FolderSync className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={config.basePath || '/LongPost'}
                  onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
                  placeholder="/LongPost"
                  className="w-full pl-10 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-foreground outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                远程目录结构约定：<code className="text-zinc-500">/LongPost/manifest.json</code> 与{' '}
                <code className="text-zinc-500">/LongPost/notes/&lt;id&gt;.json</code>
              </p>
            </div>
          </form>

          {/* 连通性测试结果反馈 */}
          {testResult && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2.5 ${
                testResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
              }`}
            >
              {testResult.ok ? (
                <Check className="w-4 h-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* 冲突防护与安全策略卡片 */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>三向对比与安全裁决原则</span>
            </div>
            <ul className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1 list-disc list-inside">
              <li>
                <strong className="text-zinc-700 dark:text-zinc-300">严禁静默覆盖：</strong>
                若两端同时离线修改，本地版本将自动另存为新文章，并弹窗提示您核对合并。
              </li>
              <li>
                <strong className="text-zinc-700 dark:text-zinc-300">墓碑软删除防复活：</strong>
                在一端删除长文后生成 Tombstone 标记，防止旧设备连网时把已删文件重新推回。
              </li>
              <li>
                <strong className="text-zinc-700 dark:text-zinc-300">原生无 CORS 代理：</strong>
                桌面端通过 Electron 主进程原生直传；浏览器端通过轻量转发代理，跨域零报错。
              </li>
            </ul>
          </div>

          {/* 上次同步摘要与冲突历史 */}
          {lastResult && (
            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-800/50 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>上次同步结果</span>
                </div>
                <span className="text-[11px] font-normal text-indigo-600/80 dark:text-indigo-400/80">
                  {new Date(lastResult.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-xs border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-0.5">
                    <ArrowDownToLine className="w-3 h-3 text-blue-500" />
                    <span>拉取</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {lastResult.pulledCount}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-xs border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-0.5">
                    <ArrowUpFromLine className="w-3 h-3 text-emerald-500" />
                    <span>推送</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {lastResult.pushedCount}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-xs border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-0.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span>冲突保护</span>
                  </div>
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {lastResult.conflictedCount}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-xs border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-0.5">
                    <Trash2 className="w-3 h-3 text-zinc-400" />
                    <span>软清理</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {lastResult.deletedCount}
                  </span>
                </div>
              </div>

              {/* 冲突备份详细列表 */}
              {lastResult.conflicts.length > 0 && (
                <div className="pt-2 border-t border-indigo-200/40 dark:border-indigo-800/40 space-y-1.5">
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    ⚠️ 已自动生成的冲突备份长文：
                  </p>
                  {lastResult.conflicts.map((conf, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-200 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">原文章：《{conf.originalTitle}》</span>
                        <span className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
                          安全备份
                        </span>
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 text-[10px]">
                        另存副本：《{conf.backupTitle}》
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作条 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/60 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSyncing}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors disabled:opacity-50"
            >
              {isTesting ? '正在探测...' : '测试连通性'}
            </button>
            <button
              type="button"
              onClick={handleFullBackup}
              disabled={isTesting || isSyncing}
              className="px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors disabled:opacity-50"
            >
              全量备份
            </button>
            <button
              type="button"
              onClick={handleFullRestore}
              disabled={isTesting || isSyncing}
              className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-300 transition-colors disabled:opacity-50"
            >
              从备份恢复
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium transition-colors"
            >
              清空
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSyncing}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              仅保存配置
            </button>
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs shadow-md shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '正在三向同步中...' : '立即双向同步'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
