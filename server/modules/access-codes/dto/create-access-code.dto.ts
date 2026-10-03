import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAccessCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nickname!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsString()
  @IsIn(['admin', 'editor', 'user'])
  role!: 'admin' | 'editor' | 'user';

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code?: string;
}
