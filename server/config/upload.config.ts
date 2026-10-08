import { isAbsolute, join } from 'path';

function resolveDir(value: string | undefined, fallbackName: string): string {
  if (!value) return join(process.cwd(), fallbackName);
  return isAbsolute(value) ? value : join(process.cwd(), value);
}

/**
 * 本地上传（图片 / 文章附件 / 头像）的落盘与访问配置。
 *
 * 为什么用本地磁盘而不是对象存储：本站是单机部署的长文发布站，
 * 上传量小、结构简单，落在磁盘上再挂静态目录最省事，也便于备份和迁移。
 */
export const uploadConfig = {
  /** 文件落盘目录 */
  dir: resolveDir(process.env.UPLOAD_DIR, 'uploads'),
  /** 对外访问前缀（生成 https://站点/uploads/xxx.png 这样的地址） */
  urlPrefix: (process.env.UPLOAD_URL_PREFIX || '/uploads').replace(/\/+$/, ''),
  /** 单文件大小上限，默认 25MB */
  maxSize: Number(process.env.UPLOAD_MAX_SIZE || 25 * 1024 * 1024),
};
