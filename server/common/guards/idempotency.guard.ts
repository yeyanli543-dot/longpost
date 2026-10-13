import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ConflictException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';

interface IdempotencyRecord {
  timestamp: number;
}

/**
 * 接口幂等性防护守卫
 *
 * 核心机制：
 * 1. 客户端在发帖、长文保存、评论、支付等易抖动场景传入 `x-idempotency-key` 请求头（通常为 UUID 或客户端毫秒唯一指纹）；
 * 2. 针对同一用户（或匿名 IP）的同一操作，在 30 秒内杜绝二次重放与并发并发连击；
 * 3. 内存滑动窗口维护，每 2 分钟自动清理过期键，零外部存储依赖与无内存泄漏风险。
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);
  private static readonly records = new Map<string, IdempotencyRecord>();
  private static readonly TTL_MS = 30 * 1000; // 30 秒防重重试窗口
  private static isCleanupScheduled = false;

  constructor() {
    IdempotencyGuard.ensureCleanupTask();
  }

  private static ensureCleanupTask(): void {
    if (this.isCleanupScheduled) return;
    this.isCleanupScheduled = true;

    // 每 2 分钟做一次轻量内存过期清理
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of IdempotencyGuard.records.entries()) {
        if (now - record.timestamp > IdempotencyGuard.TTL_MS) {
          IdempotencyGuard.records.delete(key);
        }
      }
    }, 2 * 60 * 1000).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const idempotencyKey = (
      req.headers['x-idempotency-key'] ||
      req.headers['idempotency-key']
    ) as string | undefined;

    // 客户端未显式传递幂等 Key 则直接放行
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return true;
    }

    const userId = req.user?.id || req.ip || 'anon';
    const compositeKey = `${userId}:${idempotencyKey.trim()}`;
    const now = Date.now();

    const existing = IdempotencyGuard.records.get(compositeKey);
    if (existing && now - existing.timestamp < IdempotencyGuard.TTL_MS) {
      this.logger.warn(`拦截到幂等重复提交: key=${compositeKey}`);
      throw new ConflictException('重复请求已拦截：该操作已在处理或近期已提交，请勿重复操作');
    }

    // 记录本次请求
    IdempotencyGuard.records.set(compositeKey, { timestamp: now });
    return true;
  }
}
