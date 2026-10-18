import { FC, useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderArchive,
  X,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Cloud,
  HardDrive,
  AlertTriangle,
  FileImage,
  Sliders,
  Eye,
  CheckSquare,
  Square,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getS3Config,
  setS3Config,
  testS3Connection,
  getAssetLedger,
  removeAssetFromLedger,
  clearAssetLedger,
  type S3StorageConfig,
  type AssetLedgerRecord,
} from '@/lib/image/s3-uploader';
import { getMyArticles } from '@/api/articles';
import { platform } from '@/lib/platform';
import { logger } from '@/lib/logger';
import { extractImageUrls } from '@/lib/markdown/image-extract';

interface AssetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContent?: string;
  onInsertImage?: (markdownSnippet: string) => void;
}

export interface ScannedAssetItem {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageType: 'local' | 's3';
  uploadedAt: number;
  referenceCount: number;
  isOrphan: boolean;
  referencedIn: string[]; // 所在文章标题
}

export const AssetManagerModal: FC<AssetManagerModalProps> = ({
  isOpen,
  onClose,
  currentContent = '',
  onInsertImage,
}) => {
  // Tab 状态: 'assets' (全部资产) | 'orphans' (孤立资源) | 'settings' (云存储设置)
  const [activeTab, setActiveTab] = useState<'assets' | 'orphans' | 'settings'>('assets');

  // 资源扫描数据
  const [isLoading, setIsLoading] = useState(false);
  const [assets, setAssets] = useState<ScannedAssetItem[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // S3 / R2 配置项表单
  const [s3Form, setS3Form] = useState<S3StorageConfig>(getS3Config());
  const [isTestingS3, setIsTestingS3] = useState(false);
  const [s3TestStatus, setS3TestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [s3TestMsg, setS3TestMsg] = useState('');

  // 预览大图模态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 执行资产与孤立检测
  const scanAssets = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);

    try {
      // 1. 提取本地资产台账登记的附件
      const ledgerList = getAssetLedger();

      // 2. 提取当前正在编辑的文章中的图片
      const currentUrls = extractImageUrls(currentContent);

      // 3. 拉取全库文章（在线发布文章 + 本地离线库），进行引用与历史版本全量比对
      let allArticles: Array<{ id: string; title: string; content?: string; coverUrl?: string }> = [];
      try {
        const res = await getMyArticles();
        if (res?.items) {
          allArticles = [...res.items];
        }
      } catch (err) {
        logger.warn('获取我的文章列表失败，退化为仅比对本地与当前文章', err);
      }

      try {
        const localList = await platform.listArticlesLocal();
        for (const loc of localList) {
          if (!allArticles.some((a) => a.id === loc.id)) {
            allArticles.push({
              id: loc.id,
              title: loc.title,
              content: loc.content,
            });
          }
        }
      } catch (err) {
        logger.warn('获取本地文章库失败', err);
      }

      // 4. 构建全站引用映射：URL -> 引用的文章列表
      const referenceMap = new Map<string, string[]>();

      // 记录当前文章中的引用
      for (const u of currentUrls) {
        const list = referenceMap.get(u) || [];
        if (!list.includes('当前编辑草稿')) {
          list.push('当前编辑草稿');
        }
        referenceMap.set(u, list);
      }

      // 记录已有文章中的引用、封面，以及【🔍 版本差分器（Version Diff）历史快照】中的图片引用
      for (const art of allArticles) {
        const artTitle = art.title || '无标题文章';
        if (art.coverUrl) {
          const list = referenceMap.get(art.coverUrl) || [];
          if (!list.includes(artTitle)) {
            list.push(artTitle);
          }
          referenceMap.set(art.coverUrl, list);
        }

        if (art.content) {
          const artUrls = extractImageUrls(art.content);
          for (const u of artUrls) {
            const list = referenceMap.get(u) || [];
            if (!list.includes(artTitle)) {
              list.push(artTitle);
            }
            referenceMap.set(u, list);
          }
        }

        // 关键防护：扫描历史版本快照，杜绝误删回滚所需图片
        if (art.id) {
          try {
            const revisions = await platform.listRevisionsLocal(art.id);
            for (const rev of revisions) {
              if (rev.content) {
                const revUrls = extractImageUrls(rev.content);
                const tag = `快照: ${artTitle}`;
                for (const u of revUrls) {
                  const list = referenceMap.get(u) || [];
                  if (!list.includes(tag)) {
                    list.push(tag);
                  }
                  referenceMap.set(u, list);
                }
              }
            }
          } catch (err) {
            logger.warn(`扫描文章 ${art.id} 历史快照失败`, err);
          }
        }
      }

      // 5. 整合资产全集：以本地台账为基础，若文章中存在未登账的本地/CDN 图片也一并纳入展示
      const assetMap = new Map<string, ScannedAssetItem>();

      for (const record of ledgerList) {
        const refs = referenceMap.get(record.url) || [];
        assetMap.set(record.url, {
          id: record.id,
          url: record.url,
          fileName: record.fileName,
          fileSize: record.fileSize,
          fileType: record.fileType,
          storageType: record.storageType,
          uploadedAt: record.uploadedAt,
          referenceCount: refs.length,
          isOrphan: refs.length === 0,
          referencedIn: refs,
        });
      }

      // 将文章中出现的其它图片（可能是历史文章录入的图）也补充为资产
      for (const [url, refs] of referenceMap.entries()) {
        if (!assetMap.has(url)) {
          const guessedName = url.split('/').pop()?.split('?')[0] || 'remote-image';
          assetMap.set(url, {
            id: `discovered-${url}`,
            url,
            fileName: guessedName,
            fileSize: 0,
            fileType: 'image/auto',
            storageType: url.includes('/uploads/') ? 'local' : 's3',
            uploadedAt: Date.now(),
            referenceCount: refs.length,
            isOrphan: refs.length === 0,
            referencedIn: refs,
          });
        }
      }

      const finalList = Array.from(assetMap.values());
      // 按上传时间或是否孤立倒序
      finalList.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setAssets(finalList);
    } catch (err) {
      logger.error('扫描资产失败', err);
      toast.error('资产扫描失败，请检查网络');
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, currentContent]);

  useEffect(() => {
    if (isOpen) {
      scanAssets();
      setS3Form(getS3Config());
      setSelectedUrls(new Set());
    }
  }, [isOpen, scanAssets]);

  // 格式化文件体积
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '未知体积';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 统计信息
  const stats = useMemo(() => {
    const totalCount = assets.length;
    const totalBytes = assets.reduce((sum, item) => sum + (item.fileSize || 0), 0);
    const orphanCount = assets.filter((item) => item.isOrphan).length;
    const referencedCount = totalCount - orphanCount;
    return { totalCount, totalBytes, orphanCount, referencedCount };
  }, [assets]);

  // 过滤后的图片列表
  const displayedAssets = useMemo(() => {
    return assets.filter((item) => {
      // Tab 过滤
      if (activeTab === 'orphans' && !item.isOrphan) {
        return false;
      }
      // 关键字搜索
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchName = item.fileName.toLowerCase().includes(kw);
        const matchUrl = item.url.toLowerCase().includes(kw);
        return matchName || matchUrl;
      }
      return true;
    });
  }, [assets, activeTab, searchKeyword]);

  // 全选 / 反选
  const handleToggleSelectAll = () => {
    if (selectedUrls.size === displayedAssets.length && displayedAssets.length > 0) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(displayedAssets.map((item) => item.url)));
    }
  };

  const handleToggleSelectItem = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // 复制链接
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success('图片链接已复制到剪贴板');
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      toast.error('复制失败，请手动选取');
    }
  };

  // 插入 Markdown 语法到当前编辑器
  const handleInsert = (item: ScannedAssetItem) => {
    if (onInsertImage) {
      onInsertImage(`\n\n![${item.fileName}](${item.url})\n\n`);
      toast.success(`已插入图片: ${item.fileName}`);
      onClose();
    }
  };

  // 安全清理：从台账中注销并从视图移除
  const handleCleanSelected = () => {
    if (selectedUrls.size === 0) return;
    const count = selectedUrls.size;
    if (
      !window.confirm(
        `确定要从“资产管家”台账中清理选中的 ${count} 个资源吗？\n（若为未被文章引用的孤立图片，清理后将彻底释放本地记录）`,
      )
    ) {
      return;
    }

    for (const url of selectedUrls) {
      removeAssetFromLedger(url);
    }

    setAssets((prev) => prev.filter((item) => !selectedUrls.has(item.url)));
    setSelectedUrls(new Set());
    toast.success(`已安全清理 ${count} 个资产记录`);
  };

  // 单项清理
  const handleCleanSingle = (url: string) => {
    removeAssetFromLedger(url);
    setAssets((prev) => prev.filter((item) => item.url !== url));
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
    toast.success('已清理该图片资产记录');
  };

  // 测试 S3 / R2 连接
  const handleTestS3 = async () => {
    setIsTestingS3(true);
    setS3TestStatus('idle');
    setS3TestMsg('');

    try {
      const ok = await testS3Connection(s3Form);
      if (ok) {
        setS3TestStatus('success');
        setS3TestMsg('直传测试成功！原生 Web Crypto 签名与权限握手正常。');
        toast.success('S3 / R2 直传握手成功');
      } else {
        throw new Error('测试直传响应异常');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setS3TestStatus('error');
      setS3TestMsg(`直传测试失败: ${msg}`);
      toast.error('S3 直传握手失败，请核对配置与 CORS');
    } finally {
      setIsTestingS3(false);
    }
  };

  // 保存 S3 配置
  const handleSaveS3Config = (e: React.FormEvent) => {
    e.preventDefault();
    setS3Config(s3Form);
    toast.success('S3 / R2 存储配置已保存并生效');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[86vh] bg-white dark:bg-[#1e1f22] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-[#f8fafd] dark:bg-[#18191b]">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <FolderArchive className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                  资产管家 & 智能图床
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                  剪贴板 WebP 压缩
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40">
                  S3/R2 原生直传
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                统计已存储附件、智能识别孤立未引用图片，支持一键安全清理与云存储配置
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={scanAssets}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-full transition-colors disabled:opacity-50"
              title="重新扫描文章与台账"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              重新扫描
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 顶部统计药丸横幅 */}
        <div className="px-6 py-3 bg-gray-50/70 dark:bg-zinc-900/40 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">已登记图片:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
                {stats.totalCount} 张
              </span>
            </div>
            <div className="w-[1px] h-3.5 bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">累计占用:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
                {formatBytes(stats.totalBytes)}
              </span>
            </div>
            <div className="w-[1px] h-3.5 bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5">
              <span className="text-green-600 dark:text-green-400 font-medium">● 引用中:</span>
              <span className="font-semibold font-mono text-gray-900 dark:text-gray-100">
                {stats.referencedCount}
              </span>
            </div>
            <div className="w-[1px] h-3.5 bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5">
              <span className="text-amber-600 dark:text-amber-400 font-medium">▲ 孤立图片:</span>
              <span className="font-semibold font-mono text-amber-600 dark:text-amber-400">
                {stats.orphanCount}
              </span>
            </div>
          </div>

          {/* 模式状态 */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium ${
                s3Form.enabled
                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {s3Form.enabled ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
              <span>{s3Form.enabled ? 'S3/R2 云直传已启用' : '默认本地存储模式'}</span>
            </span>
          </div>
        </div>

        {/* 标签栏与操作筛选栏 */}
        <div className="px-6 py-2.5 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1e1f22]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('assets')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeTab === 'assets'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              全部资产 ({assets.length})
            </button>
            <button
              onClick={() => setActiveTab('orphans')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'orphans'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              孤立图片 ({stats.orphanCount})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              S3 / R2 直传配置
            </button>
          </div>

          {activeTab !== 'settings' && (
            <div className="flex items-center gap-2">
              {/* 搜索框 */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="搜索文件名或 URL..."
                  className="pl-8 pr-3 py-1 text-xs rounded-full border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 w-44"
                />
              </div>

              {/* 批量全选 */}
              <button
                onClick={handleToggleSelectAll}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-full transition-colors"
              >
                {selectedUrls.size === displayedAssets.length && displayedAssets.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>全选</span>
              </button>

              {/* 批量清理 */}
              {selectedUrls.size > 0 && (
                <button
                  onClick={handleCleanSelected}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-full shadow-sm transition-all animate-in fade-in"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>一键安全清理 ({selectedUrls.size})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 内容展示区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'settings' ? (
            /* S3 / R2 直传模式配置面板 */
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-purple-900 dark:text-purple-200 text-xs leading-relaxed">
                <p className="font-semibold text-sm mb-1">💡 浏览器原生 AWS Signature V4 直传说明</p>
                <p>
                  填写您的 Cloudflare R2、AWS S3 或 MinIO 存储桶凭证后，上传图片将
                  <strong>由浏览器直接签名并直传对象存储</strong>
                  ，绝不经过本站后端服务器转发，实现极致上传速度与带宽自由。
                </p>
                <p className="mt-1 text-purple-700 dark:text-purple-300">
                  安全承诺：所有 AccessKey 与密钥仅保存在您的当前浏览器 LocalStorage 中，不会泄露给第三方。
                </p>
              </div>

              <form onSubmit={handleSaveS3Config} className="space-y-4 text-sm">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200 dark:border-gray-800">
                  <div>
                    <label className="font-semibold text-gray-900 dark:text-gray-100">
                      启用 S3 / Cloudflare R2 直传
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      开启后，编辑器内粘贴/拖拽的图片将直传至此对象存储
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={s3Form.enabled}
                    onChange={(e) => setS3Form({ ...s3Form, enabled: e.target.checked })}
                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      S3 API Endpoint (接入点) *
                    </label>
                    <input
                      type="text"
                      required={s3Form.enabled}
                      value={s3Form.endpoint}
                      onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                      placeholder="如: https://<account_id>.r2.cloudflarestorage.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Bucket (存储桶名) *
                    </label>
                    <input
                      type="text"
                      required={s3Form.enabled}
                      value={s3Form.bucket}
                      onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                      placeholder="如: my-longpost-bucket"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Region (区域，R2 默认填 auto)
                    </label>
                    <input
                      type="text"
                      value={s3Form.region || ''}
                      onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                      placeholder="auto 或 us-east-1"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Access Key ID *
                    </label>
                    <input
                      type="text"
                      required={s3Form.enabled}
                      value={s3Form.accessKeyId}
                      onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })}
                      placeholder="Access Key ID"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Secret Access Key *
                    </label>
                    <input
                      type="password"
                      required={s3Form.enabled}
                      value={s3Form.secretAccessKey}
                      onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })}
                      placeholder="Secret Access Key"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Public Domain (公开访问 CDN / 自定义域名)
                    </label>
                    <input
                      type="text"
                      value={s3Form.publicDomain}
                      onChange={(e) => setS3Form({ ...s3Form, publicDomain: e.target.value })}
                      placeholder="如: https://cdn.example.com 或 https://pub-xxx.r2.dev"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 font-mono"
                    />
                    <p className="text-[11px] text-gray-400">
                      文章渲染图片时所用的 CDN 前缀。若不填则默认使用 Endpoint + 桶路径。
                    </p>
                  </div>
                </div>

                {/* 测试结果提示 */}
                {s3TestStatus !== 'idle' && (
                  <div
                    className={`p-3 rounded-xl text-xs ${
                      s3TestStatus === 'success'
                        ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}
                  >
                    {s3TestMsg}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleTestS3}
                    disabled={isTestingS3 || !s3Form.endpoint || !s3Form.bucket}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-full transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingS3 ? 'animate-spin' : ''}`} />
                    <span>{isTestingS3 ? '正在握手直传...' : '测试直传握手'}</span>
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-full shadow-md transition-all active:scale-95"
                  >
                    保存配置
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* 资产列表网格展示 */
            <>
              {displayedAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
                  <FileImage className="w-12 h-12 stroke-[1.2] opacity-40 mb-3" />
                  <p className="text-sm">
                    {searchKeyword
                      ? '未找到匹配搜索条件的图片'
                      : activeTab === 'orphans'
                        ? '太棒了！当前没有任何未被引用的孤立图片'
                        : '暂无登记的图片资产'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    在编辑器中粘贴或拖拽图片即可触发智能 WebP 压缩并自动登记
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {displayedAssets.map((item) => {
                    const isSelected = selectedUrls.has(item.url);
                    return (
                      <div
                        key={item.id}
                        className={`group relative rounded-2xl border transition-all duration-200 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 shadow-xs'
                        }`}
                      >
                        {/* 缩略图区 */}
                        <div className="relative aspect-4/3 bg-gray-100 dark:bg-zinc-950 overflow-hidden flex items-center justify-center">
                          <img
                            src={item.url}
                            alt={item.fileName}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => {
                              // 图片损坏或 CORS 失败时占位
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />

                          {/* 勾选框 */}
                          <button
                            onClick={() => handleToggleSelectItem(item.url)}
                            className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>

                          {/* 状态徽章 */}
                          <div className="absolute top-2 right-2">
                            {item.isOrphan ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/90 text-white backdrop-blur-md flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> 孤立未引用
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/90 text-white backdrop-blur-md">
                                引用中 ({item.referenceCount})
                              </span>
                            )}
                          </div>

                          {/* 悬浮操作栏 */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => setPreviewImageUrl(item.url)}
                              className="p-2 rounded-full bg-white/90 text-gray-800 hover:bg-white shadow transition-transform active:scale-90"
                              title="查看原图"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCopyUrl(item.url)}
                              className="p-2 rounded-full bg-white/90 text-gray-800 hover:bg-white shadow transition-transform active:scale-90"
                              title="复制链接"
                            >
                              {copiedUrl === item.url ? (
                                <Check className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            {onInsertImage && (
                              <button
                                onClick={() => handleInsert(item)}
                                className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-500 shadow transition-transform active:scale-90"
                                title="插入到当前文章"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 元数据与信息栏 */}
                        <div className="p-3 flex flex-col justify-between flex-1 gap-1.5 text-xs">
                          <div>
                            <p
                              className="font-medium text-gray-900 dark:text-gray-100 truncate"
                              title={item.fileName}
                            >
                              {item.fileName}
                            </p>
                            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                              <span>{formatBytes(item.fileSize)}</span>
                              <span className="capitalize">{item.storageType} 存储</span>
                            </div>
                          </div>

                          {/* 引用文章列表 */}
                          {item.referencedIn.length > 0 && (
                            <div className="pt-1.5 border-t border-gray-100 dark:border-zinc-800 text-[11px] text-gray-400 truncate">
                              引用自: {item.referencedIn.join('、')}
                            </div>
                          )}

                          {/* 单独清理 */}
                          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-zinc-800">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5"
                            >
                              原图 <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            <button
                              onClick={() => handleCleanSingle(item.url)}
                              className="text-[11px] text-red-500 hover:text-red-400 transition-colors"
                            >
                              清理记录
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部功能栏 */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/40 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>智能压缩流水线：PNG/JPG/BMP 自动转为 WebP · 长边限制 1920px · 阶梯 0.82→0.60 降噪</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-700 transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>

      {/* 大图预览模态 */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md cursor-zoom-out"
        >
          <img
            src={previewImageUrl}
            alt="Preview"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
