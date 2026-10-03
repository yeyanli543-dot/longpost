import { IsString, MinLength, MaxLength } from 'class-validator';
import type { SetPasswordRequest } from '@shared/api.interface';

export class SetPasswordDto implements SetPasswordRequest {
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;
}
