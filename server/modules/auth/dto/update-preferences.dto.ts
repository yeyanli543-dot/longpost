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
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsString()
  @IsIn(['small', 'medium', 'large'])
  fontSize?: 'small' | 'medium' | 'large';
}
