import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

import { AdminService } from '../admin/admin.service';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import type { ReportContentType, ReportReason } from '@shared/api.interface';

class CreateReportDto {
  @IsString()
  @Type(() => String)
  @IsIn(['post', 'article', 'comment'])
  contentType!: ReportContentType;

  @IsString()
  contentId!: string;

  @IsString()
  @Type(() => String)
  @IsIn(['spam', 'misinformation', 'harassment', 'infringement', 'other'])
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('api/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  async createReport(@Req() req: AuthRequest, @Body() dto: CreateReportDto) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('未登录');
    const id = await this.adminService.createReport(
      userId,
      dto.contentType,
      dto.contentId,
      dto.reason,
      dto.description,
    );
    return { id, success: true };
  }
}
