/**
 * AI 调用路由
 *
 * 优先级（从便宜到贵、从近到远）：
 *   1. 本地配置了 Key（或选了 Ollama）→ 直接打上游，不经过本站服务端
 *   2. 已登录且有服务端额度         → 走 /api/ai/chat（站点额度 或 托管 Key）
 *   3. 都没有                       → 抛出让用户去配置的错误
 *
 * 这样老用户行为不变（本地 Key 优先），新用户登录就能用，不会互相干扰。
 */

import { getLLMConfig, streamChatCompletion } from './universal-llm-client';
import { isLoggedIn, streamServerChat, type ServerAiStatus } from './server-ai';

export type AiRoute = 'local' | 'server';

export interface RunAiOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onMeta?: (meta: { source: string; provider: string; model: string; remaining: number }) => void;
}

/** 本地配置是否「已填 Key」（Ollama 例外：本机服务不需要 Key） */
export function hasLocalAiKey(): boolean {
  const cfg = getLLMConfig();
  if (cfg.provider === 'ollama') return Boolean(cfg.ollama?.baseUrl);
  if (cfg.provider === 'gemini') return Boolean(cfg.gemini?.apiKey);
  return Boolean(cfg.openai?.apiKey);
}

export async function runAiCompletion(options: RunAiOptions): Promise<{ route: AiRoute; text: string }> {
  if (hasLocalAiKey()) {
    const text = await streamChatCompletion({
      messages: options.messages,
      signal: options.signal,
      onChunk: options.onChunk,
    });
    return { route: 'local', text };
  }

  if (isLoggedIn()) {
    const text = await streamServerChat({
      messages: options.messages,
      signal: options.signal,
      onChunk: options.onChunk,
      onMeta: options.onMeta,
    });
    return { route: 'server', text };
  }

  throw new Error('还没有配置 AI：登录后可使用站点额度，或在设置里填写自己的 API Key');
}

/** 给设置面板用的一句话描述当前状态 */
export function describeAiRoute(status: ServerAiStatus | null): string {
  if (hasLocalAiKey()) return '本机 Key（不上传、不占用站点额度）';
  if (!isLoggedIn()) return '未登录 · 只能使用本机 Key';
  if (!status) return '服务端不可用 · 请填写本机 Key';
  if (status.hasOwnKey) return '账号托管 Key（' + status.keyMask + '，换设备登录即用）';
  if (status.siteAvailable) return '站点公共额度 · 今日剩余 ' + status.remaining + ' / ' + status.quota + ' 次';
  return '未配置 · 请填写自己的 Key';
}
