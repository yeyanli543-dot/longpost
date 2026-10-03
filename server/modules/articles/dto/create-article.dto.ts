import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import type { CreateArticleRequest } from '@shared/api.interface';

export class ArticleImageDto {
  @IsString()
  @MaxLength(1000)
  imageUrl!: string;

  @IsNumber()
  sortOrder!: number;
}

export class ArticleAttachmentDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(1000)
  fileUrl!: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fileType?: string;

  @IsNumber()
  sortOrder!: number;
}

export class CreateArticleDto implements CreateArticleRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(['published', 'draft'])
  status?: 'published' | 'draft';

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ArticleImageDto)
  @ArrayMaxSize(20)
  images?: ArticleImageDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ArticleAttachmentDto)
  @ArrayMaxSize(10)
  attachments?: ArticleAttachmentDto[];
}
