import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import type { SetPasswordRequest } from '@shared/api.interface';

export class SetPasswordDto implements SetPasswordRequest {
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @IsOptional()
  @IsString()
  oldPassword?: string;
}

