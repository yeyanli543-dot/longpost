import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { JwtAuthGuard, OptionalJwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { validateUUIDParam } from '@server/common/utils/validation';
import type {
  ArticleDetail,
  ArticleSummary,
  SearchResponse,
  CreateArticleResponse,
  UserArticlesResponse,
  AdminContentListResponse,
} from '@shared/api.interface';
import { AuthService } from '../auth/auth.service';

@Controller('api')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly authService: AuthService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('articles')
  async create(
    @Req() req: AuthRequest,
    @Body() dto: CreateArticleDto,
  ): Promise<CreateArticleResponse> {
    const userId: string = req.user!.id;
    return this.articlesService.create(
      dto.title,
      dto.content,
      dto.excerpt,
      userId,
      dto.images,
      dto.attachments,
      dto.coverUrl,
      dto.status,
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('articles/slug/:slug')
  async getBySlug(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
  ): Promise<ArticleDetail> {
    return this.articlesService.getDetail(slug, req.user?.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('articles/:id')
  async getDetail(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<ArticleDetail> {
    validateUUIDParam(id, 'articleId');
    return this.articlesService.getDetail(id, req.user?.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('articles')
  async getList(
    @Req() req: AuthRequest,
    @Query('authorId') authorId?: string,
  ): Promise<{ items: ArticleSummary[] }> {
    return this.articlesService.getList(authorId, req.user?.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('users/:userId/articles')
  async getUserArticles(
    @Req() req: AuthRequest,
    @Param('userId') userId: string,
  ): Promise<UserArticlesResponse> {
    validateUUIDParam(userId, 'userId');
    return this.articlesService.getUserArticles(userId, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/articles')
  async getMyArticles(@Req() req: AuthRequest): Promise<UserArticlesResponse> {
    return this.articlesService.getUserArticles(req.user!.id, req.user!.id);
  }

  @Get('search')
  async globalSearch(
    @Query('q') q: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<SearchResponse> {
    const safeType: 'all' | 'posts' | 'articles' | 'users' | 'hashtags' =
      type === 'posts' || type === 'articles' || type === 'users' || type === 'hashtags'
        ? type
        : 'all';
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    return this.articlesService.search(q || '', safeType, pageNum, pageSizeNum);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('articles/:id')
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<void> {
    validateUUIDParam(id, 'articleId');
    const userId: string = req.user!.id;
    await this.articlesService.update(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/content')
  async getAdminContent(
    @Req() req: AuthRequest,
    @Query('type') type?: string,
    @Query('q') q?: string,
  ): Promise<AdminContentListResponse> {
    const userId: string = req.user!.id;
    await this.authService.ensureAdmin(userId);
    const safeType: 'post' | 'article' | 'all' =
      type === 'post' || type === 'article' ? type : 'all';
    return this.articlesService.getAdminContent(safeType, q);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('articles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    validateUUIDParam(id, 'articleId');
    const userId: string = req.user!.id;
    await this.articlesService.delete(id, userId);
  }
}
