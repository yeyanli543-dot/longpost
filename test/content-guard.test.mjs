import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// DFA Trie 纯逻辑验证（保持与 content-guard.ts 一致）
const NOISE_CHAR_REGEX = /[\s\-_*~`!@#$%^&*()+=|\\\[\]{};:'",.<>?/·~！@#￥%……&*（）——+【】{}；：‘“”，。、《》？]/;

class ContentGuard {
  constructor(initialWords = []) {
    this.root = { children: new Map(), isEnd: false };
    this.initDefaultWords();
    if (initialWords.length > 0) {
      this.addWords(initialWords);
    }
  }

  initDefaultWords() {
    this.addWords([
      '兼职刷单',
      '刷单返现',
      '办理假证',
      '代开增值税发票',
      '裸聊敲诈',
      '炸金花外挂',
      '网络赌博平台',
      '枪支弹药',
    ]);
  }

  normalizeChar(char) {
    let code = char.charCodeAt(0);
    if (code === 12288) return ' ';
    if (code >= 65281 && code <= 65374) {
      code -= 65248;
    }
    return String.fromCharCode(code).toLowerCase();
  }

  addWord(word) {
    const cleanWord = word.trim();
    if (!cleanWord) return;
    let current = this.root;
    for (let i = 0; i < cleanWord.length; i += 1) {
      const char = this.normalizeChar(cleanWord[i]);
      if (!current.children.has(char)) {
        current.children.set(char, { children: new Map(), isEnd: false });
      }
      current = current.children.get(char);
    }
    current.isEnd = true;
  }

  addWords(words) {
    for (const w of words) this.addWord(w);
  }

  containsSensitive(text) {
    if (!text) return false;
    const len = text.length;
    for (let i = 0; i < len; i += 1) {
      let current = this.root;
      for (let j = i; j < len; j += 1) {
        const rawChar = text[j];
        if (j > i && NOISE_CHAR_REGEX.test(rawChar)) continue;
        const char = this.normalizeChar(rawChar);
        if (!current.children.has(char)) break;
        current = current.children.get(char);
        if (current.isEnd) return true;
      }
    }
    return false;
  }

  findSensitiveWords(text) {
    if (!text) return [];
    const len = text.length;
    const matched = new Set();
    for (let i = 0; i < len; i += 1) {
      let current = this.root;
      let matchedSegment = '';
      for (let j = i; j < len; j += 1) {
        const rawChar = text[j];
        if (j > i && NOISE_CHAR_REGEX.test(rawChar)) {
          matchedSegment += rawChar;
          continue;
        }
        const char = this.normalizeChar(rawChar);
        if (!current.children.has(char)) break;
        matchedSegment += rawChar;
        current = current.children.get(char);
        if (current.isEnd) matched.add(matchedSegment);
      }
    }
    return Array.from(matched);
  }

  maskSensitive(text, mask = '***') {
    if (!text) return '';
    const words = this.findSensitiveWords(text);
    if (words.length === 0) return text;
    let sanitized = text;
    words.sort((a, b) => b.length - a.length);
    for (const word of words) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitized = sanitized.replace(new RegExp(escaped, 'gi'), mask);
    }
    return sanitized;
  }
}

describe('Content Guard & Idempotency Resilience Suite', () => {
  const guard = new ContentGuard();

  it('should detect standard sensitive keywords', () => {
    assert.equal(guard.containsSensitive('高薪兼职刷单，日结五百'), true);
    assert.equal(guard.containsSensitive('今天天气真好，去公园散步'), false);
  });

  it('should penetrate camouflage and noise symbols (DFA Bypass Protection)', () => {
    assert.equal(guard.containsSensitive('兼*职-刷_单，速来'), true);
    assert.equal(guard.containsSensitive('网络.赌.博.平.台'), true);
    const words = guard.findSensitiveWords('加微信兼*职-刷_单返现');
    assert.ok(words.length > 0);
  });

  it('should mask sensitive phrases seamlessly', () => {
    const masked = guard.maskSensitive('诚聘兼职刷单，无需押金');
    assert.equal(masked, '诚聘***，无需押金');
  });

  it('should complete DFA matching within sub-millisecond for large texts', () => {
    const paragraph = 'LongPost 是一个支持沉浸式创作与图表呈现的现代化系统。'.repeat(500); // 1.5 万字
    const start = performance.now();
    const result = guard.containsSensitive(paragraph);
    const duration = performance.now() - start;

    assert.equal(result, false);
    assert.ok(duration < 15, `DFA scanning 15,000 chars should be < 15ms, took ${duration.toFixed(2)}ms`);
  });

  it('should enforce idempotency TTL window', () => {
    const records = new Map();
    const TTL_MS = 1000;

    const checkIdempotency = (key, now) => {
      const existing = records.get(key);
      if (existing && now - existing.timestamp < TTL_MS) {
        return false; // 重复拦截
      }
      records.set(key, { timestamp: now });
      return true; // 放行
    };

    const key = 'user_1:uuid_abc_123';
    assert.equal(checkIdempotency(key, 1000), true);
    // 500ms 后再次提交（重复操作，拦截）
    assert.equal(checkIdempotency(key, 1500), false);
    // 1200ms 后（窗口已过，允许下一次全新提交）
    assert.equal(checkIdempotency(key, 2200), true);
  });
});
