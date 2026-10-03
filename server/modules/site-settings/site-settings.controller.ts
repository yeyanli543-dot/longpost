import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthRequest } from '../auth/jwt-auth.guard';
import { SiteSettingsService } from './site-settings.service';
import type { SiteSettings, UpdateSiteSettingsRequest } from '@shared/api.interface';

@Controller('api/site-settings')
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  async getSettings(): Promise<SiteSettings> {
    return this.siteSettingsService.getSettings();
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateSettings(
    @Req() req: AuthRequest,
    @Body() data: UpdateSiteSettingsRequest,
  ): Promise<SiteSettings> {
    const userId = req.user!.id;
    return this.siteSettingsService.updateSettings(userId, data);
  }
}
