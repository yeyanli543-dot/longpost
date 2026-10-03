import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, OptionalJwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { validateUUIDParam } from '@server/common/utils/validation';
import type {
  CommentItem,
  CommentListResponse,
  ToggleCommentLikeResponse,
  CommentSortMode,
} from '@shared/api.interface';

@Controller('api')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('comments')
  async listComments(
    @Req() req: AuthRequest,
    @Query('contentType') contentType: string,
    @Query('contentId') contentId: string,
    @Query('sort') sort?: CommentSortMode,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<CommentListResponse> {
    validateUUIDParam(contentId, 'contentId');
    const currentUserId = req.user?.id;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.commentsService.listByContent(
      contentType,
      contentId,
      sort ?? 'time',
      cursor,
      parsedLimit,
      currentUserId,
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('comments/:commentId/replies')
  async listReplies(
    @Req() req: AuthRequest,
    @Param('commentId') commentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<CommentListResponse> {
    validateUUIDParam(commentId, 'commentId');
    const currentUserId = req.user?.id;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.commentsService.listReplies(
      commentId,
      cursor,
      parsedLimit,
      currentUserId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('comments')
  async createComment(
    @Req() req: AuthRequest,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentItem> {
    const userId = req.user!.id;
    return this.commentsService.create(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('comments/:commentId/like')
  async toggleCommentLike(
    @Req() req: AuthRequest,
    @Param('commentId') commentId: string,
  ): Promise<ToggleCommentLikeResponse> {
    validateUUIDParam(commentId, 'commentId');
    const userId = req.user!.id;
    return this.commentsService.toggleCommentLike(userId, commentId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<void> {
    validateUUIDParam(id, 'commentId');
    const userId = req.user!.id;
    await this.commentsService.delete(id, userId);
  }
}
