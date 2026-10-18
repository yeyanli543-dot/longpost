import { logger } from '@/lib/logger';
import { uploadFile as defaultUploadFile, type UploadResult } from '@/api/upload';

/**
 * 用户自定义 S3 / Cloudflare R2 存储配置
 */
export interface S3StorageConfig {
  /** 是否启用 S3 / R2 直传模式 */
  enabled: boolean;
  /** S3 兼容 API 接入点，如 https://<account_id>.r2.cloudflarestorage.com */
  endpoint: string;
  /** 存储桶名称 */
  bucket: string;
  /** Access Key ID */
  accessKeyId: string;
  /** Secret Access Key */
  secretAccessKey: string;
  /** 外部可公开访问的 CDN / 自定义域名，如 https://cdn.example.com 或 https://pub-xxx.r2.dev */
  publicDomain: string;
  /** 区域，R2 默认通常为 auto，AWS S3 如 us-east-1 */
  region?: string;
  /** 是否强制使用 Path 路径风格（R2 / MinIO 强烈推荐开启） */
  forcePathStyle?: boolean;
}

export const S3_CONFIG_STORAGE_KEY = 'lp_s3_storage_config';
export const ASSET_LEDGER_STORAGE_KEY = 'lp_asset_ledger';

/**
 * 资产登记台账记录
 */
export interface AssetLedgerRecord {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageType: 'local' | 's3';
  uploadedAt: number;
}

/**
 * 读取当前本地持久化的 S3 配置
 */
export function getS3Config(): S3StorageConfig {
  try {
    const raw = localStorage.getItem(S3_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        endpoint: parsed.endpoint || '',
        bucket: parsed.bucket || '',
        accessKeyId: parsed.accessKeyId || '',
        secretAccessKey: parsed.secretAccessKey || '',
        publicDomain: parsed.publicDomain || '',
        region: parsed.region || 'auto',
        forcePathStyle: parsed.forcePathStyle !== false,
      };
    }
  } catch {
    // ignore json error
  }
  return {
    enabled: false,
    endpoint: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    publicDomain: '',
    region: 'auto',
    forcePathStyle: true,
  };
}

/**
 * 保存 S3 配置到本地
 */
export function setS3Config(config: S3StorageConfig): void {
  try {
    localStorage.setItem(S3_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    logger.error('保存 S3 配置失败', err);
  }
}

/**
 * 检查 S3 配置是否完整有效
 */
export function isS3ConfigValid(config: S3StorageConfig): boolean {
  return (
    config.enabled &&
    Boolean(config.endpoint?.trim()) &&
    Boolean(config.bucket?.trim()) &&
    Boolean(config.accessKeyId?.trim()) &&
    Boolean(config.secretAccessKey?.trim())
  );
}

/**
 * 资产登记台账管理
 */
export function getAssetLedger(): AssetLedgerRecord[] {
  try {
    const raw = localStorage.getItem(ASSET_LEDGER_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AssetLedgerRecord[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function recordAssetInLedger(
  asset: Omit<AssetLedgerRecord, 'id' | 'uploadedAt'>,
): AssetLedgerRecord {
  const list = getAssetLedger();
  const record: AssetLedgerRecord = {
    ...asset,
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    uploadedAt: Date.now(),
  };

  // 避免完全相同 URL 重复录入
  const filtered = list.filter((item) => item.url !== record.url);
  filtered.unshift(record);

  // 限制本地最多保留 500 条历史资产台账
  if (filtered.length > 500) {
    filtered.length = 500;
  }

  try {
    localStorage.setItem(ASSET_LEDGER_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore quota error
  }

  return record;
}

export function removeAssetFromLedger(url: string): void {
  const list = getAssetLedger();
  const filtered = list.filter((item) => item.url !== url);
  try {
    localStorage.setItem(ASSET_LEDGER_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

export function clearAssetLedger(): void {
  try {
    localStorage.removeItem(ASSET_LEDGER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ==========================================
// 原生 Web Crypto 实现 AWS Signature V4
// ==========================================

const textEncoder = new TextEncoder();

function strToUint8(str: string): Uint8Array {
  return textEncoder.encode(str);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buffer = (typeof data === 'string' ? strToUint8(data) : data) as BufferSource;
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hash);
}

async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  data: string | Uint8Array,
): Promise<ArrayBuffer> {
  const dataBuffer = (typeof data === 'string' ? strToUint8(data) : data) as BufferSource;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
}

export async function getAwsV4SigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kSecret = strToUint8(`AWS4${secretKey}`);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

/**
 * 执行 S3 / R2 直传（纯浏览器原生 Web Crypto，零 AWS SDK 依赖）
 */
export async function uploadToS3Direct(
  file: File,
  config: S3StorageConfig,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  if (!isS3ConfigValid(config)) {
    throw new Error('S3 / R2 存储配置不完整，请检查 Endpoint、Bucket、Key 等参数');
  }

  // 1. 解析 Endpoint 与目标路径
  let endpointUrl = config.endpoint.trim();
  if (!/^https?:\/\//i.test(endpointUrl)) {
    endpointUrl = `https://${endpointUrl}`;
  }
  const endpointObj = new URL(endpointUrl);

  const region = config.region?.trim() || 'auto';
  const service = 's3';

  // 生成对象 Key: uploads/YYYYMM/timestamp-random.ext
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = file.name.includes('.')
    ? file.name.substring(file.name.lastIndexOf('.'))
    : '.webp';
  const randStr = Math.random().toString(36).substring(2, 9);
  const objectKey = `uploads/${year}${month}/${Date.now()}-${randStr}${ext}`;

  // 计算上传的 CanonicalURI 与 Full URL
  const bucketName = config.bucket.trim();
  let uploadUrl = '';
  let hostHeader = endpointObj.host;
  let canonicalUri = '';

  if (config.forcePathStyle !== false) {
    // Path-style: https://endpoint/bucket/key
    canonicalUri = `/${encodeURIComponent(bucketName)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    uploadUrl = `${endpointObj.origin}${canonicalUri}`;
  } else {
    // Virtual-hosted style: https://bucket.endpoint/key
    hostHeader = `${bucketName}.${endpointObj.host}`;
    canonicalUri = `/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    uploadUrl = `${endpointObj.protocol}//${hostHeader}${canonicalUri}`;
  }

  // 2. 读取文件 ArrayBuffer 并计算 Payload SHA-256
  if (onProgress) onProgress(10);
  const fileBuffer = await file.arrayBuffer();
  if (onProgress) onProgress(30);
  const payloadHash = await sha256Hex(fileBuffer);

  // 3. 构造日期时间格式
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const contentType = file.type || 'application/octet-stream';

  // 4. 构建 Canonical Headers 与 Signed Headers (字母序排序)
  // 必须全部小写
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${hostHeader}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  // 5. 组装 Canonical Request
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '', // query string 为空
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);

  // 6. 组装 String to Sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // 7. 计算签名
  const signingKey = await getAwsV4SigningKey(
    config.secretAccessKey.trim(),
    dateStamp,
    region,
    service,
  );
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = bufferToHex(signatureBuffer);

  // 8. 构造 Authorization 请求头
  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId.trim()}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  if (onProgress) onProgress(60);

  // 9. 发起 PUT 直传
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorizationHeader,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `S3 直传失败 [HTTP ${response.status} ${response.statusText}]: ${errorText || '未知错误，请检查存储桶 CORS 跨域配置及密钥权限'}`,
    );
  }

  if (onProgress) onProgress(100);

  // 10. 计算对外展示链接 (优先使用用户指定的 PublicDomain)
  let publicUrl = '';
  if (config.publicDomain?.trim()) {
    const domain = config.publicDomain.trim().replace(/\/+$/, '');
    publicUrl = `${domain}/${objectKey}`;
  } else {
    publicUrl = uploadUrl;
  }

  return {
    url: publicUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: contentType,
    isImage: contentType.startsWith('image/'),
  };
}

/**
 * 测试用户的 S3 / R2 配置是否可用
 * （上传一个 1 字节极小测试文件以验证鉴权与 CORS）
 */
export async function testS3Connection(config: S3StorageConfig): Promise<boolean> {
  const dummyBlob = new Blob(['ping'], { type: 'text/plain' });
  const dummyFile = new File([dummyBlob], 'longpost-connection-test.txt', {
    type: 'text/plain',
  });
  const res = await uploadToS3Direct(dummyFile, config);
  return Boolean(res.url);
}

/**
 * 智能双模式上传适配器：
 * - 若配置并启用了 S3/R2，自动切入原生 Web Crypto AWS SigV4 直传
 * - 否则无缝降级至本站已有 `/api/upload`
 * 并在上传成功后自动加入本地“资产管家”台账
 */
export async function uploadImageSmart(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult & { storageType: 'local' | 's3' }> {
  const s3Config = getS3Config();

  let result: UploadResult;
  let storageType: 'local' | 's3' = 'local';

  if (isS3ConfigValid(s3Config)) {
    try {
      result = await uploadToS3Direct(file, s3Config, onProgress);
      storageType = 's3';
    } catch (err) {
      logger.warn('S3 直传失败，尝试降级为本地服务器上传', err);
      result = await defaultUploadFile(file, onProgress);
      storageType = 'local';
    }
  } else {
    result = await defaultUploadFile(file, onProgress);
    storageType = 'local';
  }

  // 自动将上传成果登记入“资产管家”台账
  recordAssetInLedger({
    url: result.url,
    fileName: result.fileName || file.name,
    fileSize: result.fileSize || file.size,
    fileType: result.fileType || file.type || 'image/webp',
    storageType,
  });

  return {
    ...result,
    storageType,
  };
}
