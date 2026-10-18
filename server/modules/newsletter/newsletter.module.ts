import { Module } from '@nestjs/common';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';
import { AuthModule } from '../auth/auth.module';
import { Mailer } from '@server/common/mail/mailer';

@Module({
  // JwtAuthGuard / AdminGuard 的依赖在 AuthModule 里，必须导入才能解析
  imports: [AuthModule],
  controllers: [NewsletterController],
  providers: [NewsletterService, Mailer],
  exports: [NewsletterService],
})
export class NewsletterModule {}
