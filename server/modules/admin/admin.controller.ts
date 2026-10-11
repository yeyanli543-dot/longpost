import { Controller, Get, Post, Patch, Delete, Query, Body, Param, UseGuards, Req, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { validateUUIDParam } from '@server/common/utils/validation';
import type { Request } from 'express';
import {
  IsString,
  IsIn,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

import { AdminService } from './admin.service';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import type {
  AdminDashboardStats,
  AdminPostListResponse,
  AdminArticleListResponse,
  AdminCommentListResponse,
  AdminUserListResponse,
  ReportListResponse,
  ReportStatus,
  ModerationReviewRequest,
  AdminModerationPostListResponse,
  AdminModerationArticleListResponse,
} from '@shared/api.interface';

class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

class ReportListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @IsIn(['pending', 'resolved', 'ignored'])
  status?: ReportStatus;
}

class ContentActionDto {
  @IsString()
  @IsIn(['pin', 'unpin', 'feature', 'unfeature'])
  @Type(() => String)
  action!: 'pin' | 'unpin' | 'feature' | 'unfeature';
}

class BatchDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Type(() => String)
  ids!: string[];
}

class UserActionDto {
  @IsIn(['ban', 'unban', 'promote', 'demote'])
  action!: 'ban' | 'unban' | 'promote' | 'demote';

  @IsOptional()
  @IsString()
  reason?: string;
}

class ReportActionDto {
  @IsIn(['resolve_delete', 'resolve_ignore', 'ban_author'])
  action!: 'resolve_delete' | 'resolve_ignore' | 'ban_author';

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats(@Req() req: AuthRequest): Promise<AdminDashboardStats> {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    return this.adminService.getDashboardStats();
  }

  @Get('posts')
  async getPosts(@Req() req: AuthRequest, @Query() query: ListQueryDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    return this.adminService.getPostList(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword,
      query.sortBy ?? 'createdAt',
      query.sortOrder ?? 'desc',
    );
  }

  @Get('articles')
  async getArticles(@Req() req: AuthRequest, @Query() query: ListQueryDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    return this.adminService.getArticleList(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword,
      query.sortBy ?? 'createdAt',
      query.sortOrder ?? 'desc',
    );
  }

  @Get('comments')
  async getComments(@Req() req: AuthRequest, @Query() query: ListQueryDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    return this.adminService.getCommentList(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword,
    );
  }

  @Patch('posts/:id/action')
  async postAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ContentActionDto,
  ) {
    validateUUIDParam(id, 'postId');
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);

    switch (dto.action) {
      case 'pin':
        await this.adminService.pinContent('post', id, true);
        break;
      case 'unpin':
        await this.adminService.pinContent('post', id, false);
        break;
      case 'feature':
        await this.adminService.featureContent('post', id, true);
        break;
      case 'unfeature':
        await this.adminService.featureContent('post', id, false);
        break;
    }
    return { success: true };
  }

  @Patch('articles/:id/action')
  async articleAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ContentActionDto,
  ) {
    validateUUIDParam(id, 'articleId');
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);

    switch (dto.action) {
      case 'pin':
        await this.adminService.pinContent('article', id, true);
        break;
      case 'unpin':
        await this.adminService.pinContent('article', id, false);
        break;
      case 'feature':
        await this.adminService.featureContent('article', id, true);
        break;
      case 'unfeature':
        await this.adminService.featureContent('article', id, false);
        break;
    }
    return { success: true };
  }

  @Post('posts/batch-delete')
  async batchDeletePosts(@Req() req: AuthRequest, @Body() dto: BatchDeleteDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    const deleted = await this.adminService.batchDeletePosts(dto.ids);
    return { success: true, deleted };
  }

  @Post('articles/batch-delete')
  async batchDeleteArticles(@Req() req: AuthRequest, @Body() dto: BatchDeleteDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    const deleted = await this.adminService.batchDeleteArticles(dto.ids);
    return { success: true, deleted };
  }

  @Post('comments/batch-delete')
  async batchDeleteComments(@Req() req: AuthRequest, @Body() dto: BatchDeleteDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    const deleted = await this.adminService.batchDeleteComments(dto.ids);
    return { success: true, deleted };
  }

  @Get('users')
  async getUsers(@Req() req: AuthRequest, @Query() query: ListQueryDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    return this.adminService.getUserList(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword,
    );
  }

  @Patch('users/:id/action')
  async userAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UserActionDto,
  ) {
    validateUUIDParam(id, 'userId');
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);

    switch (dto.action) {
      case 'ban':
        await this.adminService.banUser(id, dto.reason);
        break;
      case 'unban':
        await this.adminService.unbanUser(id);
        break;
      case 'promote':
        await this.adminService.promoteToAdmin(id);
        break;
      case 'demote':
        await this.adminService.demoteFromAdmin(id);
        break;
    }
    return { success: true };
  }

  @Get('reports')
  async getReports(@Req() req: AuthRequest, @Query() query: ReportListQueryDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    return this.adminService.getReportList(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.status,
    );
  }

  @Patch('reports/:id/action')
  async reportAction(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ReportActionDto,
  ) {
    validateUUIDParam(id, 'reportId');
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
    await this.adminService.handleReport(id, userId, dto.action, dto.reason);
    return { success: true };
  }

  // ========== Moderation Queue ==========

  @Get('moderation/posts')
  @UseGuards(JwtAuthGuard)
  async getModerationPosts(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminModerationPostListResponse> {
    await this.ensureAdmin(req);
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 20;
    return this.adminService.getModerationPostList(p, ps);
  }

  @Get('moderation/articles')
  @UseGuards(JwtAuthGuard)
  async getModerationArticles(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminModerationArticleListResponse> {
    await this.ensureAdmin(req);
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 20;
    return this.adminService.getModerationArticleList(p, ps);
  }

  @Patch('moderation/posts/:id')
  @UseGuards(JwtAuthGuard)
  async reviewPost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ModerationReviewRequest,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'postId');
    await this.ensureAdmin(req);
    const { userId } = req.user || {};
    await this.adminService.reviewPost(id, body.status, body.reason, userId);
    return { success: true };
  }

  @Patch('moderation/articles/:id')
  @UseGuards(JwtAuthGuard)
  async reviewArticle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ModerationReviewRequest,
  ): Promise<{ success: true }> {
    validateUUIDParam(id, 'articleId');
    await this.ensureAdmin(req);
    const { userId } = req.user || {};
    await this.adminService.reviewArticle(id, body.status, body.reason, userId);
    return { success: true };
  }

  // ========== CSV Export ==========

  @Get('export/users.csv')
  @UseGuards(JwtAuthGuard)
  async exportUsers(@Req() req: any, @Res() res: any): Promise<void> {
    await this.ensureAdmin(req);
    const csv = await this.adminService.exportUsers();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(`\uFEFF${csv}`);
  }

  @Get('export/posts.csv')
  @UseGuards(JwtAuthGuard)
  async exportPosts(@Req() req: any, @Res() res: any): Promise<void> {
    await this.ensureAdmin(req);
    const csv = await this.adminService.exportPosts();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="posts.csv"');
    res.send(`\uFEFF${csv}`);
  }

  @Get('export/articles.csv')
  @UseGuards(JwtAuthGuard)
  async exportArticles(@Req() req: any, @Res() res: any): Promise<void> {
    await this.ensureAdmin(req);
    const csv = await this.adminService.exportArticles();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="articles.csv"');
    res.send(`\uFEFF${csv}`);
  }

  @Get('export/comments.csv')
  @UseGuards(JwtAuthGuard)
  async exportComments(@Req() req: any, @Res() res: any): Promise<void> {
    await this.ensureAdmin(req);
    const csv = await this.adminService.exportComments();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="comments.csv"');
    res.send(`\uFEFF${csv}`);
  }

  private async ensureAdmin(req: any): Promise<void> {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    await this.adminService.ensureAdmin(userId);
  }
}
