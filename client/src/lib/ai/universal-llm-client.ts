import { logger } from '@/lib/logger';

export type LLMProviderType = 'openai' | 'gemini' | 'ollama';

export interface OpenAISettings {
  baseUrl: string; // e.g., https://api.openai.com/v1 or https://api.deepseek.com/v1
  apiKey: string;
  model: string; // e.g., deepseek-chat, gpt-4o-mini
}

export interface GeminiSettings {
  apiKey: string;
  model: string; // e.g., gemini-1.5-flash, gemini-2.0-flash
  customBaseUrl?: string;
}

export interface OllamaSettings {
  baseUrl: string; // e.g., http://127.0.0.1:11434
  model: string; // e.g., qwen2.5:7b, deepseek-r1:8b, llama3.1
}

export interface UniversalLLMConfig {
  provider: LLMProviderType;
  openai: OpenAISettings;
  gemini: GeminiSettings;
  ollama: OllamaSettings;
}

export const LLM_CONFIG_STORAGE_KEY = 'lp_llm_config';

/**
 * 获取本地持久化的 LLM 配置（完全存储在客户端，绝不上报服务器）
 */
export function getLLMConfig(): UniversalLLMConfig {
  const defaults: UniversalLLMConfig = {
    provider: 'openai',
    openai: {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat',
    },
    gemini: {
      apiKey: '',
      model: 'gemini-1.5-flash',
    },
    ollama: {
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen2.5:7b',
    },
  };

  try {
    const raw = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        provider: parsed.provider || defaults.provider,
        openai: { ...defaults.openai, ...(parsed.openai || {}) },
        gemini: { ...defaults.gemini, ...(parsed.gemini || {}) },
        ollama: { ...defaults.ollama, ...(parsed.ollama || {}) },
      };
    }
  } catch {
    // ignore
  }

  return defaults;
}

/**
 * 保存 LLM 配置到 LocalStorage
 */
export function setLLMConfig(config: UniversalLLMConfig): void {
  try {
    localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    logger.error('保存 LLM 配置失败', err);
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamLLMOptions {
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  onError?: (err: Error) => void;
  onComplete?: (fullText: string) => void;
}

/**
 * 统一流式推理请求分发器
 */
export async function streamChatCompletion(options: StreamLLMOptions): Promise<string> {
  const config = getLLMConfig();
  const { provider } = config;

  switch (provider) {
    case 'gemini':
      return streamGeminiCompletion(config.gemini, options);
    case 'ollama':
      return streamOllamaCompletion(config.ollama, options);
    case 'openai':
    default:
      return streamOpenAICompletion(config.openai, options);
  }
}

/**
 * 1. OpenAI 兼容接口流式解析（支持 DeepSeek / OpenAI / 硅基流动 / Moonshot 等）
 */
async function streamOpenAICompletion(
  settings: OpenAISettings,
  options: StreamLLMOptions,
): Promise<string> {
  const { baseUrl, apiKey, model } = settings;
  if (!apiKey && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    throw new Error('未配置 API Key，请在 AI 助手设置中填写');
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const url = cleanBaseUrl.endsWith('/chat/completions')
    ? cleanBaseUrl
    : `${cleanBaseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `OpenAI/DeepSeek 请求失败 [${response.status} ${response.statusText}]: ${errorBody || '请检查 BaseUrl 与 API Key'}`,
    );
  }

  if (!response.body) {
    throw new Error('浏览器未接收到可读流 (ReadableStream 为空)');
  }

  return parseEventStream(response.body, (dataStr) => {
    if (dataStr === '[DONE]') return null;
    try {
      const parsed = JSON.parse(dataStr);
      return parsed.choices?.[0]?.delta?.content || null;
    } catch {
      return null;
    }
  }, options);
}

/**
 * 2. Google Gemini 官方接口流式解析
 */
async function streamGeminiCompletion(
  settings: GeminiSettings,
  options: StreamLLMOptions,
): Promise<string> {
  const { apiKey, model } = settings;
  if (!apiKey) {
    throw new Error('未配置 Google Gemini API Key，请在设置中填写');
  }

  const safeModel = model || 'gemini-1.5-flash';
  const baseUrl = (settings.customBaseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1beta/models/${safeModel}:streamGenerateContent?alt=sse`;

  // 转换消息格式为 Gemini contents
  const contents = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemMessage = options.messages.find((m) => m.role === 'system');
  const systemInstruction = systemMessage
    ? { parts: [{ text: systemMessage.content }] }
    : undefined;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey.trim(),
    },
    body: JSON.stringify({
      contents,
      systemInstruction,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
      },
    }),
    signal: options.signal || AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini 请求失败 [${response.status}]: ${errorBody}`);
  }

  if (!response.body) {
    throw new Error('Gemini 响应体为空');
  }

  return parseEventStream(response.body, (dataStr) => {
    try {
      const parsed = JSON.parse(dataStr);
      return parsed.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch {
      return null;
    }
  }, options);
}

/**
 * 3. 本地离线 Ollama 接口流式解析（默认 http://127.0.0.1:11434/api/chat）
 */
async function streamOllamaCompletion(
  settings: OllamaSettings,
  options: StreamLLMOptions,
): Promise<string> {
  const { baseUrl, model } = settings;
  const cleanBaseUrl = (baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/api/chat`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'qwen2.5:7b',
        messages: options.messages,
        options: {
          temperature: options.temperature ?? 0.7,
        },
        stream: true,
      }),
      signal: options.signal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `无法连接本地 Ollama 服务 (${url})。如果是跨域错误，请在启动 Ollama 时配置环境变量 OLLAMA_ORIGINS="*"。\n错误详情: ${msg}`,
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Ollama 返回错误 [${response.status}]: ${errText || '请检查模型是否存在'}`);
  }

  if (!response.body) {
    throw new Error('Ollama 响应体为空');
  }

  // Ollama 输出为 NDJSON (每行一个完整 JSON)
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const chunk = parsed.message?.content || '';
          if (chunk) {
            fullText += chunk;
            options.onChunk(chunk);
          }
        } catch {
          // ignore incomplete line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (options.onComplete) {
    options.onComplete(fullText);
  }
  return fullText;
}

/**
 * 通用 SSE (Server-Sent Events) 数据流解析器
 */
async function parseEventStream(
  stream: ReadableStream<Uint8Array>,
  extractor: (dataStr: string) => string | null,
  options: StreamLLMOptions,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        const content = extractor(dataStr);
        if (content) {
          fullText += content;
          options.onChunk(content);
        }
      }
    }
  } catch (err: unknown) {
    if (options.signal?.aborted) {
      // 正常中断
      return fullText;
    }
    const error = err instanceof Error ? err : new Error(String(err));
    if (options.onError) {
      options.onError(error);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (options.onComplete) {
    options.onComplete(fullText);
  }
  return fullText;
}
