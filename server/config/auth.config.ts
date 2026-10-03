import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';

dotenv.config();

const logger = new Logger('AuthConfig');

export interface OAuthProviderConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  google: OAuthProviderConfig;
  wechat: OAuthProviderConfig;
}

/** 开发环境专用兜底密钥。生产环境不会走到它——缺少 JWT_SECRET 时直接拒绝启动。 */
const DEV_ONLY_JWT_SECRET = 'longpost-dev-only-secret-not-for-production';

/**
 * 解析 JWT 签名密钥。
 *
 * 生产环境必须显式配置 JWT_SECRET。若把公开的默认值当作兜底，
 * 任何人都能拿它伪造出合法的登录令牌，因此这里选择启动即报错，
 * 而不是静默降级成一个全网可见的密钥。
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[AuthConfig] 缺少环境变量 JWT_SECRET：生产环境必须显式配置一个随机密钥。' +
        '参见 .env.example，建议使用 32 字节以上的随机字符串。',
    );
  }

  logger.warn(
    '未检测到 JWT_SECRET，开发环境使用内置临时密钥；请勿用于生产部署。',
  );
  return DEV_ONLY_JWT_SECRET;
}

export const authConfig: AuthConfig = {
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  google: {
    enabled:
      !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL || '/oauth/callback?provider=google',
  },
  wechat: {
    enabled: false,
    clientId: process.env.WECHAT_APP_ID || '',
    clientSecret: process.env.WECHAT_APP_SECRET || '',
    callbackUrl: process.env.WECHAT_CALLBACK_URL || '/oauth/callback?provider=wechat',
  },
};
