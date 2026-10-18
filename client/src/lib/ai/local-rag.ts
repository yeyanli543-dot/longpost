import { logger } from '@/lib/logger';
import { platform } from '@/lib/platform';

export interface DocumentChunk {
  id: string;
  articleId?: string;
  title: string;
  text: string;
  tokens: string[];
}

export interface RAGSearchResult {
  title: string;
  snippet: string;
  score: number;
}

/** 常见中文/英文无实际语义停用词过滤 */
const STOP_WORDS = new Set([
  '的', '了', '和', '是', '在', '我', '有', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '与', '及', '等', '或者', '这个', '那个', '其', '之',
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'it', 'that',
]);

/**
 * 纯前端高性能切词器（中文 Bigram 双字滑动窗口 + 英文单词分词）
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const clean = text.toLowerCase();
  const tokens: string[] = [];

  // 1. 提取英文字词与数字
  const enMatches = clean.match(/[a-z0-9_-]+/g);
  if (enMatches) {
    for (const word of enMatches) {
      if (word.length >= 2 && !STOP_WORDS.has(word)) {
        tokens.push(word);
      }
    }
  }

  // 2. 提取中文字符串并进行 Bigram 双字滑动切分
  const cnBlocks = clean.match(/[\u4e00-\u9fa5]+/g);
  if (cnBlocks) {
    for (const block of cnBlocks) {
      if (block.length === 1 && !STOP_WORDS.has(block)) {
        tokens.push(block);
      } else {
        // 双字切词
        for (let i = 0; i < block.length - 1; i++) {
          const bigram = block.slice(i, i + 2);
          if (!STOP_WORDS.has(bigram)) {
            tokens.push(bigram);
          }
        }
        // 如果整词较短（3-4字），整体作为一个 token
        if (block.length >= 3 && block.length <= 4 && !STOP_WORDS.has(block)) {
          tokens.push(block);
        }
      }
    }
  }

  return tokens;
}

/**
 * 将长文章切片为 150 - 350 字的语义片段
 */
export function chunkArticleContent(
  title: string,
  content: string,
  articleId?: string,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  if (!content || !content.trim()) return chunks;

  // 按换行和双回车初切段落
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('---'));

  let currentBlock = '';
  let chunkIdx = 0;

  for (const p of paragraphs) {
    if (currentBlock.length + p.length > 300) {
      if (currentBlock.trim().length > 30) {
        chunks.push({
          id: `${articleId || 'doc'}-chunk-${chunkIdx++}`,
          articleId,
          title,
          text: currentBlock.trim(),
          tokens: tokenizeText(currentBlock),
        });
      }
      currentBlock = p;
    } else {
      currentBlock = currentBlock ? `${currentBlock}\n\n${p}` : p;
    }
  }

  if (currentBlock.trim().length > 30) {
    chunks.push({
      id: `${articleId || 'doc'}-chunk-${chunkIdx++}`,
      articleId,
      title,
      text: currentBlock.trim(),
      tokens: tokenizeText(currentBlock),
    });
  }

  return chunks;
}

/**
 * 计算 BM25 相关性得分
 */
function scoreBM25(
  queryTokens: string[],
  docTokens: string[],
  docLen: number,
  avgDocLen: number,
  idfMap: Map<string, number>,
): number {
  const k1 = 1.5;
  const b = 0.75;
  let score = 0;

  // 统计 docTokens 中的词频
  const tfMap = new Map<string, number>();
  for (const t of docTokens) {
    tfMap.set(t, (tfMap.get(t) || 0) + 1);
  }

  for (const q of queryTokens) {
    const tf = tfMap.get(q) || 0;
    if (tf === 0) continue;

    const idf = idfMap.get(q) || 0.1;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + (b * docLen) / (avgDocLen || 1));
    score += idf * (numerator / denominator);
  }

  return score;
}

// 内存单例倒排索引缓存
let cachedChunks: DocumentChunk[] = [];
let cachedIdfMap = new Map<string, number>();
let lastIndexedTime = 0;

/**
 * 刷新并建立全库文章的 RAG 倒排索引
 */
export async function buildOrRefreshIndex(): Promise<void> {
  try {
    const articles = await platform.listArticlesLocal();
    const allChunks: DocumentChunk[] = [];

    for (const art of articles) {
      if (!art.content) continue;
      const chunks = chunkArticleContent(art.title || '未命名', art.content, art.id);
      allChunks.push(...chunks);
    }

    if (allChunks.length === 0) {
      cachedChunks = [];
      cachedIdfMap.clear();
      return;
    }

    // 计算 IDF (逆文档频率)
    const N = allChunks.length;
    const dfMap = new Map<string, number>();

    for (const chunk of allChunks) {
      const uniqueTokens = new Set(chunk.tokens);
      for (const t of uniqueTokens) {
        dfMap.set(t, (dfMap.get(t) || 0) + 1);
      }
    }

    const idfMap = new Map<string, number>();
    for (const [token, df] of dfMap.entries()) {
      // 标准 Lucene BM25 IDF: ln(1 + (N - df + 0.5) / (df + 0.5))
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      idfMap.set(token, Math.max(0.05, idf));
    }

    cachedChunks = allChunks;
    cachedIdfMap = idfMap;
    lastIndexedTime = Date.now();
    logger.info(`本地 RAG 倒排索引构建成功，包含 ${allChunks.length} 个知识切片`);
  } catch (err) {
    logger.warn('构建本地 RAG 索引失败', err);
  }
}

/**
 * 毫秒级语义检索：根据提问检索出最匹配的 Top K 文章片段
 */
export async function searchLocalKnowledge(
  query: string,
  topK = 3,
): Promise<RAGSearchResult[]> {
  if (!query || !query.trim()) return [];

  // 若尚未索引或距离上次索引超过 30 秒，触发一次轻量刷新
  if (cachedChunks.length === 0 || Date.now() - lastIndexedTime > 30000) {
    await buildOrRefreshIndex();
  }

  if (cachedChunks.length === 0) return [];

  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return [];

  const totalLen = cachedChunks.reduce((acc, c) => acc + c.tokens.length, 0);
  const avgLen = totalLen / cachedChunks.length;

  const scored = cachedChunks.map((chunk) => {
    const score = scoreBM25(
      queryTokens,
      chunk.tokens,
      chunk.tokens.length,
      avgLen,
      cachedIdfMap,
    );
    return {
      title: chunk.title,
      snippet: chunk.text,
      score,
    };
  });

  // 按得分倒序，并过滤零相关片段
  const results = scored
    .filter((s) => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

/**
 * 将检索到的知识上下文格式化为可直接注入 System Prompt 的文本
 */
export function formatRAGContextPrompt(results: RAGSearchResult[]): string {
  if (results.length === 0) return '';

  const parts = results.map(
    (r, idx) => `[参考来源 ${idx + 1}] 《${r.title}》:\n${r.snippet}`,
  );

  return `\n\n【本地知识库参考上下文 (供优先参考)】:\n${parts.join('\n\n')}\n`;
}
