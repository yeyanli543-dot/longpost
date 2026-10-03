import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { AuthModule } from '../auth/auth.module';
import { HashtagsModule } from '../hashtags/hashtags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SiteSettingsModule } from '../site-settings/site-settings.module';

@Module({
  imports: [AuthModule, HashtagsModule, NotificationsModule, SiteSettingsModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
