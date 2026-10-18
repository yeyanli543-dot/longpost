import { logger } from '@/lib/logger';

export interface ImageCompressionOptions {
  /** 最大单边像素尺寸（等比缩放），默认 1920 */
  maxDimension?: number;
  /** 初始 WebP 导出质量，默认 0.82 */
  initialQuality?: number;
  /** 目标体积阈值（字节），默认 120KB (120 * 1024) */
  maxSizeBytes?: number;
  /** 阶梯压缩递减质量列表，默认 [0.68] */
  qualityStepDown?: number[];
  /** 最低保底压缩质量，默认 0.55 */
  minQuality?: number;
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  wasCompressed: boolean;
  mimeType: string;
}

/**
 * 判断是否应跳过压缩（GIF 动图与 SVG 矢量图需严格跳过）
 */
export function shouldSkipCompression(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  // GIF 包含多帧动画，转换为静态 WebP 会丢失动效；SVG 为矢量无损图
  if (mime === 'image/gif' || name.endsWith('.gif')) {
    return true;
  }
  if (mime === 'image/svg+xml' || name.endsWith('.svg')) {
    return true;
  }

  // 仅对位图（PNG/JPG/JPEG/BMP/WEBP）进行处理
  const isSupportedBitmap =
    mime.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.bmp') ||
    name.endsWith('.webp');

  return !isSupportedBitmap;
}

/**
 * 按长边上限等比缩放，计算目标尺寸（纯函数，便于单测）
 *
 * 单独抽出来的原因：这段逻辑原本内联在 compressImageToWebp 的画布流程里，
 * 测试只能照抄一遍公式再断言，改坏了也不会被发现。
 */
export function calculateScaledDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension = 1920,
): { width: number; height: number } {
  const safeWidth = Math.max(0, Math.floor(origWidth || 0));
  const safeHeight = Math.max(0, Math.floor(origHeight || 0));
  const maxSide = Math.max(safeWidth, safeHeight);

  if (maxSide <= 0) return { width: 0, height: 0 };
  if (maxSide <= maxDimension) return { width: safeWidth, height: safeHeight };

  const scale = maxDimension / maxSide;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

/**
 * 将 Blob/File 加载为 ImageBitmap 或 HTMLImageElement
 */
async function loadImageSource(
  file: File,
): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (err) {
      logger.warn('createImageBitmap 读取失败，尝试降级为 HTMLImageElement', err);
    }
  }

  // 降级为离屏 HTMLImageElement
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        close: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片内容: ${e}`));
    };
    img.src = url;
  });
}

/**
 * 在 Canvas 上渲染图片并导出为 WebP Blob
 * 优先使用 OffscreenCanvas，不支持时降级至离屏 HTMLCanvasElement
 */
async function renderToWebpBlob(
  source: ImageBitmap | HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number,
): Promise<Blob> {
  const safeQuality = Math.max(0.1, Math.min(1.0, quality));

  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文');
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
      return await offscreen.convertToBlob({
        type: 'image/webp',
        quality: safeQuality,
      });
    } catch (err) {
      logger.warn('OffscreenCanvas 压缩失败，降级为 HTMLCanvasElement', err);
    }
  }

  // 降级为离屏 HTMLCanvasElement
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 HTMLCanvasElement 2D 上下文');
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('HTMLCanvasElement 导出 Blob 为空'));
        }
      },
      'image/webp',
      safeQuality,
    );
  });
}

/**
 * 核心压缩函数：
 * 1. 过滤动图与矢量图；
 * 2. 长边最大限制 1920px 等比缩放；
 * 3. 初始 0.82 质量压缩；
 * 4. 若 > 150KB，阶梯降级 [0.70, 0.60] 重试，保底不低于 0.55；
 * 5. 导出 WebP File。
 */
export async function compressImageToWebp(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<CompressionResult> {
  const originalSize = file.size;

  // 1. 跳过 GIF/SVG 或不受支持的格式
  if (shouldSkipCompression(file)) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      wasCompressed: false,
      mimeType: file.type || 'application/octet-stream',
    };
  }

  const maxDimension = options.maxDimension ?? 1920;
  const initialQuality = options.initialQuality ?? 0.82;
  const maxSizeBytes = options.maxSizeBytes ?? 120 * 1024; // 120 KB
  const qualityStepDown = options.qualityStepDown ?? [0.68];
  const minQuality = options.minQuality ?? 0.55;

  if (file.size > 25 * 1024 * 1024) {
    throw new Error(`图片体积过大 (${(file.size / (1024 * 1024)).toFixed(1)}MB)，限制单张最大为 25MB`);
  }

  const imageSource = await loadImageSource(file);

  try {
    const origWidth = imageSource.width;
    const origHeight = imageSource.height;

    // 2. 长边最大 1920px 等比缩放
    const scaled = calculateScaledDimensions(origWidth, origHeight, maxDimension);
    const targetWidth = scaled.width;
    const targetHeight = scaled.height;

    // 3. 自适应阶梯压缩策略
    let currentBlob = await renderToWebpBlob(
      imageSource.source,
      targetWidth,
      targetHeight,
      initialQuality,
    );

    // 4. 若仍大于 150KB，阶梯递减重试一次
    if (currentBlob.size > maxSizeBytes) {
      for (const stepQuality of qualityStepDown) {
        const candidateQuality = Math.max(stepQuality, minQuality);
        const candidateBlob = await renderToWebpBlob(
          imageSource.source,
          targetWidth,
          targetHeight,
          candidateQuality,
        );

        if (candidateBlob.size < currentBlob.size) {
          currentBlob = candidateBlob;
        }

        // 已经达标，提前退出阶梯
        if (candidateBlob.size <= maxSizeBytes) {
          break;
        }
      }
    }

    // 格式化输出文件名：保持原名，仅更换后缀为 .webp
    const baseName = file.name.replace(/\.[^.]+$/, '') || `image-${Date.now()}`;
    const newFileName = `${baseName}.webp`;

    const compressedFile = new File([currentBlob], newFileName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      width: targetWidth,
      height: targetHeight,
      wasCompressed: true,
      mimeType: 'image/webp',
    };
  } finally {
    imageSource.close();
  }
}

/**
 * 从剪贴板粘贴或拖拽事件中提取图片文件
 */
export function extractImagesFromEvent(
  e: React.ClipboardEvent | React.DragEvent | ClipboardEvent | DragEvent,
): File[] {
  const files: File[] = [];

  // 处理剪贴板事件
  if ('clipboardData' in e && e.clipboardData) {
    const items = e.clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    // 兜底剪贴板 files
    if (files.length === 0 && e.clipboardData.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const f = e.clipboardData.files[i];
        if (f.type.startsWith('image/')) {
          files.push(f);
        }
      }
    }
  }

  // 处理拖拽事件
  if ('dataTransfer' in e && e.dataTransfer) {
    const dtFiles = e.dataTransfer.files;
    if (dtFiles && dtFiles.length > 0) {
      for (let i = 0; i < dtFiles.length; i++) {
        const f = dtFiles[i];
        if (f.type.startsWith('image/')) {
          files.push(f);
        }
      }
    }
  }

  return files;
}
