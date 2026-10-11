import type { Request } from 'express';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
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

    if (!payload) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    const user = await this.authService.validateUserActive(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('账号不存在或已被停用');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('账号已被封禁');
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
      if (payload) {
        const user = await this.authService.validateUserActive(payload.sub);
        if (user && user.isActive && !user.isBanned) {
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
