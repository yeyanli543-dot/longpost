import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { ArticleImageDto, ArticleAttachmentDto } from './create-article.dto';

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

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
