import { useState } from 'react';
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
import { CalendarIcon, Copy, Download } from 'lucide-react';
import { accessCodesApi } from '@client/src/api';
import type {
  BatchCreateAccessCodeRequest,
  AccessCodeItem,
  UserRole,
} from '@shared/api.interface';
import dayjs from 'dayjs';

interface BatchCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ExpiryMode = 'permanent' | 'date';
type UsesMode = 'unlimited' | 'once' | 'custom';

export default function BatchCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: BatchCreateDialogProps): React.ReactElement {
  const [count, setCount] = useState<string>('10');
  const [role, setRole] = useState<UserRole>('user');
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('permanent');
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [usesMode, setUsesMode] = useState<UsesMode>('unlimited');
  const [customUses, setCustomUses] = useState<string>('10');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<AccessCodeItem[]>([]);

  const resetForm = (): void => {
    setCount('10');
    setRole('user');
    setExpiryMode('permanent');
    setExpiryDate(undefined);
    setUsesMode('unlimited');
    setCustomUses('10');
    setNote('');
    setSubmitting(false);
    setGeneratedItems([]);
  };

  const handleSubmit = async (): Promise<void> => {
    const num = Number(count);
    if (!Number.isInteger(num) || num < 1 || num > 100) {
      toast.error('数量必须是 1-100 之间的整数');
      return;
    }
    if (expiryMode === 'date' && !expiryDate) {
      toast.error('请选择有效期日期');
      return;
    }
    if (usesMode === 'custom') {
      const usesNum = Number(customUses);
      if (!Number.isInteger(usesNum) || usesNum <= 0) {
        toast.error('请输入有效的使用次数');
        return;
      }
    }
    if (note.length > 500) {
      toast.error('备注不能超过 500 字');
      return;
    }

    const payload: BatchCreateAccessCodeRequest = {
      count: num,
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
      note: note.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const res = await accessCodesApi.batchCreateAccessCodes(payload);
      setGeneratedItems(res.items);
      toast.success(`成功生成 ${res.items.length} 个通行码`);
      onSuccess();
    } catch (err) {
      logger.error('批量创建通行码失败', err);
      toast.error('生成失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyAll = async (): Promise<void> => {
    const text = generatedItems.map((item) => item.code).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制全部通行码');
    } catch (err) {
      logger.error('复制失败', err);
      toast.error('复制失败，请手动复制');
    }
  };

  const handleClose = (): void => {
    onOpenChange(false);
    setTimeout(resetForm, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg sm:max-w-lg max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-w-full max-sm:p-4 max-sm:max-h-[85vh] max-sm:overflow-y-auto max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">批量生成通行码</DialogTitle>
        </DialogHeader>

        {generatedItems.length === 0 ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-foreground">数量（1-100）</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="bg-background border-border text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">角色</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger className="w-full bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="user">普通成员</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">有效期</Label>
              <Select
                value={expiryMode}
                onValueChange={(v) => setExpiryMode(v as ExpiryMode)}
              >
                <SelectTrigger className="w-full bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="permanent">永久有效</SelectItem>
                  <SelectItem value="date">指定日期</SelectItem>
                </SelectContent>
              </Select>
              {expiryMode === 'date' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-background border-border text-foreground"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expiryDate
                        ? dayjs(expiryDate).format('YYYY-MM-DD')
                        : '选择日期'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border">
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
              <Label className="text-foreground">可使用次数</Label>
              <Select
                value={usesMode}
                onValueChange={(v) => setUsesMode(v as UsesMode)}
              >
                <SelectTrigger className="w-full bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
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
                  className="bg-background border-border text-foreground"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">备注（可选）</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                className="bg-background border-border text-foreground placeholder:text-muted-foreground resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                共 {generatedItems.length} 个通行码
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                className="border-border text-foreground"
              >
                <Copy size={14} />
                复制全部
              </Button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto border border-border rounded-md bg-background">
              {generatedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center px-3 py-2 border-b border-border last:border-b-0 font-mono text-sm text-foreground"
                >
                  <span className="w-8 text-muted-foreground text-xs">{idx + 1}.</span>
                  <span className="flex-1">{item.code}</span>
                  <Download
                    size={14}
                    className="text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(item.code);
                        toast.success('已复制');
                      } catch (err) {
                        logger.error('复制失败', err);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            className="border-border text-foreground"
          >
            {generatedItems.length > 0 ? '关闭' : '取消'}
          </Button>
          {generatedItems.length === 0 && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground border-primary"
            >
              {submitting ? '生成中...' : '批量生成'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
