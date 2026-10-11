import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthRequest } from './jwt-auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('请先登录');
    }

    const isAdmin = await this.authService.isAdmin(userId);
    if (!isAdmin) {
      throw new ForbiddenException('无管理员权限');
    }

    return true;
  }
}
