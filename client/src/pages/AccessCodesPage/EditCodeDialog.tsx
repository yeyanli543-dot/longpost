import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Label } from '@client/src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@client/src/components/ui/popover';
import { Calendar } from '@client/src/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { accessCodesApi } from '@client/src/api';
import type {
  UpdateAccessCodeRequest,
  AccessCodeItem,
  UserRole,
} from '@shared/api.interface';
import dayjs from 'dayjs';

interface EditCodeDialogProps {
  open: boolean;
  item: AccessCodeItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (item: AccessCodeItem) => void;
}

type ExpiryMode = 'permanent' | 'date';
type UsesMode = 'unlimited' | 'once' | 'custom';

export default function EditCodeDialog({
  open,
  item,
  onOpenChange,
  onSuccess,
}: EditCodeDialogProps): React.ReactElement {
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('permanent');
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [usesMode, setUsesMode] = useState<UsesMode>('unlimited');
  const [customUses, setCustomUses] = useState<string>('10');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && item) {
      setNickname(item.nickname);
      setUsername(item.username ?? '');
      setRole(item.role);
      if (item.expiresAt) {
        setExpiryMode('date');
        setExpiryDate(new Date(item.expiresAt));
      } else {
        setExpiryMode('permanent');
        setExpiryDate(undefined);
      }
      if (item.maxUses === null) {
        setUsesMode('unlimited');
      } else if (item.maxUses === 1) {
        setUsesMode('once');
      } else {
        setUsesMode('custom');
        setCustomUses(String(item.maxUses));
      }
      setNote(item.note ?? '');
    }
  }, [open, item]);

  const handleSubmit = async (): Promise<void> => {
    if (!item) return;
    if (!nickname.trim()) {
      toast.error('请输入成员昵称');
      return;
    }
    if (nickname.length > 100) {
      toast.error('昵称不能超过 100 字');
      return;
    }
    if (username.length > 100) {
      toast.error('用户名不能超过 100 字');
      return;
    }
    if (note.length > 500) {
      toast.error('备注不能超过 500 字');
      return;
    }
    if (expiryMode === 'date' && !expiryDate) {
      toast.error('请选择有效期日期');
      return;
    }
    if (usesMode === 'custom') {
      const num = Number(customUses);
      if (!Number.isInteger(num) || num <= 0) {
        toast.error('请输入有效的使用次数');
        return;
      }
    }

    const payload: UpdateAccessCodeRequest = {
      nickname: nickname.trim(),
      username: username.trim(),
      role,
      expiresAt:
        expiryMode === 'date' && expiryDate
          ? expiryDate.toISOString()
          : null,
      maxUses:
        usesMode === 'unlimited'
          ? null
          : usesMode === 'once'
            ? 1
            : Number(customUses),
      note: note.trim(),
    };

    setSubmitting(true);
    try {
      const updated = await accessCodesApi.updateAccessCode(item.id, payload);
      toast.success('通行码已更新');
      onSuccess(updated);
      onOpenChange(false);
    } catch (err) {
      logger.error('更新通行码失败', err);
      toast.error('更新失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16181c] border-[#2f3336] text-[#e7e9ea] max-w-md sm:max-w-md max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-w-full max-sm:p-4 max-sm:max-h-[85vh] max-sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#e7e9ea]">编辑通行码</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">成员昵称 <span className="text-red-400">*</span></Label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={100}
              className="bg-black border-[#2f3336] text-[#e7e9ea] placeholder:text-[#71767b]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">用户名（可选）</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={100}
              className="bg-black border-[#2f3336] text-[#e7e9ea] placeholder:text-[#71767b]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">角色</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="w-full bg-black border-[#2f3336] text-[#e7e9ea]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16181c] border-[#2f3336] text-[#e7e9ea]">
                <SelectItem value="user">普通成员</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">有效期</Label>
            <Select
              value={expiryMode}
              onValueChange={(v) => setExpiryMode(v as ExpiryMode)}
            >
              <SelectTrigger className="w-full bg-black border-[#2f3336] text-[#e7e9ea]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16181c] border-[#2f3336] text-[#e7e9ea]">
                <SelectItem value="permanent">永久有效</SelectItem>
                <SelectItem value="date">指定日期</SelectItem>
              </SelectContent>
            </Select>
            {expiryMode === 'date' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal bg-black border-[#2f3336] text-[#e7e9ea]"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expiryDate
                      ? dayjs(expiryDate).format('YYYY-MM-DD')
                      : '选择日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#16181c] border-[#2f3336]">
                  <Calendar
                    mode="single"
                    selected={expiryDate}
                    onSelect={setExpiryDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">可使用次数</Label>
            <Select
              value={usesMode}
              onValueChange={(v) => setUsesMode(v as UsesMode)}
            >
              <SelectTrigger className="w-full bg-black border-[#2f3336] text-[#e7e9ea]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16181c] border-[#2f3336] text-[#e7e9ea]">
                <SelectItem value="unlimited">不限次数</SelectItem>
                <SelectItem value="once">仅首次登录有效</SelectItem>
                <SelectItem value="custom">自定义次数</SelectItem>
              </SelectContent>
            </Select>
            {usesMode === 'custom' && (
              <Input
                type="number"
                min={1}
                value={customUses}
                onChange={(e) => setCustomUses(e.target.value)}
                className="bg-black border-[#2f3336] text-[#e7e9ea]"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-[#e7e9ea]">备注（可选）</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="bg-black border-[#2f3336] text-[#e7e9ea] placeholder:text-[#71767b] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[#2f3336] text-[#e7e9ea]"
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white border-[#1d9bf0]"
          >
            {submitting ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
