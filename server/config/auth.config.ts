import * as dotenv from 'dotenv';

dotenv.config();

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

export const authConfig: AuthConfig = {
  jwtSecret: process.env.JWT_SECRET || 'longpost-dev-secret-key-change-in-production',
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
