/**
 * 服务端 AI 网关客户端
 *
 * 两种能力：
 *   1. 站点公共额度 —— 站长在 .env 配一把 Key，登录用户直接可用（按日限次）
 *   2. 个人 Key 托管 —— 用户把自己的 Key 加密存到服务端，换设备登录即可用
 *
 * 与「本地 Key」模式的区别：本地模式下 Key 只在这台设备的 localStorage 里，
 * 换浏览器就得重填；托管模式则由服务端保管（AES-256-GCM 加密）。
 */

import { axiosForBackend } from '@/lib/axios';
import { getToken } from '@/api/token-storage';

export interface ServerAiStatus {
  enabled: boolean;
  siteAvailable: boolean;
  hasOwnKey: boolean;
  provider: string;
  model: string;
  quota: number;
  used: number;
  remaining: number;
  keyMask: string;
}

export interface ServerAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function apiBase(): string {
  const base = axiosForBackend.defaults.baseURL || '/';
  return String(base).replace(/\/+$/, '');
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

/** 读取服务端 AI 能力（未登录或接口不可用时返回 null，调用方按「不可用」处理） */
export async function fetchServerAiStatus(): Promise<ServerAiStatus | null> {
  if (!isLoggedIn()) return null;
  try {
    const res = await axiosForBackend.get('/api/ai/status');
    const data = res.data as ServerAiStatus;
    return data && typeof data.enabled === 'boolean' ? data : null;
  } catch {
    return null;
  }
}

/** 托管 / 更新 / 清除自己的 Key（apiKey 传空串即清除） */
export async function saveServerAiKey(payload: {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<ServerAiStatus> {
  const res = await axiosForBackend.put('/api/ai/key', payload);
  return res.data as ServerAiStatus;
}

/**
 * 走服务端网关做一次流式对话。
 * 服务端用 SSE 回传，事件体形如 {delta} / {done,text} / {error} / {meta}。
 */
export async function streamServerChat(options: {
  messages: ServerAiMessage[];
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onMeta?: (meta: { source: string; provider: string; model: string; remaining: number }) => void;
}): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('未登录：请先登录，或在设置里填写自己的 API Key');

  const res = await fetch(apiBase() + '/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ messages: options.messages }),
    signal: options.signal,
  });

  if (!res.ok) {
    // 429 是额度用尽，400 是没配置；两者都需要让用户看见具体文案
    let message = 'AI 请求失败（HTTP ' + res.status + '）';
    try {
      const data = await res.json();
      if (data && data.message) message = Array.isArray(data.message) ? data.message.join('；') : data.message;
    } catch {
      /* 忽略 */
    }
    throw new Error(message);
  }

  if (!res.body) throw new Error('当前浏览器不支持流式响应');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let payload: any;
      try {
        payload = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (payload.meta && options.onMeta) options.onMeta(payload.meta);
      if (payload.error) throw new Error(payload.error);
      if (payload.delta) {
        full += payload.delta;
        options.onChunk(payload.delta);
      }
      if (payload.done && typeof payload.text === 'string' && !full) {
        full = payload.text;
        options.onChunk(payload.text);
      }
    }
  }

  return full;
}
