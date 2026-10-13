import { logger } from '@/lib/logger';
import { axiosForBackend } from '@/lib/axios';

export interface UploadResult {
  /** 可直接放进 <img src> 或附件链接的地址 */
  url: string;
  /** 原始文件名，用于附件列表展示 */
  fileName: string;
  fileSize: number;
  fileType: string;
  isImage: boolean;
}

/**
 * 上传单个文件（图片 / 文档附件 / 头像）。
 * 走本站自己的 /api/upload，落在服务器磁盘上，不依赖任何外部图床。
 */
export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axiosForBackend.post('/api/upload', formData, {
      // 不要手动设置 Content-Type，交给运行时带上 multipart 边界
      onUploadProgress: (event: { loaded: number; total?: number }) => {
        if (!onProgress) return;
        const total = event.total ?? file.size;
        if (!total) return;
        onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
      },
    });
    return response.data as UploadResult;
  } catch (error) {
    logger.error('上传文件失败', error);
    throw error;
  }
}

export const uploadImage = uploadFile;

