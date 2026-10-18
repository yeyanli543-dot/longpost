/**
 * 大模型流式响应解析（服务端版本）
 *
 * 三种协议：
 *   - openai：`data: {...}` SSE，增量在 choices[0].delta.content
 *   - gemini：`data: {...}` SSE，增量在 candidates[0].content.parts[].text
 *   - ollama：NDJSON，每行一个 JSON，增量在 message.content
 *
 * 抽成独立模块的原因：解析逻辑最容易写出边界 bug（拆包、半行、[DONE]），
 * 单独放出来才能用假 Response 直接测。
 */

export type LlmProvider = 'openai' | 'gemini' | 'ollama';

/** 按行切分 ReadableStream */
async function* readLines(res: Response): AsyncGenerator<string> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      yield line;
    }
  }
  if (buf.trim()) yield buf;
}

/** 解析 SSE 并逐段回调，返回拼接后的全文 */
export async function parseSse(res: Response, onDelta: (text: string) => void): Promise<string> {
  let full = '';
  for await (const raw of readLines(res)) {
    const line = raw.trim();
    if (!line || line.startsWith(':') || line.startsWith('event:')) continue;
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') continue;
    let json: any;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }
    const text = extractOpenAiDelta(json) || extractGeminiDelta(json);
    if (text) {
      full += text;
      onDelta(text);
    }
  }
  return full;
}

/** 解析 Ollama 的 NDJSON */
export async function parseNdjson(res: Response, onDelta: (text: string) => void): Promise<string> {
  let full = '';
  for await (const raw of readLines(res)) {
    const line = raw.trim();
    if (!line) continue;
    let json: any;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const text = json && json.message && typeof json.message.content === 'string' ? json.message.content : '';
    if (text) {
      full += text;
      onDelta(text);
    }
  }
  return full;
}

export function extractOpenAiDelta(json: any): string {
  const delta = json && json.choices && json.choices[0] && json.choices[0].delta;
  return delta && typeof delta.content === 'string' ? delta.content : '';
}

export function extractGeminiDelta(json: any): string {
  const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content
    ? json.candidates[0].content.parts
    : null;
  if (!Array.isArray(parts)) return '';
  return parts.map((p: any) => (p && typeof p.text === 'string' ? p.text : '')).join('');
}

/** 把统一的 messages 转成 Gemini 的 contents / systemInstruction */
export function toGeminiPayload(
  messages: Array<{ role: string; content: string }>,
): { contents: Array<{ role: string; parts: Array<{ text: string }> }>; systemInstruction?: { parts: Array<{ text: string }> } } {
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  return systemText
    ? { contents, systemInstruction: { parts: [{ text: systemText }] } }
    : { contents };
}
