import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join, relative, sep } from 'path';
import { randomBytes } from 'crypto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { uploadConfig } from '../../config/upload.config';

/** 可以直接当图片展示的后缀 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);

/** 允许作为文档附件上传的后缀 */
const FILE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.zip',
  '.rar',
  '.7z',
  '.mp3',
  '.mp4',
  '.mov',
  '.webm',
]);

/**
 * 刻意不收录 .svg：SVG 可以内嵌脚本，若与站点同源托管，打开即等于 XSS。
 * 需要矢量图请先导出成 PNG。
 */
const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...FILE_EXTENSIONS]);

export interface UploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  isImage: boolean;
}

@Controller('api/upload')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // 按年月分桶，避免单目录堆积过多文件
        destination: (_req, _file, cb) => {
          const now = new Date();
          const bucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
          const dir = join(uploadConfig.dir, bucket);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        // 文件名完全不采信用户输入，只用随机串 + 白名单后缀，天然免疫路径穿越
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
        },
      }),
      limits: { fileSize: uploadConfig.maxSize },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          cb(new BadRequestException(`不支持的文件类型：${ext || '未知后缀'}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file?: Express.Multer.File): UploadResult {
    if (!file) {
      throw new BadRequestException('没有收到文件');
    }

    const ext = extname(file.originalname).toLowerCase();
    const relativePath = relative(uploadConfig.dir, file.path).split(sep).join('/');

    return {
      url: `${uploadConfig.urlPrefix}/${relativePath}`,
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
      isImage: IMAGE_EXTENSIONS.has(ext),
    };
  }
}
