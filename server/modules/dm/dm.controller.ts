import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, OptionalJwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { DmService } from './dm.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { validateUUIDParam } from '@server/common/utils/validation';
import type {
  DMConversationListResponse,
  DMMessageListResponse,
  DMCreateConversationResponse,
  DMSendMessageResponse,
  DMUnreadCountResponse,
  DMSearchUserResponse,
} from '@shared/api.interface';

@Controller('api/dm')
export class DmController {
  constructor(private readonly dmService: DmService) {}

  @UseGuards(JwtAuthGuard)
  @Get('conversations')
  async getConversations(
    @Req() req: AuthRequest,
  ): Promise<DMConversationListResponse> {
    const userId = req.user!.id;
    return this.dmService.getConversations(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations')
  async createConversation(
    @Req() req: AuthRequest,
    @Body() dto: CreateConversationDto,
  ): Promise<DMCreateConversationResponse> {
    const userId = req.user!.id;
    return this.dmService.createConversation(userId, dto.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: AuthRequest,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<DMMessageListResponse> {
    validateUUIDParam(conversationId, 'conversationId');
    const userId = req.user!.id;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.dmService.getMessages(userId, conversationId, cursor, limitNum);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations/:id/messages')
  async sendMessage(
    @Req() req: AuthRequest,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<DMSendMessageResponse> {
    validateUUIDParam(conversationId, 'conversationId');
    const userId = req.user!.id;
    return this.dmService.sendMessage(userId, conversationId, dto.content);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('conversations/:id')
  async deleteConversation(
    @Req() req: AuthRequest,
    @Param('id') conversationId: string,
  ): Promise<{ success: true }> {
    validateUUIDParam(conversationId, 'conversationId');
    const userId = req.user!.id;
    return this.dmService.deleteConversation(userId, conversationId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('unread-count')
  async getUnreadCount(
    @Req() req: AuthRequest,
  ): Promise<DMUnreadCountResponse> {
    if (!req.user) {
      return { totalUnread: 0 };
    }
    return this.dmService.getUnreadCount(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search-users')
  async searchUsers(
    @Req() req: AuthRequest,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<DMSearchUserResponse> {
    const userId = req.user!.id;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.dmService.searchUsers(userId, q, limitNum);
  }
}
