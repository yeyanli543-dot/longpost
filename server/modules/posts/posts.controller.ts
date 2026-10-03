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
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { validateUUIDParam } from '@server/common/utils/validation';
import type {
  CreatePostResponse,
  PostItem,
  TimelineResponse,
  UserPostsResponse,
} from '@shared/api.interface';

@Controller('api')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('posts')
  async createPost(
    @Req() req: AuthRequest,
    @Body() dto: CreatePostDto,
  ): Promise<CreatePostResponse> {
    const userId = req.user!.id;
    return this.postsService.create(userId, dto.content, dto.articleId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('timeline')
  async getTimeline(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('view') view?: string,
  ): Promise<TimelineResponse> {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const safeLimit = Math.min(Math.max(limitNum, 1), 50);
    const cursorVal = cursor && cursor.trim() !== '' ? cursor : null;
    const safeView: 'all' | 'following' | 'hot' =
      view === 'following' || view === 'hot' ? view : 'all';

    const currentUserId = req.user?.id;

    return this.postsService.getTimeline(cursorVal, safeLimit, safeView, currentUserId);
  }

  @Get('posts/:id')
  async getPostById(@Param('id') id: string): Promise<PostItem> {
    validateUUIDParam(id, 'postId');
    return this.postsService.getPostById(id);
  }

  @Get('users/:userId/posts')
  async getUserPosts(@Param('userId') userId: string): Promise<UserPostsResponse> {
    validateUUIDParam(userId, 'userId');
    const items = await this.postsService.getUserPosts(userId);
    return { items };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/posts')
  async getMyPosts(@Req() req: AuthRequest): Promise<UserPostsResponse> {
    const items = await this.postsService.getUserPosts(req.user!.id);
    return { items };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePost(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    validateUUIDParam(id, 'postId');
    const userId = req.user!.id;
    await this.postsService.deletePost(id, userId);
  }
}
