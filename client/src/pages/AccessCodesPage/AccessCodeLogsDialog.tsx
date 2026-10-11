import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
} from 'lucide-react';
import { accessCodesApi } from '@client/src/api';
import type {
  AccessCodeLogItem,
} from '@shared/api.interface';
import dayjs from 'dayjs';

const PAGE_SIZE = 10;

interface AccessCodeLogsDialogProps {
  open: boolean;
  codeId: string | null;
  codeValue?: string;
  onOpenChange: (open: boolean) => void;
}

export default function AccessCodeLogsDialog({
  open,
  codeId,
  codeValue = '',
  onOpenChange,
}: AccessCodeLogsDialogProps): React.ReactElement {
  const [items, setItems] = useState<AccessCodeLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (): Promise<void> => {
    if (!open || !codeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await accessCodesApi.getAccessCodeLogs(codeId, page, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取访问码使用记录失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [open, codeId, page]);

  useEffect(() => {
    if (!open || !codeId) return;
    setPage(1);
    setItems([]);
    setTotal(0);
    setError(null);
  }, [open, codeId]);

  useEffect(() => {
    if (!open || !codeId) return;
    void fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16181c] border-[#2f3336] text-[#e7e9ea] max-w-lg sm:max-w-lg max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-w-full max-sm:p-4 max-sm:max-h-[85vh] max-sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#e7e9ea] flex items-center gap-2">
            <History size={18} />
            使用记录
            <span className="text-sm text-[#71767b] font-normal font-mono">
              {codeValue}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-12 text-xs text-[#71767b] px-3 py-2 bg-black/50 rounded-md">
            <div className="col-span-3">时间</div>
            <div className="col-span-3">IP 地址</div>
            <div className="col-span-2">结果</div>
            <div className="col-span-4">登录用户</div>
          </div>

          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 size={24} className="animate-spin" />
              <p className="mt-2 text-sm">加载中...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchLogs()}>
                重试
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <History size={24} />
              <p className="mt-2 text-sm">暂无记录</p>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 items-center px-3 py-2 text-sm hover:bg-black/40 rounded-md transition-colors"
                >
                  <div className="col-span-3 text-[#71767b] text-xs">
                    {dayjs(item.createdAt).format('MM-DD HH:mm:ss')}
                  </div>
                  <div className="col-span-3 text-[#e7e9ea] font-mono text-xs">
                    {item.ipAddress || '-'}
                  </div>
                  <div className="col-span-2">
                    <Badge
                      className={`${
                        item.success
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/30'
                      } px-2 py-0.5 text-xs font-medium rounded`}
                    >
                      {item.success ? '成功' : '失败'}
                    </Badge>
                  </div>
                  <div className="col-span-4">
                    {item.success ? (
                      <span className="text-[#e7e9ea] truncate">
                        {item.loggedInUserId || '-'}
                      </span>
                    ) : (
                      <span className="text-[#71767b] truncate" title={item.errorReason ?? ''}>
                         {item.errorReason || '-'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-[#2f3336]">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border-[#2f3336] text-[#e7e9ea] h-7"
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm text-[#71767b] min-w-[80px] text-center">
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="border-[#2f3336] text-[#e7e9ea] h-7"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
