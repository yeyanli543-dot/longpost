import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { appUsers } from '../../database/schema';
import { AuthService, JWT_SECRET } from './auth.service';
import { OAuthService } from './oauth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OAuthService],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const adminCount = await this.db
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(eq(appUsers.role, 'admin'))
        .limit(1);

      if (adminCount.length > 0) {
        return;
      }

      const passwordHash = await bcrypt.hash('admin123', 10);
      await this.db.insert(appUsers).values({
        email: 'admin@longpost.com',
        passwordHash,
        nickname: '站长',
        provider: 'email',
        role: 'admin',
      });

      this.logger.log('默认站长账号已创建: admin@longpost.com / admin123');
    } catch (error) {
      this.logger.error('初始化站长账号失败: ' + JSON.stringify(error));
    }
  }
}
