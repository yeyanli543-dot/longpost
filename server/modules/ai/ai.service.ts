import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../database/database.module';
import { userAiSettings } from '../../database/schema';
import { decryptSecret, encryptSecret, maskKey } from '../../common/utils/ai-crypto';
import { consumeQuota, evaluateQuota, toDateKey } from '../../common/utils/ai-quota';
import { parseNdjson, parseSse, toGeminiPayload, type LlmProvider } from '../../common/utils/llm-stream';

export interface AiCredentials {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  /** 这把 Key 是用户自己的，还是站点公共的 */
  source: 'own' | 'site';
}

export interface AiStatus {
  /** 当前是否至少有一条可用途径 */
  enabled: boolean;
  /** 站点是否配了公共 Key */
  siteAvailable: boolean;
  /** 用户是否托管了自己的 Key */
  hasOwnKey: boolean;
  /** 生效中的服务商 / 模型（用于界面展示） */
  provider: string;
  model: string;
  /** 站点公共额度的上限与今日剩余（自有 Key 时这两项不参与） */
  quota: number;
  used: number;
  remaining: number;
  /** Key 的掩码，方便用户确认「是不是我上次填的那把」 */
  keyMask: string;
}

const DEFAULTS: Record<LlmProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  // ------------------------------------------------------------ 站点配置

  private get secret(): string {
    return process.env.AI_KEY_SECRET || process.env.JWT_SECRET || 'longpost-dev-secret';
  }

  private get siteProvider(): LlmProvider {
    const raw = (process.env.AI_SITE_PROVIDER || 'gemini').toLowerCase();
    return raw === 'openai' || raw === 'ollama' ? raw : 'gemini';
  }

  private get siteBaseUrl(): string {
    const preset = DEFAULTS[this.siteProvider];
    return (process.env.AI_SITE_BASE_URL || preset.baseUrl).replace(/\/+$/, '');
  }

  private get siteModel(): string {
    return process.env.AI_SITE_MODEL || DEFAULTS[this.siteProvider].model;
  }

  private get siteKey(): string {
    if (process.env.AI_SITE_KEY) return process.env.AI_SITE_KEY.trim();
    // 兼容早期原型里的变量名
    return (process.env.GEMINI_API_KEY || '').trim();
  }

  private get quotaLimit(): number {
    const raw = Number(process.env.AI_DAILY_QUOTA ?? '20');
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 20;
  }

  /** 站点是否具备提供公共额度的条件 */
  get siteAvailable(): boolean {
    if (!this.siteKey) return false;
    // ollama 跑在服务器上没意义（等于把本机模型暴露给所有人），站点模式只支持云厂商
    return this.siteProvider !== 'ollama';
  }

  // ------------------------------------------------------------ 用户配置

  private async getRow(userId: string) {
    const rows = await this.db
      .select()
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async upsertRow(userId: string, patch: Partial<typeof userAiSettings.$inferInsert>) {
    await this.db
      .insert(userAiSettings)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userAiSettings.userId,
        set: { ...patch, updatedAt: new Date() },
      });
  }

  async getStatus(userId: string): Promise<AiStatus> {
    const row = await this.getRow(userId);
    const ownKey = decryptSecret(row?.keyCipher, this.secret);
    const today = toDateKey();
    const decision = evaluateQuota(
      row?.quotaDate ? { date: row.quotaDate, count: row.quotaCount } : null,
      today,
      this.quotaLimit,
    );

    const useOwn = Boolean(ownKey);
    const provider = useOwn ? (row?.provider as LlmProvider) || 'openai' : this.siteProvider;
    const model = (useOwn ? row?.model : this.siteModel) || DEFAULTS[provider].model;

    return {
      enabled: useOwn || this.siteAvailable,
      siteAvailable: this.siteAvailable,
      hasOwnKey: useOwn,
      provider,
      model,
      quota: this.quotaLimit,
      used: decision.used,
      remaining: decision.remaining,
      keyMask: maskKey(ownKey),
    };
  }

  /** 保存 / 清除用户自带的 Key */
  async saveOwnKey(
    userId: string,
    input: { provider?: string; baseUrl?: string; model?: string; apiKey?: string },
  ): Promise<AiStatus> {
    const row = await this.getRow(userId);
    const nextProvider = (input.provider as LlmProvider) || (row?.provider as LlmProvider) || 'openai';
    if (!DEFAULTS[nextProvider]) {
      throw new BadRequestException('不支持的服务商');
    }

    const patch: Partial<typeof userAiSettings.$inferInsert> = {
      provider: nextProvider,
      baseUrl: input.baseUrl?.trim() || row?.baseUrl || DEFAULTS[nextProvider].baseUrl,
      model: input.model?.trim() || row?.model || DEFAULTS[nextProvider].model,
    };

    if (typeof input.apiKey === 'string') {
      const trimmed = input.apiKey.trim();
      patch.keyCipher = trimmed ? encryptSecret(trimmed, this.secret) : null;
    }

    await this.upsertRow(userId, patch);
    return this.getStatus(userId);
  }

  // ------------------------------------------------------------ 额度与调用

  /** 决定这次请求走谁的 Key；没有可用配置时返回 null */
  async resolveCredentials(userId: string): Promise<AiCredentials | null> {
    const row = await this.getRow(userId);
    const ownKey = decryptSecret(row?.keyCipher, this.secret);

    if (ownKey) {
      const provider = (row?.provider as LlmProvider) || 'openai';
      return {
        provider,
        baseUrl: (row?.baseUrl || DEFAULTS[provider].baseUrl).replace(/\/+$/, ''),
        model: row?.model || DEFAULTS[provider].model,
        apiKey: ownKey,
        source: 'own',
      };
    }

    if (!this.siteAvailable) return null;

    return {
      provider: this.siteProvider,
      baseUrl: this.siteBaseUrl,
      model: this.siteModel,
      apiKey: this.siteKey,
      source: 'site',
    };
  }

  /**
   * 扣减额度（仅站点公共 Key 会扣）。
   * 先扣再请求：这样中途断流也不会被白嫖。
   */
  async chargeQuota(userId: string, creds: AiCredentials): Promise<{ allowed: boolean; remaining: number; used: number }> {
    if (creds.source === 'own') {
      return { allowed: true, remaining: -1, used: 0 };
    }

    const row = await this.getRow(userId);
    const today = toDateKey();
    const decision = evaluateQuota(
      row?.quotaDate ? { date: row.quotaDate, count: row.quotaCount } : null,
      today,
      this.quotaLimit,
    );

    if (!decision.allowed) {
      return { allowed: false, remaining: 0, used: decision.used };
    }

    const next = consumeQuota({ date: row?.quotaDate ?? today, count: row?.quotaDate === today ? row?.quotaCount ?? 0 : 0 }, today);
    await this.upsertRow(userId, { quotaDate: next.date, quotaCount: next.count });
    return { allowed: true, remaining: Math.max(0, this.quotaLimit - next.count), used: next.count };
  }

  /** 发起流式请求，逐段回调；返回完整文本 */
  async stream(
    creds: AiCredentials,
    messages: Array<{ role: string; content: string }>,
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    const timeout = AbortSignal.timeout(120_000);
    const combined = AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal;

    if (creds.provider === 'ollama') {
      const res = await fetch(`${creds.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: creds.model, messages, stream: true }),
        signal: combined,
      });
      if (!res.ok) throw new BadRequestException(await this.describeError(res));
      return parseNdjson(res, onDelta);
    }

    if (creds.provider === 'gemini') {
      const url = `${creds.baseUrl}/v1beta/models/${encodeURIComponent(creds.model)}:streamGenerateContent?alt=sse`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': creds.apiKey },
        body: JSON.stringify(toGeminiPayload(messages)),
        signal: combined,
      });
      if (!res.ok) throw new BadRequestException(await this.describeError(res));
      return parseSse(res, onDelta);
    }

    const res = await fetch(`${creds.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(creds.apiKey ? { Authorization: `Bearer ${creds.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: creds.model, messages, stream: true, temperature: 0.7 }),
      signal: combined,
    });
    if (!res.ok) throw new BadRequestException(await this.describeError(res));
    return parseSse(res, onDelta);
  }

  private async describeError(res: Response): Promise<string> {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      detail = '';
    }
    this.logger.warn(`AI 上游返回 ${res.status}: ${detail}`);
    return `AI 上游返回异常: HTTP ${res.status}${detail ? ' · ' + detail : ''}`;
  }
}
