import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface UserEntity {
  id: string;
  email: string;
  nickname: string;
  passwordHash: string;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  // Mock DB store for isolated testing or pluggable Drizzle DB
  private users: Map<string, UserEntity> = new Map();

  constructor(private readonly jwtService: JwtService) {}

  issueTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, type: 'access' },
      { expiresIn: '1h' }
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, type: 'refresh' },
      { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
  }

  async register(email: string, password: string, nickname: string) {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !password) {
      throw new BadRequestException('邮箱和密码不能为空');
    }

    try {
      if (this.users.has(normalizedEmail)) {
        const error: any = new Error('Unique constraint violation');
        error.code = '23505';
        throw error;
      }

      const id = crypto.randomUUID();
      const user: UserEntity = {
        id,
        email: normalizedEmail,
        nickname: nickname.trim() || 'User',
        passwordHash: 'hashed_' + password,
        createdAt: new Date(),
      };
      this.users.set(normalizedEmail, user);

      const tokens = this.issueTokens(user.id, user.email);
      return {
        user: { id: user.id, email: user.email, nickname: user.nickname },
        ...tokens,
      };
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('duplicate key') || err?.message?.includes('unique constraint')) {
        throw new ConflictException('该邮箱已被注册');
      }
      throw err;
    }
  }

  async validateUser(payload: { sub: string; email: string; type?: string }) {
    if (!payload.sub || payload.type === 'refresh') {
      throw new UnauthorizedException('无效的访问令牌类型或载荷');
    }
    return { id: payload.sub, email: payload.email };
  }
}
