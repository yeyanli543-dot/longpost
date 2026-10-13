import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateUUIDParam } from '@server/common/utils/validation';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { AccessCodesService } from './access-codes.service';
import { LoginWithCodeDto } from './dto/login-with-code.dto';
import { CreateAccessCodeDto } from './dto/create-access-code.dto';
import { UpdateAccessCodeDto } from './dto/update-access-code.dto';
import { BatchCreateAccessCodeDto } from './dto/batch-create-access-code.dto';
import type {
  AccessCodeItem,
  AccessCodeListResponse,
  AccessCodeLogListResponse,
  AuthResponse,
  BatchCreateAccessCodeResponse,
} from '@shared/api.interface';
import { SetPasswordDto } from './dto/set-password.dto';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

@Controller('api')
export class AccessCodesController {
  constructor(
    private readonly accessCodesService: AccessCodesService,
    private readonly authService: AuthService,
  ) {}

  @Post('auth/access-code/login')
  async loginWithCode(
    @Req() req: Request,
    @Body() dto: LoginWithCodeDto,
  ): Promise<AuthResponse> {
    const forwarded = req.headers['x-forwarded-for'];
    const rawIp =
      req.ip ||
      (Array.isArray(forwarded) ? forwarded[0] : forwarded) ||
      null;
    const ip = typeof rawIp === 'string' ? rawIp : null;
    const rawUa = req.headers['user-agent'];
    const userAgent =
      (Array.isArray(rawUa) ? rawUa[0] : rawUa) || null;
    return this.accessCodesService.loginWithCode(dto.code, ip, userAgent);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/access-codes')
  async list(
    @Req() req: AuthRequest,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('keyword') keyword?: string,
  ): Promise<AccessCodeListResponse> {
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    const pageNum = parseInt(page, 10) || 1;
    const pageSizeNum = parseInt(pageSize, 10) || 20;
    return this.accessCodesService.list(pageNum, pageSizeNum, keyword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/access-codes')
  async create(
    @Req() req: AuthRequest,
    @Body() dto: CreateAccessCodeDto,
  ): Promise<AccessCodeItem> {
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    return this.accessCodesService.create(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/access-codes/batch')
  async batchCreate(
    @Req() req: AuthRequest,
    @Body() dto: BatchCreateAccessCodeDto,
  ): Promise<BatchCreateAccessCodeResponse> {
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    return this.accessCodesService.batchCreate(userId, dto.count, {
      role: dto.role,
      expiresAt: dto.expiresAt,
      maxUses: dto.maxUses,
      note: dto.note,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/access-codes/:id')
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccessCodeDto,
  ): Promise<AccessCodeItem> {
    validateUUIDParam(id, 'accessCodeId');
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    return this.accessCodesService.update(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('admin/access-codes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<void> {
    validateUUIDParam(id, 'accessCodeId');
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    await this.accessCodesService.delete(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/access-codes/:id/toggle')
  async toggleStatus(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'disabled' },
  ): Promise<AccessCodeItem> {
    validateUUIDParam(id, 'accessCodeId');
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    return this.accessCodesService.toggleStatus(id, userId, body.status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/access-codes/:id/logs')
  async getLogs(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<AccessCodeLogListResponse> {
    validateUUIDParam(id, 'accessCodeId');
    const userId = req.user?.id ?? '';
    await this.authService.ensureAdmin(userId);
    const pageNum = parseInt(page, 10) || 1;
    const pageSizeNum = parseInt(pageSize, 10) || 10;
    return this.accessCodesService.getLogs(id, pageNum, pageSizeNum);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/set-password')
  async setPassword(
    @Req() req: AuthRequest,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    const userId = req.user?.id ?? '';
    await this.accessCodesService.setPassword(
      userId,
      dto.password,
      dto.oldPassword,
    );
  }
}
