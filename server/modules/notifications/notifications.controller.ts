import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  type AuthRequest,
} from '../auth/jwt-auth.guard';
import type {
  NotificationListResponse,
  MarkNotificationsReadRequest,
} from '@shared/api.interface';

@Controller('api/notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<NotificationListResponse> {
    const userId = req.user!.id;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.notificationsService.list(userId, cursor, parsedLimit);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('unread-count')
  async unreadCount(
    @Req() req: AuthRequest,
  ): Promise<{ unreadCount: number }> {
    if (!req.user) {
      return { unreadCount: 0 };
    }
    // 未读数只是导航栏上的角标，查不出来不该把整个页面拖成报错，降级为 0
    try {
      const count = await this.notificationsService.getUnreadCount(req.user.id);
      return { unreadCount: count };
    } catch (err) {
      this.logger.warn(
        `未读数查询失败，降级为 0：${err instanceof Error ? err.message : String(err)}`,
      );
      return { unreadCount: 0 };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('read')
  async markRead(
    @Req() req: AuthRequest,
    @Body() body: MarkNotificationsReadRequest,
  ): Promise<{ success: true }> {
    const userId = req.user!.id;
    return this.notificationsService.markRead(userId, body);
  }
}
