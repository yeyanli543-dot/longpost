import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAccessCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @IsIn(['admin', 'editor', 'user'])
  role?: 'admin' | 'editor' | 'user';

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'disabled', 'expired', 'exhausted'])
  status?: 'active' | 'disabled' | 'expired' | 'exhausted';

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
}
