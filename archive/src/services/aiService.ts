import { AiEngineConfig } from '../types/models';

export interface PolishOptions {
  content: string;
  instruction?: string;
  config: AiEngineConfig;
}

export class AiService {
  static async generate(options: PolishOptions): Promise<string> {
    const { content, instruction = '请对以下内容进行语法修正与文笔润色，保持原意不变：', config } = options;

    if (config.mode === 'custom') {
      const apiKey = config.apiKey?.trim();
      if (!apiKey) {
        throw new Error('自定义模式下必须提供 Gemini API Key');
      }

      const baseUrl = (config.customBaseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
      const model = config.model || 'gemini-2.5-flash';
      const endpoint = `${baseUrl}/v1beta/models/${model}:generateContent`;

      const prompt = `${instruction}\n\n${content}`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`Gemini API 响应异常: HTTP ${response.status}`);
        }

        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (err: any) {
        if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
          throw new Error('AI 上游响应超时 (30s)');
        }
        throw err;
      }
    } else {
      // Cloud hosted proxy mode
      const response = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, instruction }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`云端 AI 接口异常: HTTP ${response.status}`);
      }

      const data = await response.json();
      return data?.result || data?.content || '';
    }
  }
}
