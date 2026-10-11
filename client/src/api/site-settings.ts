import { axiosForBackend } from '@/lib/axios';
import type { SiteSettings, UpdateSiteSettingsRequest } from '@shared/api.interface';

export async function getSiteSettings(): Promise<SiteSettings> {
  const response = await axiosForBackend.get('/api/site-settings');
  return response.data;
}

export async function updateSiteSettings(data: UpdateSiteSettingsRequest): Promise<SiteSettings> {
  const response = await axiosForBackend.patch('/api/site-settings', data);
  return response.data;
}
