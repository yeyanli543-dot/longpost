import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import type { CreatePostRequest } from '@shared/api.interface';

export class CreatePostDto implements CreatePostRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  content!: string;

  @IsOptional()
  @IsString()
  articleId?: string;
}
