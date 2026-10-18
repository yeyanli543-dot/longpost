import { Injectable, BadGatewayException, BadRequestException } from '@nestjs/common';

export interface GenerateTextOptions {
  prompt: string;
  model?: string;
  customBaseUrl?: string;
}

@Injectable()
export class AiService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async generateContent(options: GenerateTextOptions): Promise<string> {
    if (!this.apiKey) {
      throw new BadRequestException('未配置 GEMINI_API_KEY');
    }

    const model = options.model || 'gemini-2.5-flash';
    const baseUrl = (options.customBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const url = `${baseUrl}/v1beta/models/${model}:generateContent`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: options.prompt }],
            },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new BadGatewayException(`AI 上游接口返回异常: HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || '';
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof BadGatewayException) {
        throw err;
      }
      throw new BadGatewayException('AI 上游响应超时或连接失败');
    }
  }
}
