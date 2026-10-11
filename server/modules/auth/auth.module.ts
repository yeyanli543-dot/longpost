import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { appUsers } from '../../database/schema';
import { AuthService, JWT_SECRET } from './auth.service';
import { OAuthService } from './oauth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { OWNER_EMAIL } from '../../config/owner.config';

@Module({
  imports: [
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard, OAuthService],
  exports: [AuthService, JwtAuthGuard, AdminGuard, JwtModule],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    // 站长已经由 OWNER_EMAIL 指定时，不要再造一个 admin@longpost.com 的账号出来。
    // 那个账号不是真人，却拿着最高权限，是个纯风险。
    if (OWNER_EMAIL) {
      this.logger.log(
        `已配置 OWNER_EMAIL=${OWNER_EMAIL}，跳过默认站长账号初始化`,
      );
      return;
    }

    try {
      const adminCount = await this.db
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(eq(appUsers.role, 'admin'))
        .limit(1);

      if (adminCount.length > 0) {
        return;
      }

      // 密码改成随机生成、只在启动日志里出现一次。
      // 原来是一个写死的固定口令——仓库是公开的，等于给所有部署实例留了一个公开口令的最高权限账号。
      const initialPassword = randomBytes(12).toString('base64url');
      const passwordHash = await bcrypt.hash(initialPassword, 10);
      await this.db.insert(appUsers).values({
        email: 'admin@longpost.com',
        passwordHash,
        nickname: '站长',
        provider: 'email',
        role: 'admin',
      });

      this.logger.warn(
        '未配置 OWNER_EMAIL，已创建临时站长账号（密码仅本次日志可见，请立即登录后修改，' +
          '或配置 OWNER_EMAIL 改用你自己的账号）:',
      );
      this.logger.warn(`  admin@longpost.com / ${initialPassword}`);
    } catch (error) {
      this.logger.error('初始化站长账号失败: ' + JSON.stringify(error));
    }
  }
}
