import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { buildStatusPage } from '@server/common/utils/newsletter';

@Controller('api/newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  /**
   * 订阅。
   * 无论邮箱是否已存在都返回 202 —— 不暴露「这个邮箱有没有订阅过」。
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.ACCEPTED)
  async subscribe(@Body() dto: SubscribeDto): Promise<{ ok: true }> {
    await this.newsletter.subscribe(dto.email, dto.source);
    return { ok: true };
  }

  /** 确认订阅（点邮件里的链接） */
  @Get('confirm')
  async confirm(@Query('token') token: string, @Res() res: Response): Promise<void> {
    const ok = await this.newsletter.confirm(token);
    const html = ok
      ? buildStatusPage({
          title: '订阅成功',
          message: '之后有新文章会发到这个邮箱。随时可以点邮件底部的退订链接。',
          siteName: process.env.SITE_NAME || 'LongPost',
        })
      : buildStatusPage({
          title: '链接无效',
          message: '这个确认链接已经用过，或者不是完整的链接。',
          siteName: process.env.SITE_NAME || 'LongPost',
        });
    res.status(ok ? 200 : 404).type('html').send(html);
  }

  /** 退订 */
  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string, @Res() res: Response): Promise<void> {
    const ok = await this.newsletter.unsubscribe(token);
    const html = ok
      ? buildStatusPage({
          title: '已退订',
          message: '不会再有新邮件了。如果想重新订阅，回到站点再填一次邮箱即可。',
          siteName: process.env.SITE_NAME || 'LongPost',
        })
      : buildStatusPage({
          title: '链接无效',
          message: '这个退订链接已经失效。',
          siteName: process.env.SITE_NAME || 'LongPost',
        });
    res.status(ok ? 200 : 404).type('html').send(html);
  }

  /** 公开的订阅人数，用于页面上显示「已有 N 位订阅者」 */
  @Get('stats')
  async stats(): Promise<{ enabled: boolean; count: number }> {
    return { enabled: this.newsletter.enabled, count: await this.newsletter.countActive() };
  }

  @Get('subscribers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async list(@Query('limit') limit?: string) {
    return this.newsletter.list(limit ? Number(limit) : 100);
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async export(@Res() res: Response): Promise<void> {
    const csv = await this.newsletter.exportCsv();
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"')
      .send(csv);
  }

  @Delete('subscribers/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.newsletter.remove(id);
    return { ok: true };
  }
}
