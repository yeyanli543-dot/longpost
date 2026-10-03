import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { siteSettingsApi } from '@client/src/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Button } from '@client/src/components/ui/button';
import { Switch } from '@client/src/components/ui/switch';
import { Label } from '@client/src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import type { SiteSettings, UpdateSiteSettingsRequest, RegistrationMode } from '@shared/api.interface';

interface SiteSettingsCardProps {
  isAdmin: boolean;
}

const REGISTRATION_MODE_OPTIONS: { value: RegistrationMode; label: string; desc: string }[] = [
  { value: 'google_only', label: '仅 Google 登录', desc: '新用户只能通过 Google 账号注册，杜绝乱填邮箱问题' },
  { value: 'email_and_google', label: '邮箱 + Google', desc: '同时支持邮箱密码注册和 Google 登录' },
];

const SiteSettingsCard: React.FC<SiteSettingsCardProps> = ({ isAdmin }) => {
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteSaving, setSiteSaving] = useState(false);
  const [siteData, setSiteData] = useState<SiteSettings | null>(null);

  const loadSiteSettings = async (): Promise<void> => {
    if (!isAdmin) return;
    setSiteLoading(true);
    try {
      const data = await siteSettingsApi.getSiteSettings();
      setSiteData(data);
    } catch (err) {
      logger.error('获取站点设置失败', err);
      toast.error('获取站点设置失败');
    } finally {
      setSiteLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && !siteData && !siteLoading) {
      void loadSiteSettings();
    }
  }, [isAdmin]);

  const handleSave = async (): Promise<void> => {
    if (!siteData) return;
    setSiteSaving(true);
    try {
      const data: UpdateSiteSettingsRequest = {
        siteName: siteData.siteName,
        siteDescription: siteData.siteDescription ?? undefined,
        siteLogoUrl: siteData.siteLogoUrl ?? undefined,
        allowRegister: siteData.allowRegister,
        googleLoginEnabled: siteData.googleLoginEnabled,
        registrationMode: siteData.registrationMode,
      };
      const updated = await siteSettingsApi.updateSiteSettings(data);
      setSiteData(updated);
      toast.success('站点设置已保存');
    } catch (err) {
      logger.error('保存站点设置失败', err);
      toast.error('保存失败，请稍后重试');
    } finally {
      setSiteSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <CardTitle className="text-lg">站点设置</CardTitle>
        <CardDescription>管理站点的基本配置</CardDescription>
      </CardHeader>
      {siteLoading ? (
        <CardContent>
          <p className="text-gray-500">加载中...</p>
        </CardContent>
      ) : siteData ? (
        <>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="siteName">站点名称</Label>
              <Input
                id="siteName"
                value={siteData.siteName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSiteData({ ...siteData, siteName: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="siteDescription">站点描述</Label>
              <Textarea
                id="siteDescription"
                value={siteData.siteDescription ?? ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSiteData({ ...siteData, siteDescription: e.target.value })}
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="siteLogoUrl">站点 Logo URL</Label>
              <Input
                id="siteLogoUrl"
                value={siteData.siteLogoUrl ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSiteData({ ...siteData, siteLogoUrl: e.target.value })}
                placeholder="输入 Logo 图片链接"
                className="mt-1"
              />
            </div>

            <div className="pt-4 border-t border-gray-800 space-y-6">
              <h3 className="text-sm font-medium text-gray-200">注册与登录</h3>

              <div className="flex items-center justify-between">
                <div>
                  <Label>开放注册</Label>
                  <p className="text-sm text-gray-500 mt-1">允许新用户注册账号</p>
                </div>
                <Switch
                  checked={siteData.allowRegister}
                  onCheckedChange={(checked: boolean) => setSiteData({ ...siteData, allowRegister: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>启用 Google 登录</Label>
                  <p className="text-sm text-gray-500 mt-1">允许用户使用 Google 账号登录注册</p>
                </div>
                <Switch
                  checked={siteData.googleLoginEnabled}
                  onCheckedChange={(checked: boolean) => setSiteData({ ...siteData, googleLoginEnabled: checked })}
                />
              </div>

              <div>
                <Label htmlFor="registrationMode">注册方式</Label>
                <p className="text-sm text-gray-500 mt-1 mb-2">控制新用户可用的注册渠道</p>
                <Select
                  value={siteData.registrationMode}
                  onValueChange={(value: string) => setSiteData({ ...siteData, registrationMode: value as RegistrationMode })}
                >
                  <SelectTrigger id="registrationMode" className="w-full">
                    <SelectValue placeholder="选择注册方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTRATION_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-gray-500">{opt.desc}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => { void handleSave(); }} disabled={siteSaving} data-ai-section-type="button">
              {siteSaving ? '保存中...' : '保存'}
            </Button>
          </CardFooter>
        </>
      ) : null}
    </Card>
  );
};

export default SiteSettingsCard;
