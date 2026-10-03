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

  canActivate(context: ExecutionContext): boolean {
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

    request.user = {
      id: payload.sub,
      email: payload.email,
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

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return true;
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.authService.verifyToken(token);
      if (payload) {
        request.user = {
          id: payload.sub,
          email: payload.email,
        };
        request.userContext = {
          ...(request.userContext ?? {}),
          userId: payload.sub,
          userType: '_employee',
        };
      }
    } catch {
      // 无效token也放行，当作未登录处理
    }

    return true;
  }
}
