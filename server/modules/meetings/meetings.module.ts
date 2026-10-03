import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingSignalingGateway } from './meeting-signaling.gateway';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingSignalingGateway],
  exports: [MeetingsService],
})
export class MeetingsModule {}
