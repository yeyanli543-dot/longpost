import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'longpost-dev-secret-change-in-prod'
    });
  }

  async validate(payload: { sub: string; email: string; type?: string }) {
    if (!payload.sub || payload.type === 'refresh') {
      throw new UnauthorizedException('无效的访问令牌类型或载荷');
    }
    return { id: payload.sub, email: payload.email };
  }
}
