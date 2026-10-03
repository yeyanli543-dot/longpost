import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateUUIDParam } from '@server/common/utils/validation';
import { AuthService } from './auth.service';
import { JwtAuthGuard, OptionalJwtAuthGuard, type AuthRequest } from './jwt-auth.guard';
import { OAuthService } from './oauth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import type {
  AuthResponse,
  UserProfile,
  UpdateProfileRequest,
  UserPublicProfile,
  UserHomepageResponse,
  BookmarkListResponse,
} from '@shared/api.interface';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto.email, dto.password, dto.nickname);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(OptionalJwtAuthGuard)
  async getCurrentUser(@Req() req: AuthRequest): Promise<UserProfile | null> {
    if (!req.user) return null;
    return this.authService.getCurrentUser(req.user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: AuthRequest,
    @Body() dto: UpdateProfileRequest,
  ): Promise<UserProfile> {
    return this.authService.updateProfile(req.user!.id, {
      nickname: dto.nickname,
      avatarUrl: dto.avatarUrl,
      bio: dto.bio,
    });
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: AuthRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    await this.authService.changePassword(
      req.user!.id,
      dto.oldPassword,
      dto.newPassword,
    );
    return { success: true };
  }

  @Patch('preferences')
  @UseGuards(JwtAuthGuard)
  async updatePreferences(
    @Req() req: AuthRequest,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<UserProfile> {
    return this.authService.updatePreferences(req.user!.id, dto);
  }

  @Get('users/:id')
  async getUserProfile(@Param('id') id: string): Promise<UserPublicProfile> {
    validateUUIDParam(id, 'userId');
    return this.authService.getPublicProfile(id);
  }

  @Get('users/:id/homepage')
  async getUserHomepage(@Param('id') id: string): Promise<UserHomepageResponse> {
    validateUUIDParam(id, 'userId');
    return this.authService.getUserHomepage(id);
  }

  @Get('me/bookmarks')
  @UseGuards(JwtAuthGuard)
  async getMyBookmarks(@Req() req: AuthRequest): Promise<BookmarkListResponse> {
    return this.authService.getMyBookmarks(req.user!.id);
  }

  @Get('google/url')
  async getGoogleAuthUrl(
    @Req() req: Request,
    @Query('redirectTo') redirectTo?: string,
  ): Promise<{ url: string }> {
    const baseUrl = this.getBaseUrl(req);
    const url = await this.oauthService.getGoogleAuthUrl(redirectTo, baseUrl);
    return { url };
  }

  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state?: string,
  ): Promise<AuthResponse & { redirectTo?: string }> {
    const baseUrl = this.getBaseUrl(req);
    const { user, redirectTo } = await this.oauthService.handleGoogleCallback(
      code || '',
      state,
      baseUrl,
    );
    const token = await this.authService.oauthLogin(user.id, user.email);
    return { token, user, redirectTo };
  }

  private getBaseUrl(req: Request): string | undefined {
    const forwardedProto = req.headers['x-forwarded-proto'] as string | undefined;
    const forwardedHost = req.headers['x-forwarded-host'] as string | undefined;
    const host = forwardedHost || req.headers.host;
    const proto = forwardedProto || (req.headers['x-forwarded-scheme'] as string) || 'https';
    if (!host) return undefined;
    return `${proto}://${host}`;
  }

  @Get('wechat/url')
  getWechatAuthUrl(): { url: string } {
    return { url: this.oauthService.getWechatAuthUrl() };
  }

  @Get('wechat/callback')
  async wechatCallback(@Query('code') code: string): Promise<AuthResponse> {
    const { user } = await this.oauthService.handleWechatCallback(code || '');
    const token = await this.authService.oauthLogin(user.id, user.email);
    return { token, user };
  }
}
