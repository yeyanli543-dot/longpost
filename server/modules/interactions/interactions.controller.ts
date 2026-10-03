import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import type {
  ToggleLikeRequest,
  ToggleLikeResponse,
  ToggleBookmarkRequest,
  ToggleBookmarkResponse,
  ToggleRepostRequest,
  ToggleRepostResponse,
} from '@shared/api.interface';

@Controller('api/interactions')
@UseGuards(JwtAuthGuard)
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post('like')
  async toggleLike(
    @Req() req: AuthRequest,
    @Body() body: ToggleLikeRequest,
  ): Promise<ToggleLikeResponse> {
    const userId = req.user!.id;
    return this.interactionsService.toggleLike(
      userId,
      body.contentType,
      body.contentId,
    );
  }

  @Post('bookmark')
  async toggleBookmark(
    @Req() req: AuthRequest,
    @Body() body: ToggleBookmarkRequest,
  ): Promise<ToggleBookmarkResponse> {
    const userId = req.user!.id;
    return this.interactionsService.toggleBookmark(userId, body.articleId);
  }

  @Post('repost')
  async toggleRepost(
    @Req() req: AuthRequest,
    @Body() body: ToggleRepostRequest,
  ): Promise<ToggleRepostResponse> {
    const userId = req.user!.id;
    return this.interactionsService.toggleRepost(
      userId,
      body.contentType,
      body.contentId,
      body.quoteContent,
    );
  }
}
