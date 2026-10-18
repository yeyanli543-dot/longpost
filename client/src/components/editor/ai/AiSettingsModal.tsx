import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Bot,
  Cpu,
  Key,
  Globe,
  Check,
  AlertCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLLMConfig,
  setLLMConfig,
  type UniversalLLMConfig,
  type LLMProviderType,
  streamChatCompletion,
} from '@/lib/ai/universal-llm-client';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<UniversalLLMConfig>(getLLMConfig());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(getLLMConfig());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setLLMConfig(config);
    toast.success('AI 模型配置已保存到本地');
    onClose();
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setLLMConfig(config);

    try {
      let output = '';
      await streamChatCompletion({
        messages: [
          { role: 'user', content: '请只回复“连接成功”四个字。' },
        ],
        onChunk: (chunk) => {
          output += chunk;
        },
      });
      setTestResult(`连接成功！模型回复: ${output.trim()}`);
      toast.success('AI 连接测试成功');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult(`连接失败: ${msg}`);
      toast.error('AI 连接测试失败，请核对配置');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1f22] p-6 shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 顶部标题 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              AI 深度写作协同配置
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              纯本地存储 (BYOK) · 零服务端泄露风险 · 支持离线本地 Ollama
            </p>
          </div>
        </div>

        {/* 提供商切换 */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-zinc-900 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => setConfig({ ...config, provider: 'openai' })}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              config.provider === 'openai'
                ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-blue-500" />
            <span>OpenAI / DeepSeek</span>
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, provider: 'gemini' })}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              config.provider === 'gemini'
                ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>Google Gemini</span>
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, provider: 'ollama' })}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              config.provider === 'ollama'
                ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
            <span>本地 Ollama</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* OpenAI / DeepSeek 配置 */}
          {config.provider === 'openai' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between mb-1">
                  <span>API Base URL (接入点)</span>
                  <span className="text-[11px] text-gray-400">支持 DeepSeek / 硅基流动 / OpenAI</span>
                </label>
                <input
                  type="text"
                  required
                  value={config.openai.baseUrl}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      openai: { ...config.openai, baseUrl: e.target.value },
                    })
                  }
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between mb-1">
                  <span>API Key</span>
                  <span className="text-[11px] text-gray-400">保存在本地 localStorage</span>
                </label>
                <input
                  type="password"
                  required
                  value={config.openai.apiKey}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      openai: { ...config.openai, apiKey: e.target.value },
                    })
                  }
                  placeholder="sk-..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  模型名称 (Model)
                </label>
                <input
                  type="text"
                  required
                  value={config.openai.model}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      openai: { ...config.openai, model: e.target.value },
                    })
                  }
                  placeholder="deepseek-chat 或 gpt-4o-mini"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Google Gemini 配置 */}
          {config.provider === 'gemini' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between mb-1">
                  <span>Gemini API Key</span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5"
                  >
                    获取免费 Key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <input
                  type="password"
                  required
                  value={config.gemini.apiKey}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      gemini: { ...config.gemini, apiKey: e.target.value },
                    })
                  }
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between mb-1">
                  <span>自定义网关地址 (Custom Base URL)</span>
                  <span className="text-[11px] text-gray-400">选填 · 留空走官方端点</span>
                </label>
                <input
                  type="text"
                  value={config.gemini.customBaseUrl || ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      gemini: { ...config.gemini, customBaseUrl: e.target.value },
                    })
                  }
                  placeholder="https://generativelanguage.googleapis.com"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-purple-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  用于自建反向代理或企业网关；填写后该地址将替代官方 API 域名
                </p>
              </div>

              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Gemini 模型名称
                </label>
                <input
                  type="text"
                  required
                  value={config.gemini.model}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      gemini: { ...config.gemini, model: e.target.value },
                    })
                  }
                  placeholder="gemini-1.5-flash 或 gemini-2.5-flash"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          )}

          {/* 本地 Ollama 配置 */}
          {config.provider === 'ollama' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Ollama 服务地址
                </label>
                <input
                  type="text"
                  required
                  value={config.ollama.baseUrl}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      ollama: { ...config.ollama, baseUrl: e.target.value },
                    })
                  }
                  placeholder="http://127.0.0.1:11434"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  本地模型标签 (Model Tag)
                </label>
                <input
                  type="text"
                  required
                  value={config.ollama.model}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      ollama: { ...config.ollama, model: e.target.value },
                    })
                  }
                  placeholder="qwen2.5:7b 或 deepseek-r1:8b"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed">
                <p className="font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-500" /> 跨域设置提示
                </p>
                <p className="mt-0.5">
                  浏览器直连 Ollama 时，需在系统启动 Ollama 前设置环境变量：
                  <code className="px-1 py-0.5 bg-black/10 dark:bg-white/10 rounded ml-1 font-mono">
                    OLLAMA_ORIGINS="*"
                  </code>
                </p>
              </div>
            </div>
          )}

          {/* 测试连接反馈 */}
          {testResult && (
            <div
              className={`p-2.5 rounded-xl text-xs ${
                testResult.startsWith('连接成功')
                  ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              {testResult}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              className="px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-colors disabled:opacity-50"
            >
              {isTesting ? '正在握手...' : '测试连接'}
            </button>

            <button
              type="submit"
              className="px-5 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-sm active:scale-95"
            >
              保存配置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
