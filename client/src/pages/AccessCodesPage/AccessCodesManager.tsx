import React, { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { accessCodesApi } from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Badge } from '@client/src/components/ui/badge';
import {
  Copy,
  Plus,
  Edit3,
  Trash2,
  Search,
  Power,
  PowerOff,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Users,
} from 'lucide-react';
import type {
  AccessCodeItem,
  AccessCodeStatus,
} from '@shared/api.interface';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import CreateCodeDialog from './CreateCodeDialog';
import EditCodeDialog from './EditCodeDialog';
import BatchCreateDialog from './BatchCreateDialog';
import AccessCodeLogsDialog from './AccessCodeLogsDialog';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const PAGE_SIZE = 10;

function formatRelative(iso: string | null): string {
  if (!iso) return '-';
  return dayjs(iso).fromNow();
}

function getStatusLabel(status: AccessCodeStatus): string {
  switch (status) {
    case 'active': return '启用中';
    case 'disabled': return '已停用';
    case 'expired': return '已过期';
    case 'exhausted': return '已用完';
    default: return status;
  }
}

function getStatusBadgeVariant(status: AccessCodeStatus): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string } {
  switch (status) {
    case 'active':
      return { variant: 'default', className: 'bg-green-500/20 text-green-400 hover:bg-green-500/20' };
    case 'disabled':
      return { variant: 'secondary', className: '' };
    case 'expired':
      return { variant: 'default', className: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20' };
    case 'exhausted':
      return { variant: 'destructive', className: '' };
    default:
      return { variant: 'secondary', className: '' };
  }
}

export const AccessCodesManager: React.FC = () => {
  const [items, setItems] = useState<AccessCodeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [editItem, setEditItem] = useState<AccessCodeItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsCodeId, setLogsCodeId] = useState<string | null>(null);
  const [logsCodeValue, setLogsCodeValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await accessCodesApi.listAccessCodes({
        page,
        pageSize: PAGE_SIZE,
        keyword: debouncedKeyword || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      logger.error('获取通行码列表失败', err);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedKeyword]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword]);

  const handleCopy = async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('已复制通行码');
    } catch (err) {
      logger.error('复制失败', err);
      toast.error('复制失败');
    }
  };

  const handleToggleStatus = async (
    item: AccessCodeItem,
  ): Promise<void> => {
    if (item.status === 'expired' || item.status === 'exhausted') {
      toast.error('该通行码已过期或已用完，无法启用');
      return;
    }
    const newStatus: 'active' | 'disabled' =
      item.status === 'active' ? 'disabled' : 'active';
    setActionLoading(item.id);
    try {
      await accessCodesApi.toggleAccessCodeStatus(item.id, newStatus);
      toast.success(
        newStatus === 'active' ? '已启用' : '已停用',
      );
      await fetchData();
    } catch (err) {
      logger.error('切换状态失败', err);
      toast.error('操作失败，请稍后重试');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = (item: AccessCodeItem): void => {
    setLogsCodeId(item.id);
    setLogsCodeValue(item.code);
    setLogsOpen(true);
  };

  const handleDelete = async (item: AccessCodeItem): Promise<void> => {
    if (!await showConfirm(`确定要删除通行码「${item.code}」吗？此操作不可撤销。`)) {
      return;
    }
    setActionLoading(item.id);
    try {
      await accessCodesApi.deleteAccessCode(item.id);
      toast.success('已删除');
      await fetchData();
    } catch (err) {
      logger.error('删除失败', err);
      toast.error('删除失败，请稍后重试');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 size={32} className="animate-spin" />
        <p className="mt-3 text-sm">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-red-400 text-sm">{error}</p>
        <Button variant="outline" onClick={() => void fetchData()} className="mt-4">
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="搜索通行码或备注..."
            value={keyword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setBatchOpen(true)} className="min-h-[44px]">
          <Users size={14} className="mr-1" />
          批量生成
        </Button>
        <Button onClick={() => setCreateOpen(true)} className="min-h-[44px]" data-ai-section-type="button">
          <Plus size={14} className="mr-1" />
          生成通行码
        </Button>
      </div>

      <div className="flex-1 border border-[#2f3336] rounded-lg overflow-hidden bg-[#16181c]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Users size={32} className="mb-3 opacity-50" />
            <p className="text-sm">暂无通行码</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2f3336]">
            {items.map((item: AccessCodeItem) => (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-3 hover:bg-[#1d1f23] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-mono text-[#e7e9ea] bg-[#2f3336] px-2 py-0.5 rounded break-all">
                        {item.code}
                      </code>
                      <Badge
                        variant={getStatusBadgeVariant(item.status).variant}
                        className={getStatusBadgeVariant(item.status).className}
                      >
                        {getStatusLabel(item.status)}
                      </Badge>
                      {item.maxUses !== null && (
                        <span className="text-xs text-[#71767b]">
                          {item.useCount}/{item.maxUses} 次
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <p className="text-sm text-[#71767b] mt-1 break-words">{item.note}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#71767b] flex-wrap">
                      <span>角色：{item.role === 'admin' ? '管理员' : item.role === 'editor' ? '编辑' : '普通用户'}</span>
                      <span>创建于 {formatRelative(item.createdAt)}</span>
                      {item.lastUsedAt && (
                        <span>最近使用 {formatRelative(item.lastUsedAt)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleCopy(item.code)}
                    className="h-11 w-11 text-[#71767b] hover:text-[#e7e9ea] flex-shrink-0"
                    title="复制"
                    data-ai-section-type="button"
                  >
                    <Copy size={18} />
                  </Button>
                </div>
                <div className="flex items-center gap-1 justify-end flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewLogs(item)}
                    className="min-h-[36px] text-xs"
                  >
                    <History size={14} className="mr-1" />
                    使用记录
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditItem(item);
                      setEditOpen(true);
                    }}
                    className="min-h-[36px] text-xs"
                  >
                    <Edit3 size={14} className="mr-1" />
                    编辑
                  </Button>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => void handleToggleStatus(item)}
                     disabled={actionLoading === item.id || item.status === 'expired' || item.status === 'exhausted'}
                     className="min-h-[36px] text-xs"
                     title={item.status === 'expired' ? '已过期，无法切换' : item.status === 'exhausted' ? '已用完，无法切换' : ''}
                   >
                     {actionLoading === item.id ? (
                       <Loader2 size={14} className="animate-spin mr-1" />
                     ) : item.status === 'active' ? (
                       <PowerOff size={14} className="mr-1" />
                     ) : (
                       <Power size={14} className="mr-1" />
                     )}
                     {item.status === 'active' ? '停用' : item.status === 'disabled' ? '启用' : getStatusLabel(item.status)}
                   </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete(item)}
                    disabled={actionLoading === item.id}
                    className="min-h-[36px] text-xs"
                  >
                    <Trash2 size={14} className="mr-1" />
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="border-[#2f3336] text-[#e7e9ea]"
          >
            <ChevronLeft size={14} />
            上一页
          </Button>
          <span className="text-sm text-[#71767b] min-w-[80px] text-center">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="border-[#2f3336] text-[#e7e9ea]"
          >
            下一页
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      <CreateCodeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => void fetchData()}
      />

      <EditCodeDialog
        open={editOpen}
        item={editItem}
        onOpenChange={setEditOpen}
        onSuccess={() => void fetchData()}
      />

      <BatchCreateDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        onSuccess={() => void fetchData()}
      />

      <AccessCodeLogsDialog
        open={logsOpen}
        codeId={logsCodeId}
        codeValue={logsCodeValue}
        onOpenChange={setLogsOpen}
      />
    </div>
  );
};

export default AccessCodesManager;
