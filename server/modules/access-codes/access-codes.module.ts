import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessCodesService } from './access-codes.service';
import { AccessCodesController } from './access-codes.controller';

@Module({
  imports: [AuthModule],
  controllers: [AccessCodesController],
  providers: [AccessCodesService],
  exports: [AccessCodesService],
})
export class AccessCodesModule {}
