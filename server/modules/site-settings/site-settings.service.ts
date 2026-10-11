import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@server/database/database.module';
import { siteSettings } from '@server/database/schema';
import { eq } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service';
import type { SiteSettings, UpdateSiteSettingsRequest, RegistrationMode } from '@shared/api.interface';

const SITE_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'LongPost',
  siteDescription: null,
  siteLogoUrl: null,
  allowRegister: true,
  googleLoginEnabled: true,
  registrationMode: 'email_and_google',
  siteAnnouncement: null,
  contentModerationEnabled: false,
};

@Injectable()
export class SiteSettingsService {
  private readonly logger = new Logger(SiteSettingsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authService: AuthService,
  ) {}

  async getSettings(): Promise<SiteSettings> {
    const rows = await this.db
      .select({
        siteName: siteSettings.siteName,
        siteDescription: siteSettings.siteDescription,
        siteLogoUrl: siteSettings.siteLogoUrl,
        allowRegister: siteSettings.allowRegister,
        googleLoginEnabled: siteSettings.googleLoginEnabled,
        registrationMode: siteSettings.registrationMode,
        siteAnnouncement: siteSettings.siteAnnouncement,
        contentModerationEnabled: siteSettings.contentModerationEnabled,
      })
      .from(siteSettings)
      .where(eq(siteSettings.id, SITE_SETTINGS_ID))
      .limit(1);

    if (rows.length === 0) {
      return DEFAULT_SETTINGS;
    }

    return this.toSiteSettings(rows[0]);
  }

  private toSiteSettings(row: {
    siteName: string;
    siteDescription: string | null;
    siteLogoUrl: string | null;
    allowRegister: boolean;
    googleLoginEnabled: boolean;
    registrationMode: string;
    siteAnnouncement: string | null;
    contentModerationEnabled: boolean;
  }): SiteSettings {
    return {
      siteName: row.siteName,
      siteDescription: row.siteDescription,
      siteLogoUrl: row.siteLogoUrl,
      allowRegister: row.allowRegister,
      googleLoginEnabled: row.googleLoginEnabled,
      registrationMode: (row.registrationMode as RegistrationMode) || 'email_and_google',
      siteAnnouncement: row.siteAnnouncement,
      contentModerationEnabled: row.contentModerationEnabled,
    };
  }

  async updateSettings(
    userId: string,
    data: UpdateSiteSettingsRequest,
  ): Promise<SiteSettings> {
    await this.authService.ensureAdmin(userId);

    const patch: Partial<typeof siteSettings.$inferInsert> = {};
    if (data.siteName !== undefined) patch.siteName = data.siteName;
    if (data.siteDescription !== undefined) patch.siteDescription = data.siteDescription;
    if (data.siteLogoUrl !== undefined) patch.siteLogoUrl = data.siteLogoUrl;
    if (data.allowRegister !== undefined) patch.allowRegister = data.allowRegister;
    if (data.googleLoginEnabled !== undefined) patch.googleLoginEnabled = data.googleLoginEnabled;
    if (data.registrationMode !== undefined) patch.registrationMode = data.registrationMode;
    if (data.siteAnnouncement !== undefined) patch.siteAnnouncement = data.siteAnnouncement;
    if (data.contentModerationEnabled !== undefined) patch.contentModerationEnabled = data.contentModerationEnabled;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    const updated = await this.db
      .update(siteSettings)
      .set(patch)
      .where(eq(siteSettings.id, SITE_SETTINGS_ID))
      .returning({
        siteName: siteSettings.siteName,
        siteDescription: siteSettings.siteDescription,
        siteLogoUrl: siteSettings.siteLogoUrl,
        allowRegister: siteSettings.allowRegister,
        googleLoginEnabled: siteSettings.googleLoginEnabled,
        registrationMode: siteSettings.registrationMode,
        siteAnnouncement: siteSettings.siteAnnouncement,
        contentModerationEnabled: siteSettings.contentModerationEnabled,
      });

    if (updated.length === 0) {
      // Record doesn't exist yet — insert it with the provided values + defaults
      const values: typeof siteSettings.$inferInsert = {
        id: SITE_SETTINGS_ID,
        siteName: data.siteName ?? DEFAULT_SETTINGS.siteName,
        siteDescription: data.siteDescription ?? DEFAULT_SETTINGS.siteDescription,
        siteLogoUrl: data.siteLogoUrl ?? DEFAULT_SETTINGS.siteLogoUrl,
        allowRegister: data.allowRegister ?? DEFAULT_SETTINGS.allowRegister,
        googleLoginEnabled: data.googleLoginEnabled ?? DEFAULT_SETTINGS.googleLoginEnabled,
        registrationMode: data.registrationMode ?? DEFAULT_SETTINGS.registrationMode,
        siteAnnouncement: data.siteAnnouncement ?? DEFAULT_SETTINGS.siteAnnouncement,
        contentModerationEnabled: data.contentModerationEnabled ?? DEFAULT_SETTINGS.contentModerationEnabled,
      };
       const inserted = await this.db
         .insert(siteSettings)
         .values(values)
         .returning({
           siteName: siteSettings.siteName,
           siteDescription: siteSettings.siteDescription,
           siteLogoUrl: siteSettings.siteLogoUrl,
           allowRegister: siteSettings.allowRegister,
           googleLoginEnabled: siteSettings.googleLoginEnabled,
           registrationMode: siteSettings.registrationMode,
           siteAnnouncement: siteSettings.siteAnnouncement,
           contentModerationEnabled: siteSettings.contentModerationEnabled,
         });
       return this.toSiteSettings(inserted[0]);
     }

     return this.toSiteSettings(updated[0]);
  }
}
