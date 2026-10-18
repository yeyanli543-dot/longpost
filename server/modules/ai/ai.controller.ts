import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { AiChatDto, AiKeyDto } from './dto/ai.dto';

@Controller('api/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly ai: AiService) {}

  /** 当前用户能用什么：站点额度还剩几次、是不是托管了自己的 Key */
  @Get('status')
  async status(@Req() req: AuthRequest) {
    return this.ai.getStatus(req.user!.id);
  }

  /** 托管 / 更新 / 清除自己的 Key */
  @Put('key')
  async saveKey(@Req() req: AuthRequest, @Body() dto: AiKeyDto) {
    return this.ai.saveOwnKey(req.user!.id, dto);
  }

  @Delete('key')
  @HttpCode(HttpStatus.OK)
  async clearKey(@Req() req: AuthRequest) {
    return this.ai.saveOwnKey(req.user!.id, { apiKey: '' });
  }

  /**
   * 流式对话。
   *
   * 用 SSE 而不是普通 JSON：写作时逐字出现才有"在思考"的反馈。
   * 这里手动接管 Response，不经过 Nest 的返回管线 —— 一旦开始写 SSE，
   * 再抛异常就会变成 "headers already sent"，所以错误都走事件体里的 error 字段。
   */
  @Post('chat')
  async chat(@Req() req: AuthRequest, @Body() dto: AiChatDto, @Res() res: Response): Promise<void> {
    const userId = req.user!.id;

    const fail = (status: number, message: string) => {
      res.status(status).json({ message });
    };

    let creds;
    try {
      creds = await this.ai.resolveCredentials(userId);
    } catch (err) {
      this.logger.error('解析 AI 凭据失败', err as Error);
      return fail(500, '读取 AI 配置失败');
    }

    if (!creds) {
      return fail(400, '还没有可用的 AI 配置：请在设置里填写自己的 API Key，或让站长配置站点额度');
    }

    let charge;
    try {
      charge = await this.ai.chargeQuota(userId, creds);
    } catch (err) {
      this.logger.error('扣减 AI 额度失败', err as Error);
      return fail(500, '额度校验失败');
    }

    if (!charge.allowed) {
      return fail(429, '今日站点额度已用完。填写自己的 API Key 后可以不受限制。');
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    const send = (payload: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // 先把「这次走谁的 Key、还剩几次」告诉前端，界面可以立刻更新额度显示
    send({
      meta: {
        source: creds.source,
        provider: creds.provider,
        model: creds.model,
        remaining: charge.remaining,
      },
    });

    try {
      const text = await this.ai.stream(
        creds,
        dto.messages.map((m) => ({ role: m.role, content: m.content })),
        (delta) => send({ delta }),
        abort.signal,
      );
      send({ done: true, text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AI 流式中断: ${message}`);
      send({ error: message });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
