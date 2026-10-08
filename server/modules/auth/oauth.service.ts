import {
  Injectable,
  NotImplementedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, count, ne } from 'drizzle-orm';
import { appUsers, siteSettings } from '../../database/schema';
import { authConfig } from '../../config/auth.config';
import { isOwnerEmail } from '../../config/owner.config';
import type { AuthUser } from '@shared/api.interface';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private async isGoogleLoginEnabled(): Promise<boolean> {
    const rows = await this.db
      .select({ googleLoginEnabled: siteSettings.googleLoginEnabled })
      .from(siteSettings)
      .where(eq(siteSettings.id, '00000000-0000-0000-0000-000000000001'))
      .limit(1);
    return rows[0]?.googleLoginEnabled ?? true;
  }

  async getGoogleAuthUrl(redirectTo?: string, baseUrl?: string): Promise<string> {
    if (!authConfig.google.enabled || !authConfig.google.clientId) {
      throw new NotImplementedException('Google 登录未启用');
    }
    const googleEnabled = await this.isGoogleLoginEnabled();
    if (!googleEnabled) {
      throw new BadRequestException('Google 登录已关闭');
    }
    const state = redirectTo
      ? Buffer.from(JSON.stringify({ redirectTo })).toString('base64url')
      : undefined;
    const redirectUri = this.resolveRedirectUri(baseUrl);
    const params = new URLSearchParams({
      client_id: authConfig.google.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });
    if (state) params.set('state', state);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private resolveRedirectUri(baseUrl?: string): string {
    const configured = authConfig.google.callbackUrl;
    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      return configured;
    }
    if (baseUrl) {
      const separator = configured.startsWith('?') || configured.startsWith('/') ? '' : '/';
      const path = configured.startsWith('/') ? configured : `/${configured}`;
      return `${baseUrl}${path}`;
    }
    return configured;
  }

  async handleGoogleCallback(
    code: string,
    state?: string,
    baseUrl?: string,
  ): Promise<{ user: AuthUser; isNewUser: boolean; redirectTo?: string }> {
    if (!authConfig.google.enabled) {
      throw new NotImplementedException('Google 登录未启用');
    }
    const googleEnabled = await this.isGoogleLoginEnabled();
    if (!googleEnabled) {
      throw new BadRequestException('Google 登录已关闭');
    }
    if (!code) {
      throw new BadRequestException('Missing authorization code');
    }

    let redirectTo: string | undefined;
    if (state) {
      try {
        const decoded = JSON.parse(
          Buffer.from(state, 'base64url').toString('utf-8'),
        );
        if (typeof decoded.redirectTo === 'string') {
          redirectTo = decoded.redirectTo;
        }
      } catch {
        // ignore invalid state
      }
    }

    try {
      const redirectUri = this.resolveRedirectUri(baseUrl);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: authConfig.google.clientId,
          client_secret: authConfig.google.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        this.logger.error(`Google token exchange failed: ${errorText}`);
        let message = 'Google 授权验证失败，请稍后重试';
        if (errorText.includes('redirect_uri_mismatch')) {
          message = 'Google 重定向 URI 不匹配，请在 Google Cloud Console 中检查「已获授权的重定向 URI」配置';
        } else if (errorText.includes('invalid_grant')) {
          message = '授权码已失效或不匹配，请重新发起 Google 登录';
        }
        throw new BadRequestException(message);
      }

      const tokenData = await tokenResponse.json();
      const idToken = tokenData.id_token;
      if (!idToken) {
        throw new BadRequestException('Google 未返回 ID token');
      }

      const userInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
      );
      if (!userInfoResponse.ok) {
        throw new BadRequestException('Google 用户信息获取失败');
      }

      const userInfo = await userInfoResponse.json();
      const email = userInfo.email;
      const providerId = userInfo.sub;
      const nickname = userInfo.name || email.split('@')[0];
      const avatarUrl = userInfo.picture || undefined;

      if (!email || !providerId) {
        throw new BadRequestException('Google 账户信息不完整');
      }

      const existing = await this.db
        .select({
          id: appUsers.id,
          email: appUsers.email,
          nickname: appUsers.nickname,
          avatarUrl: appUsers.avatarUrl,
          provider: appUsers.provider,
          role: appUsers.role,
          bio: appUsers.bio,
          createdAt: appUsers.createdAt,
        })
        .from(appUsers)
        .where(and(eq(appUsers.provider, 'google'), eq(appUsers.providerId, providerId)))
        .limit(1);

      let isNewUser = false;
      let user: AuthUser;

      if (existing.length > 0) {
        const promoted = await this.ensureOwnerRole(existing[0].id, email);
        user = {
          id: existing[0].id,
          email: existing[0].email,
          nickname: existing[0].nickname,
          avatarUrl: existing[0].avatarUrl,
          provider: existing[0].provider,
          role: (promoted ? 'admin' : existing[0].role) as 'admin' | 'user',
          bio: existing[0].bio,
          createdAt: existing[0].createdAt.toISOString(),
        };
      } else {
        const emailExisting = await this.db
          .select({ id: appUsers.id })
          .from(appUsers)
          .where(eq(appUsers.email, email))
          .limit(1);

        if (emailExisting.length > 0) {
          throw new BadRequestException(
            '该邮箱已通过其他方式注册，请使用原有方式登录',
          );
        }

        const [countRow] = await this.db
          .select({ count: count() })
          .from(appUsers);
        const isFirstUser = Number(countRow.count) === 0;

        const [inserted] = await this.db
          .insert(appUsers)
          .values({
            email,
            passwordHash: `oauth_google_${providerId}`,
            nickname,
            avatarUrl: avatarUrl ?? null,
            provider: 'google',
            providerId,
            role: isFirstUser || isOwnerEmail(email) ? 'admin' : 'user',
          })
          .returning({
            id: appUsers.id,
            email: appUsers.email,
            nickname: appUsers.nickname,
            avatarUrl: appUsers.avatarUrl,
            provider: appUsers.provider,
            role: appUsers.role,
            bio: appUsers.bio,
            createdAt: appUsers.createdAt,
          });

        isNewUser = true;
        user = {
          id: inserted.id,
          email: inserted.email,
          nickname: inserted.nickname,
          avatarUrl: inserted.avatarUrl,
          provider: inserted.provider,
          role: inserted.role as 'admin' | 'user',
          bio: inserted.bio,
          createdAt: inserted.createdAt.toISOString(),
        };
      }

      return { user, isNewUser, redirectTo };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Google OAuth callback error', error);
      throw new BadRequestException('Google 登录处理失败，请稍后重试');
    }
  }

  getWechatAuthUrl(): string {
    if (!authConfig.wechat.enabled || !authConfig.wechat.clientId) {
      throw new NotImplementedException('微信登录未启用');
    }
    const params = new URLSearchParams({
      appid: authConfig.wechat.clientId,
      redirect_uri: authConfig.wechat.callbackUrl,
      response_type: 'code',
      scope: 'snsapi_login',
    });
    return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
  }

  async handleWechatCallback(_code: string): Promise<{ user: AuthUser; isNewUser: boolean }> {
    if (!authConfig.wechat.enabled) {
      throw new NotImplementedException('微信登录未启用');
    }
    throw new NotImplementedException(
      '微信登录回调待实现：配置好 WECHAT_APP_ID 和 WECHAT_APP_SECRET 后，' +
      '使用微信开放平台 API 验证 code、获取用户信息、查找或创建 app_users 记录、返回 JWT',
    );
  }

  /**
   * 站长引导：OAuth（Google / 微信等）登录时，如果邮箱命中 OWNER_EMAIL，
   * 就把该账号提升为 admin。返回是否命中站长邮箱。
   */
  private async ensureOwnerRole(userId: string, email: string): Promise<boolean> {
    if (!isOwnerEmail(email)) return false;
    await this.db
      .update(appUsers)
      .set({ role: 'admin' })
      .where(and(eq(appUsers.id, userId), ne(appUsers.role, 'admin')));
    return true;
  }

  async findOrCreateOAuthUser(
    provider: string,
    providerId: string,
    email: string,
    nickname: string,
    avatarUrl?: string,
  ): Promise<AuthUser> {
    const existing = await this.db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        createdAt: appUsers.createdAt,
      })
      .from(appUsers)
      .where(and(eq(appUsers.provider, provider), eq(appUsers.providerId, providerId)))
      .limit(1);

    if (existing.length > 0) {
      const promoted = await this.ensureOwnerRole(existing[0].id, email);
      return {
        id: existing[0].id,
        email: existing[0].email,
        nickname: existing[0].nickname,
        avatarUrl: existing[0].avatarUrl,
        provider: existing[0].provider,
        role: (promoted ? 'admin' : existing[0].role) as 'admin' | 'user',
        bio: existing[0].bio,
        createdAt: existing[0].createdAt.toISOString(),
      };
    }

    const [inserted] = await this.db
      .insert(appUsers)
      .values({
        email,
        passwordHash: `oauth_${provider}_${providerId}`,
        nickname,
        avatarUrl: avatarUrl ?? null,
        provider,
        providerId,
        role: isOwnerEmail(email) ? 'admin' : 'user',
      })
      .returning({
        id: appUsers.id,
        email: appUsers.email,
        nickname: appUsers.nickname,
        avatarUrl: appUsers.avatarUrl,
        provider: appUsers.provider,
        role: appUsers.role,
        bio: appUsers.bio,
        createdAt: appUsers.createdAt,
      });

    return {
      id: inserted.id,
      email: inserted.email,
      nickname: inserted.nickname,
      avatarUrl: inserted.avatarUrl,
      provider: inserted.provider,
      role: inserted.role as 'admin' | 'user',
      bio: inserted.bio,
      createdAt: inserted.createdAt.toISOString(),
    };
  }
}
