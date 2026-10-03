import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { AuthModule } from '../auth/auth.module';
import { HashtagsModule } from '../hashtags/hashtags.module';
import { SiteSettingsModule } from '../site-settings/site-settings.module';

@Module({
  imports: [AuthModule, HashtagsModule, SiteSettingsModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
