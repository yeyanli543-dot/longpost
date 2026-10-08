import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@client/src/utils/error-message';
import {
  Upload,
  Sun,
  Moon,
  Monitor,
  Download,
  Trash2,
  HelpCircle,
  MessageSquare,
  Settings as SettingsIcon,
  Shield,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Feather,
  Loader2,
} from 'lucide-react';
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
import { Separator } from '@client/src/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Image } from '@client/src/components/ui/image';
import { uploadFile as uploadToServer } from '@client/src/api/upload';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { SiteSettings, ThemeMode, FontSize } from '@shared/api.interface';

// ==================== 个人资料 ====================
interface ProfileSectionProps {
  nickname: string;
  setNickname: (v: string) => void;
  avatarUrl: string;
  setAvatarUrl: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  avatarInitial: string;
  saving: boolean;
  onSave: () => void;
}

const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

export function ProfileSection({
  nickname,
  setNickname,
  avatarUrl,
  setAvatarUrl,
  bio,
  setBio,
  avatarInitial,
  saving,
  onSave,
}: ProfileSectionProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlExpanded, setUrlExpanded] = useState(false);

  const handleAvatarClick = (): void => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    // 格式校验
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error('不支持的图片格式，请上传 PNG / JPEG / WebP / GIF 格式的图片');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 大小校验
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error('图片大小不能超过 5MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const result = await uploadToServer(file);
      setAvatarUrl(result.url);
      toast.success('头像已更新');
    } catch (err) {
      logger.error('头像上传失败', err);
      toast.error(getFriendlyErrorMessage(err, '头像上传失败，请稍后重试'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">个人资料</CardTitle>
          <CardDescription>修改你的头像、昵称和个人简介</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 头像 */}
          <div className="flex items-center gap-5">
            <div
              className="relative w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 group cursor-pointer"
              onClick={handleAvatarClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAvatarClick();
                }
              }}
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="头像"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-muted-foreground">
                  {avatarInitial}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="w-6 h-6 text-white" />
              </div>
              {uploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">头像</p>
              <p className="text-xs text-muted-foreground mt-1">
                点击左侧圆形区域上传图片，支持 PNG / JPEG / WebP / GIF，最大 5MB
              </p>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                onClick={() => setUrlExpanded((v) => !v)}
              >
                {urlExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                使用网络图片
              </button>
            </div>
          </div>

          {/* URL 输入（可折叠） */}
          {urlExpanded && (
            <div>
              <Label htmlFor="avatarUrl">头像链接</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAvatarUrl(e.target.value)
                }
                placeholder="输入头像图片 URL"
                className="mt-1"
              />
            </div>
          )}

          {/* 昵称 */}
          <div>
            <Label htmlFor="nickname">昵称</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNickname(e.target.value.slice(0, 50))
              }
              placeholder="你的昵称"
              maxLength={50}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {nickname.length}/50
            </p>
          </div>

          {/* 简介 */}
          <div>
            <Label htmlFor="bio">个人简介</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setBio(e.target.value.slice(0, 500))
              }
              placeholder="介绍一下自己"
              maxLength={500}
              rows={4}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">{bio.length}/500</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={onSave}
            disabled={saving}
            data-ai-section-type="button"
          >
            {saving ? '保存中...' : '保存修改'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 账号安全 ====================
interface SecuritySectionProps {
  email: string;
  provider: string;
  oldPassword: string;
  setOldPassword: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  passwordsMatch: boolean;
  canSave: boolean;
  saving: boolean;
  onChangePassword: () => void;
  onLogout: () => void;
  setNewPwd: string;
  setSetNewPwd: (v: string) => void;
  setConfirmPwd: string;
  setSetConfirmPwd: (v: string) => void;
  setPwdSaving: boolean;
  onSetPassword: () => void;
}

export function SecuritySection({
  email,
  provider,
  oldPassword,
  setOldPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  passwordsMatch,
  canSave,
  saving,
  onChangePassword,
  onLogout,
  setNewPwd,
  setSetNewPwd,
  setConfirmPwd,
  setSetConfirmPwd,
  setPwdSaving,
  onSetPassword,
}: SecuritySectionProps): React.ReactElement {
  const isGoogleBound = provider === 'google';
  const isAccessCodeUser = provider === 'access_code';
  const setPwdMatch = setNewPwd === setConfirmPwd && setNewPwd.length > 0;
  const canSetPwd = setNewPwd.length >= 6 && setPwdMatch;

  return (
    <div className="space-y-4">
      {/* 登录邮箱 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">账号信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
            <div>
              <Label className="text-muted-foreground text-sm">登录方式</Label>
              <p className="mt-1 text-foreground">
                {isAccessCodeUser ? '通行码登录' : isGoogleBound ? 'Google 账号' : '邮箱密码'}
              </p>
            </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Google 登录</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {isGoogleBound ? '已绑定 Google 账号' : '尚未绑定 Google 账号'}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                isGoogleBound
                   ? 'bg-green-500/10 text-green-400'
                   : 'bg-muted text-muted-foreground'
              }`}
            >
              {isGoogleBound ? '已绑定' : '未绑定'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 设置密码（仅通行码用户可见） */}
      {isAccessCodeUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">设置登录密码</CardTitle>
            <CardDescription>设置密码后可以使用邮箱 + 密码直接登录</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="setNewPwd">新密码</Label>
              <Input
                id="setNewPwd"
                type="password"
                value={setNewPwd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSetNewPwd(e.target.value)
                }
                placeholder="至少 6 位"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="setConfirmPwd">确认密码</Label>
              <Input
                id="setConfirmPwd"
                type="password"
                value={setConfirmPwd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSetConfirmPwd(e.target.value)
                }
                placeholder="请再次输入新密码"
                className="mt-1"
              />
              {setNewPwd && setConfirmPwd && !setPwdMatch && (
                <p className="text-xs text-red-400 mt-1">两次输入的密码不一致</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={onSetPassword}
              disabled={!canSetPwd || setPwdSaving}
              data-ai-section-type="button"
            >
              {setPwdSaving ? '保存中...' : '设置密码'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* 修改密码 */}
      {!isAccessCodeUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">修改密码</CardTitle>
          <CardDescription>定期更换密码以保证账号安全</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="oldPassword">原密码</Label>
            <Input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setOldPassword(e.target.value)
              }
              placeholder="请输入原密码"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewPassword(e.target.value)
              }
              placeholder="请输入新密码"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(e.target.value)
              }
              placeholder="请再次输入新密码"
              className="mt-1"
            />
            {newPassword && confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-400 mt-1">两次输入的密码不一致</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={onChangePassword}
            disabled={!canSave || saving}
            data-ai-section-type="button"
          >
            {saving ? '保存中...' : '修改密码'}
          </Button>
        </CardFooter>
      </Card>
      )}

      {/* 退出登录 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">退出登录</CardTitle>
          <CardDescription>退出当前登录的账号</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={onLogout}
            data-ai-section-type="button"
          >
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 通知偏好 ====================
interface NotificationsSectionProps {
  notifyOnRead: boolean;
  setNotifyOnRead: (v: boolean) => void;
  notifyOnDelete: boolean;
  setNotifyOnDelete: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
}

interface NotifyItem {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  enabled: boolean;
}

export function NotificationsSection({
  notifyOnRead,
  setNotifyOnRead,
  notifyOnDelete,
  setNotifyOnDelete,
  saving,
  onSave,
}: NotificationsSectionProps): React.ReactElement {
  const [likeOn, setLikeOn] = useState(true);
  const [commentOn, setCommentOn] = useState(true);
  const [repostOn, setRepostOn] = useState(true);
  const [followOn, setFollowOn] = useState(true);
  const [mentionOn, setMentionOn] = useState(true);
  const [systemOn, setSystemOn] = useState(true);
  const [dmOn, setDmOn] = useState(true);
  const [meetingOn, setMeetingOn] = useState(true);

  const items: NotifyItem[] = [
    { title: '点赞通知', desc: '有人点赞你的内容时通知', checked: likeOn, onChange: setLikeOn, enabled: true },
    { title: '评论通知', desc: '有人评论你的内容时通知', checked: commentOn, onChange: setCommentOn, enabled: true },
    { title: '转发通知', desc: '有人转发你的内容时通知', checked: repostOn, onChange: setRepostOn, enabled: true },
    { title: '新粉丝', desc: '有新用户关注你时通知', checked: followOn, onChange: setFollowOn, enabled: true },
    { title: '@ 提及', desc: '有人在帖子中 @ 你时通知', checked: mentionOn, onChange: setMentionOn, enabled: true },
    { title: '内容被阅读', desc: '你的文章被他人阅读时通知', checked: notifyOnRead, onChange: setNotifyOnRead, enabled: true },
    { title: '内容被删除', desc: '你的内容被删除时通知', checked: notifyOnDelete, onChange: setNotifyOnDelete, enabled: true },
    { title: '系统通知', desc: '接收系统公告和重要通知', checked: systemOn, onChange: setSystemOn, enabled: true },
    { title: '私信通知', desc: '收到新私信时通知', checked: dmOn, onChange: setDmOn, enabled: true },
    { title: '会议邀请', desc: '收到会议邀请时通知', checked: meetingOn, onChange: setMeetingOn, enabled: true },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">通知偏好</CardTitle>
          <CardDescription>设置你想要接收的通知类型</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {items.map(
            (item: NotifyItem, idx: number) =>
              item.enabled && (
                <div
                  key={item.title}
                  className={`flex items-center justify-between py-3 ${
                    idx === 0 ? 'pt-0' : ''
                  } ${idx === items.length - 1 ? 'pb-0' : ''}`}
                >
                  <div className="flex-1 pr-4">
                    <Label>{item.title}</Label>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <Switch checked={item.checked} onCheckedChange={item.onChange} />
                </div>
              ),
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={onSave} disabled={saving} data-ai-section-type="button">
            {saving ? '保存中...' : '保存偏好'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 外观与主题 ====================
interface AppearanceSectionProps {
  theme: ThemeMode;
  setTheme: (v: ThemeMode) => void;
  fontSize: FontSize;
  setFontSize: (v: FontSize) => void;
  saving: boolean;
  onSave: () => void;
}

export function AppearanceSection({
  theme,
  setTheme,
  fontSize,
  setFontSize,
  saving,
  onSave,
}: AppearanceSectionProps): React.ReactElement {
  const themeOptions: Array<{ value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = [
    { value: 'light', label: '浅色模式', icon: Sun, desc: '明亮清爽的界面' },
    { value: 'dark', label: '深色模式', icon: Moon, desc: '护眼的深色主题' },
    { value: 'system', label: '跟随系统', icon: Monitor, desc: '随系统自动切换' },
  ];

  const fontOptions: Array<{ value: FontSize; label: string; desc: string }> = [
    { value: 'small', label: '小', desc: '显示更多内容' },
    { value: 'medium', label: '中', desc: '标准字号' },
    { value: 'large', label: '大', desc: '更大更清晰' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">外观与主题</CardTitle>
          <CardDescription>自定义界面的显示效果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 主题选择 */}
          <div>
            <Label className="text-base">主题模式</Label>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                       isActive
                         ? 'border-blue-500 bg-blue-500/10'
                         : 'border-border bg-accent/50 hover:border-ring/50'
                    }`}
                  >
                     <Icon
                       className={`w-6 h-6 mb-2 ${
                         isActive ? 'text-blue-500' : 'text-muted-foreground'
                       }`}
                     />
                     <p
                       className={`text-sm font-medium ${
                         isActive ? 'text-blue-500' : 'text-foreground'
                       }`}
                     >
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

           <Separator />

           {/* 字号选择 */}
           <div>
             <Label className="text-base">字体大小</Label>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {fontOptions.map((opt) => {
                const isActive = fontSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFontSize(opt.value)}
                    className={`p-4 rounded-lg border text-center transition-all ${
                       isActive
                         ? 'border-blue-500 bg-blue-500/10'
                         : 'border-border bg-accent/50 hover:border-ring/50'
                    }`}
                  >
                    <p
                      className={`font-medium ${
                        isActive ? 'text-blue-500' : 'text-foreground'
                      } ${opt.value === 'small' ? 'text-sm' : opt.value === 'large' ? 'text-lg' : 'text-base'}`}
                    >
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={onSave} disabled={saving} data-ai-section-type="button">
            {saving ? '保存中...' : '保存设置'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 隐私设置 ====================
export function PrivacySection(): React.ReactElement {
  const [dmPrivacy, setDmPrivacy] = useState('everyone');
  const [commentPrivacy, setCommentPrivacy] = useState('everyone');
  const [visibility, setVisibility] = useState('public');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">隐私设置</CardTitle>
          <CardDescription>管理你的隐私和内容可见性</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
           <div>
             <Label>谁可以私信我</Label>
             <p className="text-sm text-muted-foreground mt-0.5">控制哪些用户可以向你发送私信</p>
            <Select value={dmPrivacy} onValueChange={setDmPrivacy}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">所有人</SelectItem>
                <SelectItem value="followed">我关注的人</SelectItem>
                <SelectItem value="none">无人（关闭私信）</SelectItem>
              </SelectContent>
            </Select>
          </div>

           <Separator />

           <div>
             <Label>谁可以评论我</Label>
             <p className="text-sm text-muted-foreground mt-0.5">控制哪些用户可以评论你的内容</p>
            <Select value={commentPrivacy} onValueChange={setCommentPrivacy}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">所有人</SelectItem>
                <SelectItem value="followed">我关注的人</SelectItem>
                <SelectItem value="none">无人（关闭评论）</SelectItem>
              </SelectContent>
            </Select>
          </div>

           <Separator />

           <div>
             <Label>公开内容可见性</Label>
             <p className="text-sm text-muted-foreground mt-0.5">控制你的内容在公开搜索和推荐中的展示</p>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">全部公开</SelectItem>
                <SelectItem value="follower">仅粉丝可见</SelectItem>
                <SelectItem value="private">仅自己可见</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => toast.success('隐私设置已保存')}
            data-ai-section-type="button"
          >
            保存设置
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 数据管理 ====================
interface DataSectionProps {
  onExport: () => void;
  onDeactivate: () => void;
}

export function DataSection({
  onExport,
  onDeactivate,
}: DataSectionProps): React.ReactElement {
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleConfirmDeactivate = (): void => {
    setDeactivateOpen(false);
    setConfirmText('');
    onDeactivate();
  };

  return (
    <div className="space-y-4">
      {/* 导出数据 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导出我的数据</CardTitle>
          <CardDescription>
            导出你在平台上的所有数据，包括发布的内容、关注列表等
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            数据将以 JSON 格式打包，导出完成后会通过邮件发送下载链接。
          </p>
          <Button
            variant="outline"
            onClick={onExport}
            data-ai-section-type="button"
          >
            <Download className="w-4 h-4" />
            导出数据
          </Button>
        </CardContent>
      </Card>

      {/* 注销账号 */}
      <Card className="border-red-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-red-400 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            注销账号
          </CardTitle>
          <CardDescription className="text-red-400/70">
            注销后你的所有数据将被永久删除，且无法恢复
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>你发布的所有帖子和文章将被删除</li>
            <li>你的关注关系和粉丝将被清除</li>
            <li>你的点赞、收藏、评论记录将被删除</li>
            <li>此操作不可撤销</li>
          </ul>
          <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                data-ai-section-type="button"
              >
                注销账号
              </Button>
            </DialogTrigger>
             <DialogContent className="bg-card border-border text-card-foreground">
               <DialogHeader>
                 <DialogTitle className="text-red-400">确认注销账号？</DialogTitle>
                 <DialogDescription className="text-muted-foreground">
                  此操作将永久删除你的账号及所有数据，且无法恢复。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                 <p className="text-sm text-card-foreground">
                  请输入 <span className="font-mono font-bold text-red-400">DELETE</span> 以确认：
                </p>
                <Input
                  value={confirmText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setConfirmText(e.target.value)
                  }
                  placeholder="输入 DELETE 确认"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setDeactivateOpen(false)}
                  data-ai-section-type="button"
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  disabled={confirmText !== 'DELETE'}
                  onClick={handleConfirmDeactivate}
                  data-ai-section-type="button"
                >
                  确认注销
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 关于与帮助 ====================
export function AboutSection(): React.ReactElement {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-center text-center pt-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-3">
            <Feather className="w-8 h-8 text-blue-500" />
          </div>
          <CardTitle className="text-2xl">LongPost</CardTitle>
          <CardDescription>长文发布平台 · 版本 1.0.0</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            短帖引流，长文阅读。像 X 一样发帖，也可以写完整长文，通过链接跳转阅读。
            让每一个想法都有合适的载体。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">帮助与反馈</CardTitle>
          <CardDescription>获取使用帮助或向我们反馈问题</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            onClick={() => toast.info('使用帮助即将上线')}
             className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors text-left"
            data-ai-section-type="button"
          >
            <div className="flex items-center gap-3">
               <HelpCircle className="w-5 h-5 text-muted-foreground" />
              <div>
                 <p className="text-foreground text-sm">使用帮助</p>
                 <p className="text-xs text-muted-foreground">查看常见问题和使用指南</p>
              </div>
            </div>
             <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            onClick={() => toast.info('反馈渠道即将上线')}
             className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors text-left"
            data-ai-section-type="button"
          >
            <div className="flex items-center gap-3">
               <MessageSquare className="w-5 h-5 text-muted-foreground" />
              <div>
                 <p className="text-foreground text-sm">意见反馈</p>
                 <p className="text-xs text-muted-foreground">告诉我们你的想法和建议</p>
              </div>
            </div>
             <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 管理员专区 ====================
interface AdminSectionProps {
  siteLoading: boolean;
  siteSaving: boolean;
  siteData: SiteSettings | null;
  setSiteData: (data: SiteSettings | null) => void;
  onSaveSiteSettings: () => void;
  onNavigate: (path: string) => void;
}

type AdminView = 'cards' | 'site';

export function AdminSection({
  siteLoading,
  siteSaving,
  siteData,
  setSiteData,
  onSaveSiteSettings,
  onNavigate,
}: AdminSectionProps): React.ReactElement {
  const [view, setView] = useState<AdminView>('cards');

  if (view === 'site') {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => setView('cards')}
           className="-ml-2 text-muted-foreground hover:text-foreground"
          data-ai-section-type="button"
        >
          ← 返回管理员专区
        </Button>
         <Card>
           <CardHeader>
             <CardTitle className="text-lg">站点设置</CardTitle>
            <CardDescription>管理站点的基本配置</CardDescription>
          </CardHeader>
          {siteLoading ? (
            <CardContent>
               <p className="text-muted-foreground">加载中...</p>
            </CardContent>
          ) : siteData ? (
            <>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="siteName">站点名称</Label>
                  <Input
                    id="siteName"
                    value={siteData.siteName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSiteData({ ...siteData, siteName: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="siteDescription">站点描述</Label>
                  <Textarea
                    id="siteDescription"
                    value={siteData.siteDescription ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setSiteData({ ...siteData, siteDescription: e.target.value })
                    }
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="siteLogoUrl">站点 Logo URL</Label>
                  <Input
                    id="siteLogoUrl"
                    value={siteData.siteLogoUrl ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSiteData({ ...siteData, siteLogoUrl: e.target.value })
                    }
                    placeholder="输入 Logo 图片链接"
                    className="mt-1"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>开放注册</Label>
                     <p className="text-sm text-muted-foreground mt-1">允许新用户注册账号</p>
                  </div>
                  <Switch
                    checked={siteData.allowRegister}
                    onCheckedChange={(checked: boolean) =>
                      setSiteData({ ...siteData, allowRegister: checked })
                    }
                  />
                </div>
                 <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Google 登录</Label>
                     <p className="text-sm text-muted-foreground mt-1">
                       开启后登录页显示 Google 登录按钮
                     </p>
                  </div>
                  <Switch
                    checked={siteData.googleLoginEnabled}
                    onCheckedChange={(checked: boolean) =>
                      setSiteData({ ...siteData, googleLoginEnabled: checked })
                    }
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={onSaveSiteSettings}
                  disabled={siteSaving}
                  data-ai-section-type="button"
                >
                  {siteSaving ? '保存中...' : '保存设置'}
                </Button>
              </CardFooter>
            </>
          ) : null}
        </Card>
      </div>
    );
  }

  const adminCards: Array<{
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
  }> = [
    {
      title: '站点设置',
      desc: '配置站点名称、描述、注册选项等基础设置',
      icon: SettingsIcon,
      onClick: () => setView('site'),
    },
    {
      title: '管理后台',
      desc: '查看平台数据统计、用户管理、系统配置',
      icon: Shield,
      onClick: () => onNavigate('/admin'),
    },
    {
      title: '内容审核',
      desc: '审核待处理内容、查看举报、管理违规内容',
      icon: FileText,
      onClick: () => onNavigate('/admin'),
    },
  ];

  return (
    <div className="space-y-4">
       <Card>
         <CardHeader>
           <CardTitle className="text-lg">管理员专区</CardTitle>
          <CardDescription>站点管理和运营工具入口</CardDescription>
        </CardHeader>
        <CardContent
          className="grid gap-3"
          data-ai-section-type="card-menu"
        >
          {adminCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                onClick={card.onClick}
                 className="flex items-center gap-4 p-4 rounded-lg border border-border hover:border-ring/50 hover:bg-accent/50 transition-all text-left group"
                data-ai-section-type="button"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                   <p className="font-medium text-foreground">{card.title}</p>
                   <p className="text-sm text-muted-foreground mt-0.5">{card.desc}</p>
                </div>
                 <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-500 transition-colors flex-shrink-0" />
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
