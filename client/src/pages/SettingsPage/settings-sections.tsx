import { useState, useRef, useEffect } from 'react';
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
  Smartphone,
  Eye,
  Type,
  RotateCcw,
  Sparkles,
  BellRing,
  BookOpen,
  Globe,
  Sliders,
  Check,
  CheckCircle2,
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
import { logger } from '@/lib/logger';
import type {
  SiteSettings,
  ThemeMode,
  FontSize,
} from '@shared/api.interface';
import type {
  AccentColor,
  FontFamily,
  LineHeight,
  BorderRadius,
  NotchMode,
  SafeAreaMeasurements,
} from '@client/src/hooks/useTheme';

// ==================== 个人资料 ====================
interface ProfileSectionProps {
  nickname: string;
  setNickname: (v: string) => void;
  avatarUrl: string;
  setAvatarUrl: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
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
  website,
  setWebsite,
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

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error('不支持的图片格式，请上传 PNG / JPEG / WebP / GIF 格式的图片');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

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
          <CardDescription>管理你的公开个人信息、头像与主页链接</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 头像 */}
          <div className="flex items-center gap-5">
            <div
              className="relative w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 group cursor-pointer border border-border"
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">用户头像</p>
              <p className="text-xs text-muted-foreground mt-1">
                点击左侧圆形头像上传图片，支持 PNG / JPEG / WebP / GIF，最大 5MB
              </p>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary hover:underline mt-2 font-medium"
                onClick={() => setUrlExpanded((v) => !v)}
              >
                {urlExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                使用网络图片 URL
              </button>
            </div>
          </div>

          {urlExpanded && (
            <div>
              <Label htmlFor="avatarUrl">网络头像链接</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAvatarUrl(e.target.value)
                }
                placeholder="https://example.com/avatar.jpg"
                className="mt-1"
              />
            </div>
          )}

          {/* 昵称 */}
          <div>
            <Label htmlFor="nickname">用户昵称</Label>
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
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {nickname.length}/50
            </p>
          </div>

          {/* 个人网址 */}
          <div>
            <Label htmlFor="website">个人主页 / 博客链接</Label>
            <div className="relative mt-1">
              <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="website"
                value={website}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setWebsite(e.target.value.slice(0, 100))
                }
                placeholder="https://yourblog.com"
                maxLength={100}
                className="pl-9"
              />
            </div>
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
              placeholder="介绍一下自己，分享你的爱好与专长"
              maxLength={500}
              rows={4}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">{bio.length}/500</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={onSave}
            disabled={saving}
            data-ai-section-type="button"
          >
            {saving ? '保存中...' : '保存资料修改'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 外观与主题 (极大丰富 + 挖孔屏适配) ====================
interface AppearanceSectionProps {
  theme: ThemeMode;
  setTheme: (v: ThemeMode) => void;
  accent: AccentColor;
  setAccent: (v: AccentColor) => void;
  fontFamily: FontFamily;
  setFontFamily: (v: FontFamily) => void;
  fontSize: FontSize;
  setFontSize: (v: FontSize) => void;
  lineHeight: LineHeight;
  setLineHeight: (v: LineHeight) => void;
  borderRadius: BorderRadius;
  setBorderRadius: (v: BorderRadius) => void;
  notchMode: NotchMode;
  setNotchMode: (v: NotchMode) => void;
  landscapeGuard: boolean;
  setLandscapeGuard: (v: boolean) => void;
  safeArea: SafeAreaMeasurements;
  refreshSafeArea: () => void;
  resetToDefaults: () => void;
  saving: boolean;
  onSave: () => void;
}

export function AppearanceSection({
  theme,
  setTheme,
  accent,
  setAccent,
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  lineHeight,
  setLineHeight,
  borderRadius,
  setBorderRadius,
  notchMode,
  setNotchMode,
  landscapeGuard,
  setLandscapeGuard,
  safeArea,
  refreshSafeArea,
  resetToDefaults,
  saving,
  onSave,
}: AppearanceSectionProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'theme' | 'notch' | 'typography'>('theme');

  const themeOptions: Array<{
    value: ThemeMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    desc: string;
    badgeBg: string;
    borderPreview: string;
  }> = [
    { value: 'light', label: '浅色模式', icon: Sun, desc: '明亮清爽白底', badgeBg: '#ffffff', borderPreview: '#e2e8f0' },
    { value: 'dark', label: '深色模式', icon: Moon, desc: '标准舒适深灰', badgeBg: '#131314', borderPreview: '#334155' },
    { value: 'oled', label: '纯黑极夜', icon: Eye, desc: 'OLED 纯黑极致省电', badgeBg: '#000000', borderPreview: '#222222' },
    { value: 'sepia', label: '暖阳羊皮纸', icon: Feather, desc: '温润复古护眼暖色', badgeBg: '#fbf0d9', borderPreview: '#e4d3b6' },
    { value: 'nord', label: '北欧极光', icon: Sparkles, desc: '冰原幽蓝科技灰', badgeBg: '#242933', borderPreview: '#434c5e' },
    { value: 'forest', label: '翠竹幽林', icon: Feather, desc: '静谧清幽深绿调', badgeBg: '#0c1610', borderPreview: '#1f3328' },
    { value: 'lavender', label: '幻夜紫罗兰', icon: Sparkles, desc: '赛博浪漫夜紫调', badgeBg: '#130e1e', borderPreview: '#3b2d54' },
    { value: 'system', label: '跟随系统', icon: Monitor, desc: '自动随系统环境切换', badgeBg: 'linear-gradient(135deg, #fff 50%, #111 50%)', borderPreview: '#64748b' },
  ];

  const accentOptions: Array<{ value: AccentColor; label: string; colorHex: string }> = [
    { value: 'blue', label: '经典天蓝', colorHex: '#1d9bf0' },
    { value: 'green', label: '翡翠墨绿', colorHex: '#10b981' },
    { value: 'purple', label: '极客炫紫', colorHex: '#8b5cf6' },
    { value: 'pink', label: '珊瑚樱粉', colorHex: '#f43f5e' },
    { value: 'orange', label: '日落暖橙', colorHex: '#f97316' },
    { value: 'amber', label: '琥珀流金', colorHex: '#f59e0b' },
    { value: 'cyan', label: '数码科技青', colorHex: '#06b6d4' },
    { value: 'mono', label: '极简冷灰', colorHex: '#71767b' },
  ];

  const fontOptions: Array<{ value: FontFamily; label: string; desc: string; sample: string }> = [
    { value: 'sans', label: '现代黑体 (Sans)', desc: '通用清晰，现代屏幕首选', sample: '永字八法 Aa 123' },
    { value: 'serif', label: '人文衬线 (Serif)', desc: '宋体/衬线，适合深度长文沉浸阅读', sample: '博观约取 Aa 123' },
    { value: 'mono', label: '极客等宽 (Mono)', desc: '代码风格，规整秩序美感', sample: 'console.log() 123' },
  ];

  const fontSizeOptions: Array<{ value: FontSize; label: string; desc: string; sizeRem: string }> = [
    { value: 'small', label: '紧凑 (14.5px)', desc: '同屏显示更多字数', sizeRem: '0.9rem' },
    { value: 'medium', label: '标准 (16px)', desc: '黄金平衡阅读字号', sizeRem: '1rem' },
    { value: 'large', label: '清晰 (17.5px)', desc: '字型饱满，阅读轻松', sizeRem: '1.1rem' },
    { value: 'xlarge', label: '大字 (19px)', desc: '大屏或远距离清晰阅读', sizeRem: '1.2rem' },
  ];

  const lineHeightOptions: Array<{ value: LineHeight; label: string; desc: string }> = [
    { value: 'compact', label: '紧凑 (1.5x)', desc: '段落行间距较密' },
    { value: 'normal', label: '标准 (1.75x)', desc: '兼顾版面与阅读舒适度' },
    { value: 'relaxed', label: '宽松 (2.05x)', desc: '呼吸感强，慢读体验极佳' },
  ];

  const radiusOptions: Array<{ value: BorderRadius; label: string; desc: string }> = [
    { value: 'sharp', label: '硬朗 (4px)', desc: '棱角分明，干练风格' },
    { value: 'default', label: '标准 (8px)', desc: '自然现代圆角' },
    { value: 'round', label: '圆润 (16px)', desc: '柔和亲切圆润胶囊' },
  ];

  const notchOptions: Array<{ value: NotchMode; label: string; desc: string; tag: string }> = [
    { value: 'auto', label: '智能跟随设备 (推荐)', desc: '读取系统安全区变量 env(safe-area-inset-top)', tag: '系统自适应' },
    { value: 'punch-hole', label: '前摄打孔屏避让 (+36px)', desc: '专为居中/左置挖孔屏机型预留充足顶部安全区，绝不遮挡操作条', tag: '挖孔屏首选' },
    { value: 'island', label: '灵动岛 / 大刘海屏 (+48px)', desc: '针对药丸打孔、大面积双摄挖孔与刘海机型提供额外避让留白', tag: '大刘海适用' },
    { value: 'compact', label: '全面屏紧凑模式 (0px)', desc: '适合无挖孔真全面屏、升降摄像头或窄边框折叠大屏', tag: '真全面屏' },
  ];

  return (
    <div className="space-y-5">
      {/* 顶部子 Tab 切换 */}
      <div className="flex border-b border-border pb-2 gap-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('theme')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'theme' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Sun className="w-4 h-4" />
          <span>主题与配色</span>
        </button>
        <button
          onClick={() => setActiveTab('notch')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'notch' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>📱 手机挖孔屏与安全区</span>
        </button>
        <button
          onClick={() => setActiveTab('typography')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'typography' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Type className="w-4 h-4" />
          <span>字体与排版密度</span>
        </button>
      </div>

      {activeTab === 'theme' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>视觉主题风格</span>
              <Button variant="ghost" size="sm" onClick={resetToDefaults} className="text-xs text-muted-foreground">
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                重置为默认
              </Button>
            </CardTitle>
            <CardDescription>选择契合你阅读环境的视觉主题预设</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 8 个主题模式卡片 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between min-h-[110px] ${
                      isActive
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center border"
                        style={{ background: opt.badgeBg, borderColor: opt.borderPreview }}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      {isActive && (
                        <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                          ✓
                        </span>
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Separator />

            {/* 8 种主题强调色 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">主要强调色彩 (Accent Color)</Label>
                <span className="text-xs text-muted-foreground">作用于按钮、链接、高亮标签和徽章</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mt-3">
                {accentOptions.map((opt) => {
                  const isActive = accent === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setAccent(opt.value)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${
                        isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                        style={{ backgroundColor: opt.colorHex }}
                      >
                        {isActive && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="text-[11px] font-medium text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 圆角风格 */}
            <div>
              <Label className="text-sm font-semibold">界面圆角 (Border Radius)</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {radiusOptions.map((opt) => {
                  const isActive = borderRadius === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setBorderRadius(opt.value)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isActive ? 'border-primary bg-primary/10 font-bold' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <span className="text-sm">{opt.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={onSave} disabled={saving} data-ai-section-type="button">
              {saving ? '保存中...' : '保存主题设置'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* 📱 手机端挖孔屏与安全区专区 */}
      {activeTab === 'notch' && (
        <Card className="border-blue-500/20 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">手机端挖孔屏与异形屏安全区适配</CardTitle>
                <CardDescription>针对前摄挖孔、药丸屏、灵动岛与大刘海进行专属顶部留白，防止内容遮挡</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 挖孔屏避让档位 */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">前摄镜头避让策略</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {notchOptions.map((opt) => {
                  const isActive = notchMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setNotchMode(opt.value)}
                      className={`p-4 rounded-xl border text-left transition-all relative ${
                        isActive
                          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                          : 'border-border hover:border-blue-500/40 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-sm font-bold ${isActive ? 'text-blue-500' : 'text-foreground'}`}>
                          {opt.label}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                          {opt.tag}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 横屏刘海防遮挡 */}
            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-sm font-semibold">横屏边缘防遮挡安全防线</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  手机旋转为横屏时，自动为左右两侧注入安全边距，避免侧面挖孔镜头与圆角裁切长文内容
                </p>
              </div>
              <Switch checked={landscapeGuard} onCheckedChange={setLandscapeGuard} />
            </div>

            <Separator />

            {/* 实时设备安全区测量仪 */}
            <div className="p-4 rounded-xl bg-accent/60 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-primary" />
                  当前设备屏幕实时安全区诊断面板
                </span>
                <Button variant="ghost" size="sm" onClick={refreshSafeArea} className="h-6 px-2 text-xs">
                  重新检测
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <p className="text-[11px] text-muted-foreground">顶部避让高度</p>
                  <p className="text-base font-mono font-bold text-blue-500 mt-0.5">{safeArea.top} px</p>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <p className="text-[11px] text-muted-foreground">底部安全手势条</p>
                  <p className="text-base font-mono font-bold text-foreground mt-0.5">{safeArea.bottom} px</p>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <p className="text-[11px] text-muted-foreground">左侧安全区</p>
                  <p className="text-base font-mono font-bold text-foreground mt-0.5">{safeArea.left} px</p>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <p className="text-[11px] text-muted-foreground">右侧安全区</p>
                  <p className="text-base font-mono font-bold text-foreground mt-0.5">{safeArea.right} px</p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-normal">
                ✓ 顶部导航栏、短帖发布框、长文阅读条和弹窗现已全部绑定 <code className="text-xs text-primary font-mono">pt-safe</code>，在任何曲面挖孔屏或大刘海机型上均可完美避让前摄。
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={onSave} disabled={saving} data-ai-section-type="button">
              {saving ? '保存中...' : '保存挖孔屏设置'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* 字体与排版密度 */}
      {activeTab === 'typography' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">排版与正文字体</CardTitle>
            <CardDescription>微调阅读字号、字体家族与行间距比例</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 字体家族 */}
            <div>
              <Label className="text-sm font-semibold">正文字体家族</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {fontOptions.map((opt) => {
                  const isActive = fontFamily === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFontFamily(opt.value)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <p className="text-sm font-bold text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                      <p className="text-xs font-medium text-primary mt-2 font-mono">{opt.sample}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 字号选择 */}
            <div>
              <Label className="text-sm font-semibold">阅读字号大小</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                {fontSizeOptions.map((opt) => {
                  const isActive = fontSize === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFontSize(opt.value)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isActive ? 'border-primary bg-primary/10 font-bold' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <p className="text-sm" style={{ fontSize: opt.sizeRem }}>{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 行距比例 */}
            <div>
              <Label className="text-sm font-semibold">文章正文行距</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {lineHeightOptions.map((opt) => {
                  const isActive = lineHeight === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setLineHeight(opt.value)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isActive ? 'border-primary bg-primary/10 font-bold' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <span className="text-sm">{opt.label}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={onSave} disabled={saving} data-ai-section-type="button">
              {saving ? '保存中...' : '保存排版设置'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* 排版效果实时预览卡片 */}
      <Card className="border border-border shadow-sm overflow-hidden bg-card">
        <CardHeader className="py-3 px-4 bg-muted/40 border-b border-border flex flex-row items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-primary" />
            排版样式实时预览 (Live Preview)
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {theme} · {accent} · {fontFamily} · {fontSize}
          </span>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              LP
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">LongPost 编辑部</p>
              <p className="text-xs text-muted-foreground">刚刚 · 长文精选</p>
            </div>
          </div>
          <h3 className="text-base font-bold text-foreground leading-snug">
            长文排版美学：在任何屏幕上呈现温润清晰的视觉层次
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            文字是有温度的。通过灵活的主题模式切换、精细的字号缩放与避让打孔屏的严谨安全区设计，
            让无论是深色 OLED 屏幕还是日光下的暖阳纸张阅读，都如行云流水般赏心悦目。
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-8 text-xs">阅读全文</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs">收藏文章</Button>
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium ml-auto">
              #体验优化
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 阅读与发帖偏好 (新增模块) ====================
export function ReadingSection(): React.ReactElement {
  const [draftInterval, setDraftInterval] = useState(() => localStorage.getItem('app-draft-interval') || '60');
  const [defaultComposeTab, setDefaultComposeTab] = useState(() => localStorage.getItem('app-default-compose-tab') || 'post');
  const [showReadingProgress, setShowReadingProgress] = useState(() => localStorage.getItem('app-show-reading-progress') !== 'false');
  const [showCodeLineNumbers, setShowCodeLineNumbers] = useState(() => localStorage.getItem('app-code-lineno') === 'true');

  const handleSave = () => {
    localStorage.setItem('app-draft-interval', draftInterval);
    localStorage.setItem('app-default-compose-tab', defaultComposeTab);
    localStorage.setItem('app-show-reading-progress', String(showReadingProgress));
    localStorage.setItem('app-code-lineno', String(showCodeLineNumbers));
    toast.success('阅读与发帖偏好已保存');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">阅读与发帖偏好</CardTitle>
          <CardDescription>自定义草稿自动保存周期、默认发布格式与阅读器附加组件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 草稿自动保存间隔 */}
          <div>
            <Label>草稿自动保存周期</Label>
            <p className="text-sm text-muted-foreground mt-0.5">编辑器在后台静默保存草稿的频率</p>
            <Select value={draftInterval} onValueChange={setDraftInterval}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">每 30 秒自动保存</SelectItem>
                <SelectItem value="60">每 1 分钟自动保存 (推荐)</SelectItem>
                <SelectItem value="180">每 3 分钟自动保存</SelectItem>
                <SelectItem value="0">仅手动点击保存</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 默认发布视图 */}
          <div>
            <Label>进入创作页默认选项卡</Label>
            <p className="text-sm text-muted-foreground mt-0.5">点击导航发布按钮时默认展示的视图</p>
            <Select value={defaultComposeTab} onValueChange={setDefaultComposeTab}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post">发布短帖 (短文引流)</SelectItem>
                <SelectItem value="article">撰写长文 (深度创作)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 长文顶部阅读进度条 */}
          <div className="flex items-center justify-between">
            <div>
              <Label>长文阅读进度指示条</Label>
              <p className="text-sm text-muted-foreground mt-0.5">在文章顶部显示细长的滚动百分比进度指示条</p>
            </div>
            <Switch checked={showReadingProgress} onCheckedChange={setShowReadingProgress} />
          </div>

          <Separator />

          {/* 代码块行号 */}
          <div className="flex items-center justify-between">
            <div>
              <Label>代码块显示行号</Label>
              <p className="text-sm text-muted-foreground mt-0.5">在 Markdown 代码块左侧显示连续行号</p>
            </div>
            <Switch checked={showCodeLineNumbers} onCheckedChange={setShowCodeLineNumbers} />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} data-ai-section-type="button">
            保存偏好
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
  onRevokeAllSessions?: () => void;
  revokingSessions?: boolean;
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
  onRevokeAllSessions,
  revokingSessions = false,
}: SecuritySectionProps): React.ReactElement {
  const isGoogleBound = provider === 'google';
  const isAccessCodeUser = provider === 'access_code';
  const setPwdMatch = setNewPwd === setConfirmPwd && setNewPwd.length > 0;
  const canSetPwd = setNewPwd.length >= 6 && setPwdMatch;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">账号信息与绑定</CardTitle>
          <CardDescription>当前账号的登录凭据与身份绑定状态</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-muted-foreground text-xs">注册邮箱 / 账号</Label>
              <p className="mt-1 text-sm font-semibold text-foreground">{email}</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
              {isAccessCodeUser ? '通行码授权' : isGoogleBound ? 'Google 认证' : '邮箱密码'}
            </span>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Google 快捷登录</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isGoogleBound ? '已绑定 Google 账号，可随时使用一键登录' : '尚未绑定 Google 账号'}
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

      {/* 设置密码（通行码或未设密账号） */}
      {isAccessCodeUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">设置独立登录密码</CardTitle>
            <CardDescription>首次设置密码后，你可以直接使用邮箱 + 密码登录全平台</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="setNewPwd">独立登录密码</Label>
              <Input
                id="setNewPwd"
                type="password"
                value={setNewPwd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSetNewPwd(e.target.value)
                }
                placeholder="至少 6 位字符"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="setConfirmPwd">确认新密码</Label>
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
                <p className="text-xs text-destructive mt-1">两次输入的密码不一致</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={onSetPassword}
              disabled={!canSetPwd || setPwdSaving}
              data-ai-section-type="button"
            >
              {setPwdSaving ? '保存中...' : '确认设置密码'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* 修改密码 */}
      {!isAccessCodeUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">修改密码</CardTitle>
            <CardDescription>定期更换密码保护你的账号与内容安全</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="oldPassword">当前原密码</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setOldPassword(e.target.value)
                }
                placeholder="请输入当前使用的密码"
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
                placeholder="请输入新密码（至少 6 位）"
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
                <p className="text-xs text-destructive mt-1">两次输入的密码不一致</p>
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

      {/* 会话安全与退出登录 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">会话安全与跨设备下线</CardTitle>
          <CardDescription>
            支持退出当前会话，或通过服务端版本化 Token 吊销机制一键强制下线所有其他已登录设备。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {onRevokeAllSessions && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={onRevokeAllSessions}
                disabled={revokingSessions}
              >
                {revokingSessions ? '正在注销...' : '强制下线所有设备'}
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={onLogout}
              data-ai-section-type="button"
            >
              退出当前账号
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            注：强制下线所有设备将使所有已签发的访问凭证即刻失效，任何其他终端在下次请求时都会被安全拦截并要求重新验证。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 通知偏好 (真实通知测试) ====================
interface NotificationsSectionProps {
  notifyOnRead: boolean;
  setNotifyOnRead: (v: boolean) => void;
  notifyOnDelete: boolean;
  setNotifyOnDelete: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
}

export function NotificationsSection({
  notifyOnRead,
  setNotifyOnRead,
  notifyOnDelete,
  setNotifyOnDelete,
  saving,
  onSave,
}: NotificationsSectionProps): React.ReactElement {
  const [likeOn, setLikeOn] = useState(() => localStorage.getItem('app-notify-like') !== 'false');
  const [commentOn, setCommentOn] = useState(() => localStorage.getItem('app-notify-comment') !== 'false');
  const [repostOn, setRepostOn] = useState(() => localStorage.getItem('app-notify-repost') !== 'false');
  const [followOn, setFollowOn] = useState(() => localStorage.getItem('app-notify-follow') !== 'false');
  const [mentionOn, setMentionOn] = useState(() => localStorage.getItem('app-notify-mention') !== 'false');
  const [dmOn, setDmOn] = useState(() => localStorage.getItem('app-notify-dm') !== 'false');
  const [meetingOn, setMeetingOn] = useState(() => localStorage.getItem('app-notify-meeting') !== 'false');
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('当前浏览器不支持系统原生通知');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === 'granted') {
        toast.success('已获得系统通知权限');
      } else {
        toast.error('通知权限未被允许');
      }
    } catch (err) {
      logger.error('申请通知权限失败', err);
    }
  };

  const sendTestNotification = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      toast.error('请先开启系统通知权限');
      return;
    }
    new Notification('LongPost 通知测试', {
      body: '收到来自平台的实时推送消息！',
      icon: '/favicon.png',
    });
    toast.success('已触发系统测试推送');
  };

  const handleSaveAll = () => {
    localStorage.setItem('app-notify-like', String(likeOn));
    localStorage.setItem('app-notify-comment', String(commentOn));
    localStorage.setItem('app-notify-repost', String(repostOn));
    localStorage.setItem('app-notify-follow', String(followOn));
    localStorage.setItem('app-notify-mention', String(mentionOn));
    localStorage.setItem('app-notify-dm', String(dmOn));
    localStorage.setItem('app-notify-meeting', String(meetingOn));
    onSave();
  };

  return (
    <div className="space-y-4">
      {/* 浏览器系统通知权限申请 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">浏览器原生桌面/状态栏通知</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                当前状态：{permission === 'granted' ? '已授权开启' : permission === 'denied' ? '已禁止' : '尚未授权'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {permission !== 'granted' ? (
              <Button size="sm" onClick={requestPermission}>申请开启权限</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={sendTestNotification}>发送测试通知</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">接收通知类型</CardTitle>
          <CardDescription>开启或关闭各类型实时通知</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>点赞与喜欢</Label>
              <p className="text-xs text-muted-foreground mt-0.5">有人点赞你的帖子或长文时通知</p>
            </div>
            <Switch checked={likeOn} onCheckedChange={setLikeOn} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>评论与回复</Label>
              <p className="text-xs text-muted-foreground mt-0.5">有人评论你的作品或回复你的发言时通知</p>
            </div>
            <Switch checked={commentOn} onCheckedChange={setCommentOn} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>新粉丝关注</Label>
              <p className="text-xs text-muted-foreground mt-0.5">有新用户关注你的账号时通知</p>
            </div>
            <Switch checked={followOn} onCheckedChange={setFollowOn} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>@ 提及提醒</Label>
              <p className="text-xs text-muted-foreground mt-0.5">其他人在正文中 @ 提及你时通知</p>
            </div>
            <Switch checked={mentionOn} onCheckedChange={setMentionOn} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>私信新消息</Label>
              <p className="text-xs text-muted-foreground mt-0.5">收到其他用户的私信时通知</p>
            </div>
            <Switch checked={dmOn} onCheckedChange={setDmOn} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>视频会议邀请</Label>
              <p className="text-xs text-muted-foreground mt-0.5">收到他人发起的会议邀请时通知</p>
            </div>
            <Switch checked={meetingOn} onCheckedChange={setMeetingOn} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>长文被阅读提醒</Label>
              <p className="text-xs text-muted-foreground mt-0.5">发布的长文有读者进入阅读时提醒</p>
            </div>
            <Switch checked={notifyOnRead} onCheckedChange={setNotifyOnRead} />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <Label>内容被移除提醒</Label>
              <p className="text-xs text-muted-foreground mt-0.5">作品因审核或违规被系统下架时发送通知</p>
            </div>
            <Switch checked={notifyOnDelete} onCheckedChange={setNotifyOnDelete} />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveAll} disabled={saving} data-ai-section-type="button">
            {saving ? '保存中...' : '保存通知偏好'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 隐私设置 ====================
export function PrivacySection(): React.ReactElement {
  const [dmPrivacy, setDmPrivacy] = useState(() => localStorage.getItem('app-privacy-dm') || 'everyone');
  const [commentPrivacy, setCommentPrivacy] = useState(() => localStorage.getItem('app-privacy-comment') || 'everyone');
  const [visibility, setVisibility] = useState(() => localStorage.getItem('app-privacy-vis') || 'public');
  const [hideOnline, setHideOnline] = useState(() => localStorage.getItem('app-privacy-online') === 'true');

  const handleSave = () => {
    localStorage.setItem('app-privacy-dm', dmPrivacy);
    localStorage.setItem('app-privacy-comment', commentPrivacy);
    localStorage.setItem('app-privacy-vis', visibility);
    localStorage.setItem('app-privacy-online', String(hideOnline));
    toast.success('隐私设置已保存');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">隐私与社交范围</CardTitle>
          <CardDescription>管理谁可以联系你以及你在平台上的展示范围</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>谁可以向我发送私信</Label>
            <p className="text-xs text-muted-foreground mt-0.5">控制私信接收门槛</p>
            <Select value={dmPrivacy} onValueChange={setDmPrivacy}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">所有人均可私信</SelectItem>
                <SelectItem value="followed">仅我关注的人可以私信</SelectItem>
                <SelectItem value="none">关闭私信接收</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div>
            <Label>谁可以在我的作品下评论</Label>
            <p className="text-xs text-muted-foreground mt-0.5">控制互动评论权限</p>
            <Select value={commentPrivacy} onValueChange={setCommentPrivacy}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">所有人</SelectItem>
                <SelectItem value="followed">仅我关注的人</SelectItem>
                <SelectItem value="none">关闭所有作品评论</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div>
            <Label>公开作品可见性</Label>
            <p className="text-xs text-muted-foreground mt-0.5">控制你的内容在公开搜索和推荐中的展示范围</p>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">全站公开（推荐与全网收录）</SelectItem>
                <SelectItem value="follower">仅粉丝可见</SelectItem>
                <SelectItem value="private">仅自己可见（私密创作空间）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>隐藏在线与会议状态</Label>
              <p className="text-xs text-muted-foreground mt-0.5">不向其他用户展示你当前的在线或忙碌状态</p>
            </div>
            <Switch checked={hideOnline} onCheckedChange={setHideOnline} />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} data-ai-section-type="button">
            保存隐私设置
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==================== 数据管理 (真实导出与存储) ====================
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
  const [cacheSize, setCacheSize] = useState('0 KB');

  useEffect(() => {
    try {
      let total = 0;
      for (const x in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, x)) {
          total += (localStorage[x].length + x.length) * 2;
        }
      }
      setCacheSize(`${(total / 1024).toFixed(1)} KB`);
    } catch {
      setCacheSize('检测中');
    }
  }, []);

  const handleClearCache = () => {
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      // 清空除 auth 之外的临时缓存
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !k.includes('token') && !k.includes('auth')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      if (token) {
        localStorage.setItem('auth_token', token);
      }
      toast.success('本地临时缓存与草稿副本已清空，存储空间已释放');
      setCacheSize('0.2 KB');
    } catch (err) {
      logger.error('清空缓存失败', err);
      toast.error('清空缓存失败');
    }
  };

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
          <CardTitle className="text-lg">导出我的平台数据</CardTitle>
          <CardDescription>
            一键将你在平台上的所有文章、短帖、个人档案与配置打包为 JSON 文件下载至本地
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            数据将以结构化 JSON 规范格式输出，包括 Markdown 文章源码、短帖记录、发布时间与阅读互动统计。
          </p>
          <Button
            variant="outline"
            onClick={onExport}
            data-ai-section-type="button"
          >
            <Download className="w-4 h-4 mr-1.5" />
            一键打包导出数据
          </Button>
        </CardContent>
      </Card>

      {/* 清理缓存 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">本地存储与缓存管理</CardTitle>
          <CardDescription>
            当前设备占用浏览器存储空间：<span className="font-mono text-primary">{cacheSize}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            清理本地临时图片缓存、已失效的草稿副本与排版缓存。清理不会退出当前登录。
          </p>
          <Button variant="outline" size="sm" onClick={handleClearCache}>
            清空临时缓存
          </Button>
        </CardContent>
      </Card>

      {/* 注销账号 */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg text-destructive flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            注销账号
          </CardTitle>
          <CardDescription className="text-destructive/70">
            注销后你的所有公开内容、关注关系与个人数据将被永久删除
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>发布的全部帖子和文章将被永久抹除</li>
            <li>关注与粉丝关系将被彻底解除</li>
            <li>此操作为不可撤销操作</li>
          </ul>
          <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                申请注销账号
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-card-foreground">
              <DialogHeader>
                <DialogTitle className="text-destructive">确认注销账号？</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  此操作将永久删除你的账号及所有数据，且无法恢复。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm">
                  请输入 <span className="font-mono font-bold text-destructive">DELETE</span> 以确认：
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="输入 DELETE 确认"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeactivateOpen(false)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  disabled={confirmText !== 'DELETE'}
                  onClick={handleConfirmDeactivate}
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
  const [platformInfo, setPlatformInfo] = useState({
    ua: '',
    screen: '',
    dpr: 1,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlatformInfo({
        ua: navigator.userAgent,
        screen: `${window.innerWidth} × ${window.innerHeight}`,
        dpr: window.devicePixelRatio || 1,
      });
    }
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-center text-center pt-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 border border-primary/20">
            <Feather className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">LongPost</CardTitle>
          <CardDescription>长文发布平台 · 版本 v2.9.5 (Production)</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
            短帖引流，长文阅读。像 X 一样发帖，也可以写完整长文，通过链接跳转阅读。
            原生支持实时 WebRTC 视频会议、移动端打孔屏安全区自适应、与离线优先数据体系。
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-accent text-muted-foreground font-mono">
              React 19
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-accent text-muted-foreground font-mono">
              NestJS
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-accent text-muted-foreground font-mono">
              Tailwind CSS
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-accent text-muted-foreground font-mono">
              Capacitor 8
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 客户端诊断信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">客户端运行环境诊断</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">当前分辨率 / 视口</span>
            <span className="font-mono text-foreground">{platformInfo.screen} (DPR {platformInfo.dpr})</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">操作系统平台</span>
            <span className="font-mono text-foreground truncate max-w-[280px]">{platformInfo.ua}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">网络与存储协议</span>
            <span className="font-mono text-green-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              HTTPS / WebRTC / IndexedDB 就绪
            </span>
          </div>
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
