import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { SiteSettings, UpdateSiteSettingsRequest } from '@shared/api.interface';

export async function getSiteSettings(): Promise<SiteSettings> {
  const response = await axiosForBackend.get('/api/site-settings');
  return response.data;
}

export async function updateSiteSettings(data: UpdateSiteSettingsRequest): Promise<SiteSettings> {
  const response = await axiosForBackend.patch('/api/site-settings', data);
  return response.data;
}
