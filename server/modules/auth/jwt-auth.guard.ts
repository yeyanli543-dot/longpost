import type { Request } from 'express';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { isTokenVersionMismatched } from '@server/common/utils/token-version';
import { isAccessTokenPayloadUsable } from '@server/common/utils/jwt-payload';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
  userContext?: {
    userId?: string;
    userType?: string;
    [key: string]: any;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('请先登录');
    }

    const token = authHeader.slice(7);
    const payload = this.authService.verifyToken(token);

    if (!isAccessTokenPayloadUsable(payload)) {
      throw new UnauthorizedException('无效的访问令牌类型或载荷');
    }

    const user = await this.authService.validateUserActive(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('账号不存在或已被停用');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('账号已被封禁');
    }
    // 改密码/踢下线后 tokenVersion 会 +1，旧 token 立即失效
    if (isTokenVersionMismatched(payload, user)) {
      throw new UnauthorizedException('登录凭证已失效，请重新登录');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    request.userContext = {
      ...(request.userContext ?? {}),
      userId: payload.sub,
      userType: '_employee',
    };

    return true;
  }
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return true;
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.authService.verifyToken(token);
      if (payload && (payload as any).type !== 'refresh') {
        const user = await this.authService.validateUserActive(payload.sub);
        if (
          user &&
          user.isActive &&
          !user.isBanned &&
          (payload.tokenVersion === undefined ||
            user.tokenVersion === undefined ||
            payload.tokenVersion === user.tokenVersion)
        ) {
          request.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
          request.userContext = {
            ...(request.userContext ?? {}),
            userId: payload.sub,
            userType: '_employee',
          };
        }
      }
    } catch {
      // 无效token也放行，当作未登录处理
    }

    return true;
  }
}
