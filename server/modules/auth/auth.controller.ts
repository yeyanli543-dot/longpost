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
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  evaluateThrottle,
  registerFailure,
  registerSuccess,
  InMemoryThrottleStore,
} from '@server/common/security/login-throttle';
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
  /** 登录失败计数（进程内）。多实例部署时换成 Redis 即可，判定逻辑不变。 */
  private readonly loginThrottle = new InMemoryThrottleStore();

  constructor(
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto.email, dto.password, dto.nickname);
  }

  /**
   * 登录。
   *
   * 按「IP + 邮箱」做失败节流：同一组合连续失败 5 次锁 15 分钟。
   * 目的是挡掉密码爆破脚本，同时不误伤同一出口 IP 的其他用户
   * （所以 key 里带邮箱，而不是只按 IP）。
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = ip + '|' + String(dto.email || '').toLowerCase();
    const now = Date.now();

    const decision = evaluateThrottle(this.loginThrottle.get(key), now);
    if (!decision.allowed) {
      const minutes = Math.max(1, Math.ceil(decision.retryAfterMs / 60000));
      throw new HttpException(
        { message: `登录失败次数过多，请 ${minutes} 分钟后再试`, retryAfterMs: decision.retryAfterMs },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const result = await this.authService.login(dto.email, dto.password);
      this.loginThrottle.set(key, registerSuccess());
      return result;
    } catch (err) {
      // 只有「密码错」才计数；账号停用/封禁属于确定状态，不计
      if (err instanceof UnauthorizedException) {
        this.loginThrottle.set(key, registerFailure(decision.record, now));
      }
      throw err;
    }
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

  @Post('revoke-sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSessions(@Req() req: AuthRequest): Promise<{ success: boolean; message: string }> {
    await this.authService.revokeAllSessions(req.user!.id);
    return { success: true, message: '已成功注销所有设备的会话' };
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
