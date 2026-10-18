import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  // JwtAuthGuard 在 AuthModule 里注册并导出，AiModule 必须导入它，
  // 否则 Nest 无法为守卫注入 AuthService（启动即报 UnknownDependenciesException）。
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
