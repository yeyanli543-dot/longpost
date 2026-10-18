import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from './database/database.module';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { PostsModule } from './modules/posts/posts.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuthModule } from './modules/auth/auth.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { CommentsModule } from './modules/comments/comments.module';
import { FollowsModule } from './modules/follows/follows.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HashtagsModule } from './modules/hashtags/hashtags.module';
import { AdminModule } from './modules/admin/admin.module';
import { DmModule } from './modules/dm/dm.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { AccessCodesModule } from './modules/access-codes/access-codes.module';
import { PwaModule } from './modules/pwa/pwa.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { SyncModule } from './modules/sync/sync.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    // 独立原生数据库模块
    DatabaseModule,
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    PostsModule,
    ArticlesModule,
    AuthModule,
    SiteSettingsModule,
    InteractionsModule,
    CommentsModule,
    FollowsModule,
    NotificationsModule,
    HashtagsModule,
    AdminModule,
    DmModule,
    MeetingsModule,
    AccessCodesModule,
    PwaModule,
    UploadsModule,
    SyncModule,
    AiModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
