import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Label } from '@client/src/components/ui/label';
import { Switch } from '@client/src/components/ui/switch';
import { X, Plus, Loader2, Search, Users } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Image } from '@client/src/components/ui/image';
import { meetingsApi, dmApi } from '@client/src/api';
import type { AuthUser } from '@shared/api.interface';

export interface MeetingFormData {
  title: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  isPublic: boolean;
  participantIds: string[];
}

interface CreateMeetingModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialData?: Partial<MeetingFormData>;
  mode?: 'create' | 'edit';
  meetingId?: string;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 45, label: '45 分钟' },
  { value: 60, label: '1 小时' },
  { value: 90, label: '1 小时 30 分' },
  { value: 120, label: '2 小时' },
];

const CreateMeetingModal = ({
  open,
  onClose,
  onCreated,
  initialData,
  mode = 'create',
  meetingId,
}: CreateMeetingModalProps) => {
  const defaultStartTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30));
    now.setSeconds(0);
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    const h = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  };

  const [formData, setFormData] = useState<MeetingFormData>({
    title: '',
    description: '',
    startTime: defaultStartTime(),
    durationMinutes: 60,
    isPublic: false,
    participantIds: [],
  });

  const [participants, setParticipants] = useState<AuthUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AuthUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load initial data
  useEffect(() => {
    if (open) {
      if (initialData) {
        setFormData({
          title: initialData.title ?? '',
          description: initialData.description ?? '',
          startTime: initialData.startTime ?? defaultStartTime(),
          durationMinutes: initialData.durationMinutes ?? 60,
          isPublic: initialData.isPublic ?? false,
          participantIds: initialData.participantIds ?? [],
        });
      } else {
        setFormData({
          title: '',
          description: '',
          startTime: defaultStartTime(),
          durationMinutes: 60,
          isPublic: false,
          participantIds: [],
        });
      }
      setParticipants([]);
      setSearchResults([]);
      setSearchQuery('');
      setErrors({});
      setShowSearch(false);
    }
  }, [open, initialData]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const response = await dmApi.searchUsers(query);
      // Filter out already added participants
      const filtered = response.items.filter(
        (u) => !formData.participantIds.includes(u.id),
      );
      setSearchResults(filtered);
    } catch (err) {
      logger.error('搜索用户失败', err);
    } finally {
      setSearching(false);
    }
  };

  const addParticipant = (user: AuthUser) => {
    if (formData.participantIds.includes(user.id)) return;
    setFormData((prev) => ({
      ...prev,
      participantIds: [...prev.participantIds, user.id],
    }));
    setParticipants((prev) => [...prev, user]);
    setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
    setSearchQuery('');
  };

  const removeParticipant = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      participantIds: prev.participantIds.filter((id) => id !== userId),
    }));
    setParticipants((prev) => prev.filter((u) => u.id !== userId));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = '请输入会议标题';
    if (!formData.startTime) newErrors.startTime = '请选择开始时间';
    if (formData.durationMinutes <= 0) newErrors.durationMinutes = '请选择会议时长';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === 'edit' && meetingId) {
        await meetingsApi.updateMeeting(meetingId, {
          title: formData.title,
          description: formData.description || undefined,
          startTime: new Date(formData.startTime).toISOString(),
          durationMinutes: formData.durationMinutes,
          isPublic: formData.isPublic,
        });
      } else {
        await meetingsApi.createMeeting({
          title: formData.title,
          description: formData.description || undefined,
          startTime: new Date(formData.startTime).toISOString(),
          durationMinutes: formData.durationMinutes,
          isPublic: formData.isPublic,
          participantIds:
            formData.participantIds.length > 0
              ? formData.participantIds
              : undefined,
        });
      }
      onCreated();
    } catch (err) {
      logger.error('提交会议失败', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#16181c] border border-[#2f3336] text-[#e7e9ea] max-w-lg max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-bold">
            {mode === 'edit' ? '编辑会议' : '创建会议'}
          </DialogTitle>
          <DialogDescription className="text-[#71767b]">
            {mode === 'edit'
              ? '修改会议的基本信息'
              : '填写会议信息并邀请参会人'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-[#e7e9ea]">
              会议标题 <span className="text-red-400">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              placeholder="输入会议标题"
              className={`bg-black border-[#2f3336] text-[#e7e9ea] ${errors.title ? 'border-red-500' : ''}`}
            />
            {errors.title && (
              <p className="text-xs text-red-400">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-[#e7e9ea]">
              会议描述
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="输入会议描述（可选）"
              className="bg-black border-[#2f3336] text-[#e7e9ea] min-h-[80px] resize-y"
            />
          </div>

          {/* Start time */}
          <div className="space-y-2">
            <Label htmlFor="startTime" className="text-[#e7e9ea]">
              开始时间 <span className="text-red-400">*</span>
            </Label>
            <Input
              id="startTime"
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) =>
                setFormData((p) => ({ ...p, startTime: e.target.value }))
              }
              className={`bg-black border-[#2f3336] text-[#e7e9ea] ${errors.startTime ? 'border-red-500' : ''}`}
            />
            {errors.startTime && (
              <p className="text-xs text-red-400">{errors.startTime}</p>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">会议时长</Label>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      durationMinutes: opt.value,
                    }))
                  }
                  className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                    formData.durationMinutes === opt.value
                      ? 'bg-[#1d9bf0] border-[#1d9bf0] text-white'
                      : 'bg-black border-[#2f3336] text-[#e7e9ea] hover:border-[#1d9bf0]'
                  }`}
                  data-ai-section-type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Is public */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-[#e7e9ea]">公开会议</p>
              <p className="text-xs text-[#71767b]">
                开启后任何人都可以查看并加入
              </p>
            </div>
            <Switch
              checked={formData.isPublic}
              onCheckedChange={(checked) =>
                setFormData((p) => ({ ...p, isPublic: checked }))
              }
            />
          </div>

          {/* Participants */}
          {mode === 'create' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[#e7e9ea] flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  参会人
                </Label>
                <button
                  type="button"
                  onClick={() => setShowSearch((s) => !s)}
                  className="flex items-center gap-1 text-sm text-[#1d9bf0] hover:text-[#1a8cd8]"
                  data-ai-section-type="button"
                >
                  <Plus className="w-4 h-4" />
                  添加
                </button>
              </div>

              {showSearch && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71767b]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="搜索用户..."
                    className="pl-9 bg-black border-[#2f3336] text-[#e7e9ea]"
                    autoFocus
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-[#1d9bf0] animate-spin" />
                    </div>
                  )}
                  {searchQuery && !searching && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#16181c] border border-[#2f3336] rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {searchResults.map((user) => {
                        const initial = user.nickname
                          ? user.nickname.charAt(0).toUpperCase()
                          : '?';
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => addParticipant(user)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors"
                            data-ai-section-type="button"
                          >
                            <div className="w-8 h-8 rounded-full bg-[#2f3336] flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {user.avatarUrl ? (
                                <Image
                                  src={user.avatarUrl}
                                  alt={user.nickname}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xs font-bold text-gray-300">
                                  {initial}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#e7e9ea] truncate">
                                {user.nickname}
                              </p>
                              <p className="text-xs text-[#71767b] truncate">
                                {user.email}
                              </p>
                            </div>
                            <Plus className="w-4 h-4 text-[#1d9bf0]" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {searchQuery &&
                    !searching &&
                    searchResults.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#16181c] border border-[#2f3336] rounded-lg shadow-lg z-10 p-4 text-center text-sm text-[#71767b]">
                        未找到用户
                      </div>
                    )}
                </div>
              )}

              {formData.participantIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => {
                    const initial = p.nickname
                      ? p.nickname.charAt(0).toUpperCase()
                      : '?';
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#2f3336] rounded-full"
                      >
                        <div className="w-5 h-5 rounded-full bg-[#16181c] flex items-center justify-center overflow-hidden">
                          {p.avatarUrl ? (
                            <Image
                              src={p.avatarUrl}
                              alt={p.nickname}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-gray-400">
                              {initial}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#e7e9ea] truncate max-w-[100px]">
                          {p.nickname}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeParticipant(p.id)}
                          className="p-0.5 rounded-full hover:bg-white/10 text-[#71767b] hover:text-[#e7e9ea] transition-colors"
                          data-ai-section-type="button"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {formData.participantIds.length === 0 && !showSearch && (
                <p className="text-sm text-[#71767b]">暂未添加参会人</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#2f3336] bg-[#16181c]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#71767b] hover:text-[#e7e9ea] transition-colors"
            data-ai-section-type="button"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 text-white font-bold rounded-full transition-colors text-sm flex items-center gap-2"
            data-ai-section-type="button"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'edit' ? '保存' : '创建'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMeetingModal;
