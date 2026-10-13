import { IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';
import type { UpdatePreferencesRequest } from '@shared/api.interface';

export class UpdatePreferencesDto implements UpdatePreferencesRequest {
  @IsOptional()
  @IsBoolean()
  notifyOnRead?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnDelete?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark', 'system', 'oled', 'sepia', 'nord', 'forest', 'lavender'])
  theme?: 'light' | 'dark' | 'system' | 'oled' | 'sepia' | 'nord' | 'forest' | 'lavender';

  @IsOptional()
  @IsString()
  @IsIn(['small', 'medium', 'large', 'xlarge'])
  fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
}
