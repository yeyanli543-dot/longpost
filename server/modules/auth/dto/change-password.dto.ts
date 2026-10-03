import { IsString, MinLength, MaxLength } from 'class-validator';
import type { ChangePasswordRequest } from '@shared/api.interface';

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(100)
  newPassword!: string;
}
