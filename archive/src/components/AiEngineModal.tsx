import React, { useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

interface AiEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiEngineModal: React.FC<AiEngineModalProps> = ({ isOpen, onClose }) => {
  const store = useSettingsStore.getState();
  const [mode, setMode] = useState<'cloud' | 'custom'>(store.settings.aiConfig.mode);
  const [apiKey, setApiKey] = useState(store.settings.aiConfig.apiKey || '');
  const [customBaseUrl, setCustomBaseUrl] = useState(store.settings.aiConfig.customBaseUrl || '');
  const [model, setModel] = useState(store.settings.aiConfig.model || 'gemini-2.5-flash');

  if (!isOpen) return null;

  const handleSave = () => {
    store.updateAiConfig({
      mode,
      apiKey: apiKey.trim(),
      customBaseUrl: customBaseUrl.trim(),
      model: model.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
          🤖 AI 引擎协同配置 (BYOK)
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              运行模式
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="mode"
                  value="cloud"
                  checked={mode === 'cloud'}
                  onChange={() => setMode('cloud')}
                />
                云端托管模式 (默认)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="mode"
                  value="custom"
                  checked={mode === 'custom'}
                  onChange={() => setMode('custom')}
                />
                自带密钥 (BYOK / 离线)
              </label>
            </div>
          </div>

          {mode === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  自定义网关地址 (customBaseUrl)
                </label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://generativelanguage.googleapis.com (选填，留空默认官方端点)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  支持企业内网反向代理或第三方 Gemini API 转发网关。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  模型名称
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gemini-2.5-flash"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 min-h-[44px]"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 min-h-[44px]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
          >
            保存并生效
          </button>
        </div>
      </div>
    </div>
  );
};
