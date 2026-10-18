import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { encryptSecret, decryptSecret, maskKey } from '../server/common/utils/ai-crypto.ts';
import { evaluateQuota, consumeQuota, toDateKey } from '../server/common/utils/ai-quota.ts';
import {
  parseSse,
  parseNdjson,
  extractOpenAiDelta,
  extractGeminiDelta,
  toGeminiPayload,
} from '../server/common/utils/llm-stream.ts';

/** 把字符串包成一个假的 Response，用来驱动流式解析 */
function fakeResponse(text, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe('AI 密钥托管加密', () => {
  const secret = 'test-secret-for-unit';

  it('加密后能还原，且长度不泄露明文', () => {
    const plain = 'sk-abcdef1234567890';
    const cipher = encryptSecret(plain, secret);
    assert.notEqual(cipher, plain);
    assert.ok(cipher.startsWith('v1.'));
    assert.equal(decryptSecret(cipher, secret), plain);
  });

  it('同一明文两次加密结果不同（随机 IV）', () => {
    const a = encryptSecret('same-key', secret);
    const b = encryptSecret('same-key', secret);
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a, secret), 'same-key');
    assert.equal(decryptSecret(b, secret), 'same-key');
  });

  it('换 secret 或篡改密文都解不出来', () => {
    const cipher = encryptSecret('sk-secret', secret);
    assert.equal(decryptSecret(cipher, 'another-secret'), null);

    const parts = cipher.split('.');
    const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -2) + 'AA'].join('.');
    assert.equal(decryptSecret(tampered, secret), null);
  });

  it('空值与畸形输入一律返回 null，不抛异常', () => {
    assert.equal(decryptSecret(null, secret), null);
    assert.equal(decryptSecret('', secret), null);
    assert.equal(decryptSecret('garbage', secret), null);
    assert.equal(decryptSecret('v1.a.b', secret), null);
  });

  it('掩码只露出头尾', () => {
    assert.equal(maskKey('sk-1234567890abcdef'), 'sk-1…cdef');
    assert.equal(maskKey('short'), '****');
    assert.equal(maskKey(''), '');
  });
});

describe('AI 每日额度', () => {
  it('同一天累加，剩余递减', () => {
    const today = '2026-10-18';
    assert.deepEqual(evaluateQuota(null, today, 20), { date: today, used: 0, remaining: 20, allowed: true });

    const after = consumeQuota(null, today);
    assert.deepEqual(after, { date: today, count: 1 });
    assert.deepEqual(evaluateQuota(after, today, 20), { date: today, used: 1, remaining: 19, allowed: true });
  });

  it('跨天自动归零', () => {
    const record = { date: '2026-10-17', count: 99 };
    const decision = evaluateQuota(record, '2026-10-18', 20);
    assert.equal(decision.used, 0);
    assert.equal(decision.remaining, 20);
    assert.equal(decision.allowed, true);
  });

  it('额度用尽后拒绝', () => {
    const decision = evaluateQuota({ date: '2026-10-18', count: 20 }, '2026-10-18', 20);
    assert.equal(decision.remaining, 0);
    assert.equal(decision.allowed, false);
  });

  it('限额为 0 表示关闭公共额度', () => {
    assert.equal(evaluateQuota(null, '2026-10-18', 0).allowed, false);
  });

  it('toDateKey 输出 YYYY-MM-DD', () => {
    assert.match(toDateKey(new Date('2026-10-18T09:30:00Z')), /^2026-10-18$/);
  });
});

describe('LLM 流式解析', () => {
  it('OpenAI SSE：跨 chunk 拆包也能正确拼接', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const deltas = [];
    const full = await parseSse(fakeResponse(sse, 5), (d) => deltas.push(d));
    assert.equal(full, '你好');
    assert.deepEqual(deltas, ['你', '好']);
  });

  it('Gemini SSE：从 candidates[0].content.parts 取文本', async () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"第一段"}]}}]}',
      '',
      'data: {"candidates":[{"content":{"parts":[{"text":"第二段"}]}}]}',
      '',
    ].join('\n');
    const full = await parseSse(fakeResponse(sse), () => {});
    assert.equal(full, '第一段第二段');
  });

  it('Ollama NDJSON：按行解析 message.content', async () => {
    const ndjson = [
      '{"message":{"content":"甲"},"done":false}',
      '{"message":{"content":"乙"},"done":true}',
    ].join('\n');
    const full = await parseNdjson(fakeResponse(ndjson, 9), () => {});
    assert.equal(full, '甲乙');
  });

  it('坏行与注释行被跳过，不中断整条流', async () => {
    const sse = [': keep-alive', 'data: not-json', '', 'data: {"choices":[{"delta":{"content":"OK"}}]}', ''].join('\n');
    const full = await parseSse(fakeResponse(sse), () => {});
    assert.equal(full, 'OK');
  });

  it('delta 提取对缺失字段返回空串', () => {
    assert.equal(extractOpenAiDelta({}), '');
    assert.equal(extractOpenAiDelta({ choices: [] }), '');
    assert.equal(extractGeminiDelta({ candidates: [{}] }), '');
    assert.equal(extractGeminiDelta({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }), 'x');
  });

  it('toGeminiPayload 把 system 提出来放进 systemInstruction', () => {
    const payload = toGeminiPayload([
      { role: 'system', content: '你是编辑' },
      { role: 'user', content: '润色这段话' },
    ]);
    assert.equal(payload.contents.length, 1);
    assert.equal(payload.contents[0].role, 'user');
    assert.equal(payload.systemInstruction.parts[0].text, '你是编辑');
  });
});
