import { IsString, IsIn, IsOptional, IsUUID, Length } from 'class-validator';
import type { CreateCommentRequest } from '@shared/api.interface';

export class CreateCommentDto implements CreateCommentRequest {
  @IsString()
  @IsIn(['post', 'article'])
  contentType!: 'post' | 'article';

  @IsString()
  @IsUUID()
  contentId!: string;

  @IsString()
  @Length(1, 500)
  body!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
